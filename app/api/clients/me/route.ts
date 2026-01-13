import { NextResponse } from "next/server";
import db from "@/lib/db";
import { getClientAuth } from "@/lib/api-auth";

const fetchWithTimeout = async (
  url: string,
  options: RequestInit,
  timeoutMs = 8000
) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

const ensurePosterClientsTable = async () => {
  await db.run(
    `CREATE TABLE IF NOT EXISTS poster_clients (
      client_id INTEGER NOT NULL,
      restaurant_id INTEGER NOT NULL,
      poster_client_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (client_id, restaurant_id)
    )`
  );
};

const extractPosterClientId = (data: unknown) => {
  if (!data || typeof data !== "object") return "";
  const record = data as Record<string, unknown>;
  const response = record.response;
  const candidates = [
    record.client_id,
    record.clientId,
    response && (response as Record<string, unknown>).client_id,
    response && (response as Record<string, unknown>).id,
    response &&
      (response as Record<string, unknown>).client &&
      (response as Record<string, unknown>).client &&
      (response as Record<string, unknown>).client_id,
  ];
  for (const value of candidates) {
    if (typeof value === "number" || typeof value === "string") {
      const str = String(value).trim();
      if (str) return str;
    }
  }
  return "";
};

const createPosterClient = async (
  token: string,
  phone: string,
  name: string
) => {
  const url = new URL("https://joinposter.com/api/clients.create");
  url.searchParams.set("token", token);

  const response = await fetchWithTimeout(
    url.toString(),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, client_name: name }),
    },
    8000
  );

  const data = await response.json().catch(() => null);
  if (!response.ok) return { ok: false, error: data };
  return { ok: true, id: extractPosterClientId(data), raw: data };
};

const updatePosterClient = async (
  token: string,
  posterClientId: string,
  phone: string,
  name: string
) => {
  const url = new URL("https://joinposter.com/api/clients.update");
  url.searchParams.set("token", token);

  const response = await fetchWithTimeout(
    url.toString(),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: posterClientId,
        phone,
        client_name: name,
      }),
    },
    8000
  );

  const data = await response.json().catch(() => null);
  return { ok: response.ok, data };
};

const getPosterClientId = async (
  clientId: number,
  restaurantId: number,
  token: string,
  phone: string,
  name: string
) => {
  await ensurePosterClientsTable();
  const existing = await db.get<{ poster_client_id: string }>(
    "SELECT poster_client_id FROM poster_clients WHERE client_id = ? AND restaurant_id = ?",
    [clientId, restaurantId]
  );
  if (existing?.poster_client_id) {
    return existing.poster_client_id;
  }
  const created = await createPosterClient(token, phone, name);
  if (!created.ok || !created.id) return "";
  const now = new Date().toISOString();
  await db.run(
    "INSERT INTO poster_clients (client_id, restaurant_id, poster_client_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    [clientId, restaurantId, created.id, now, now]
  );
  return created.id;
};

export async function PATCH(request: Request) {
  const client = getClientAuth(request);
  if (!client) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const body = (await request.json()) as {
    name?: string;
    restaurantId?: number;
  };
  const name = (body?.name ?? "").trim();
  const restaurantId = Number(body?.restaurantId ?? "");
  if (!name) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  await db.run("UPDATE clients SET name = ? WHERE id = ?", [name, client.sub]);
  let posterOk = false;
  if (Number.isFinite(restaurantId)) {
    const restaurant = await db.get<{
      token_poster: string | null;
      integration_type: string | null;
    }>(
      "SELECT token_poster, integration_type FROM restaurants WHERE id = ?",
      [restaurantId]
    );
    if (restaurant && (restaurant.integration_type ?? "poster") === "poster") {
      const token = (restaurant.token_poster ?? "").trim();
      const clientRow = await db.get<{ phone: string }>(
        "SELECT phone FROM clients WHERE id = ?",
        [client.sub]
      );
      if (token && clientRow?.phone) {
        const posterClientId = await getPosterClientId(
          client.sub,
          restaurantId,
          token,
          clientRow.phone,
          name
        );
        if (posterClientId) {
          const updated = await updatePosterClient(
            token,
            posterClientId,
            clientRow.phone,
            name
          );
          posterOk = updated.ok;
        }
      }
    }
  }

  return NextResponse.json({
    ok: true,
    client: { id: client.sub, name },
    posterOk,
  });
}
