import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { isAuthorized } from "@/lib/api-auth";

type RouteContext = {
  params: Promise<{ id: string }>;
};

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

const extractPosterError = (data: unknown) => {
  if (!data || typeof data !== "object") return "";
  const record = data as Record<string, unknown>;
  const error =
    record.error ??
    record.error_code ??
    record.error_message ??
    record.message ??
    "";
  if (typeof error === "string") return error.trim();
  if (typeof error === "number") return String(error);
  if (error && typeof error === "object") {
    const message = (error as Record<string, unknown>).message;
    if (typeof message === "string") return message.trim();
  }
  return "";
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

const findPosterClientIdByPhone = async (token: string, phone: string) => {
  const url = new URL("https://joinposter.com/api/clients.getClients");
  url.searchParams.set("token", token);
  url.searchParams.set("phone", phone);
  url.searchParams.set("num", "1");
  url.searchParams.set("offset", "0");

  const response = await fetchWithTimeout(url.toString(), { method: "GET" }, 8000);
  const data = await response.json().catch(() => null);
  if (!response.ok) return "";
  const list = (data as { response?: Array<{ client_id?: string | number }> } | null)
    ?.response;
  const first = Array.isArray(list) ? list[0]?.client_id : undefined;
  if (typeof first === "number" || typeof first === "string") {
    const id = String(first).trim();
    return id ? id : "";
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
  const found = await findPosterClientIdByPhone(token, phone);
  if (found) {
    const now = new Date().toISOString();
    await db.run(
      "INSERT INTO poster_clients (client_id, restaurant_id, poster_client_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
      [clientId, restaurantId, found, now, now]
    );
    return found;
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

export async function GET(request: NextRequest, context: RouteContext) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const { id } = await context.params;
  const clientId = Number(id);
  if (!Number.isFinite(clientId)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const url = new URL(request.url);
  const restaurantId = Number(url.searchParams.get("restaurantId") ?? "");
  if (!Number.isFinite(restaurantId)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const restaurant = await db.get<{
    token_poster: string | null;
    integration_type: string | null;
  }>(
    "SELECT token_poster, integration_type FROM restaurants WHERE id = ?",
    [restaurantId]
  );
  if (!restaurant || (restaurant.integration_type ?? "poster") !== "poster") {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const token = (restaurant.token_poster ?? "").trim();
  if (!token) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const client = await db.get<{ phone: string; name: string | null }>(
    "SELECT phone, name FROM clients WHERE id = ?",
    [clientId]
  );
  if (!client) {
    return NextResponse.json({ ok: false }, { status: 404 });
  }

  const posterClientId = await getPosterClientId(
    clientId,
    restaurantId,
    token,
    client.phone,
    client.name ?? ""
  );
  if (!posterClientId) {
    return NextResponse.json({ ok: false }, { status: 404 });
  }

  const response = await fetchWithTimeout(
    `https://joinposter.com/api/clients.getClient?token=${encodeURIComponent(
      token
    )}&client_id=${encodeURIComponent(posterClientId)}`,
    { method: "GET" },
    8000
  );
  const data = await response.json().catch(() => null);
  const apiError = extractPosterError(data);
  if (!response.ok || apiError) {
    return NextResponse.json({ ok: false }, { status: 502 });
  }

  const bonusRaw =
    Array.isArray((data as { response?: unknown[] } | null)?.response) &&
    (data as { response?: Array<{ bonus?: string | number }> } | null)
      ?.response?.[0]?.bonus;
  const bonusValue = Number(bonusRaw ?? 0);
  const bonus = Number.isFinite(bonusValue) ? bonusValue / 100 : 0;

  return NextResponse.json({ ok: true, bonus });
}

export async function POST(request: NextRequest, context: RouteContext) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const { id } = await context.params;
  const clientId = Number(id);
  if (!Number.isFinite(clientId)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const body = (await request.json()) as {
    restaurantId?: number;
    count?: number;
  };
  const restaurantId = Number(body?.restaurantId ?? "");
  const count = Number(body?.count ?? 0);
  if (!Number.isFinite(restaurantId) || !Number.isFinite(count) || count === 0) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const restaurant = await db.get<{
    token_poster: string | null;
    integration_type: string | null;
  }>(
    "SELECT token_poster, integration_type FROM restaurants WHERE id = ?",
    [restaurantId]
  );
  if (!restaurant || (restaurant.integration_type ?? "poster") !== "poster") {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const token = (restaurant.token_poster ?? "").trim();
  if (!token) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const client = await db.get<{ phone: string; name: string | null }>(
    "SELECT phone, name FROM clients WHERE id = ?",
    [clientId]
  );
  if (!client) {
    return NextResponse.json({ ok: false }, { status: 404 });
  }

  const posterClientId = await getPosterClientId(
    clientId,
    restaurantId,
    token,
    client.phone,
    client.name ?? ""
  );
  if (!posterClientId) {
    return NextResponse.json({ ok: false }, { status: 404 });
  }

  const params = new URLSearchParams();
  params.set("client_id", posterClientId);
  params.set("count", String(Math.round(count)));

  const response = await fetchWithTimeout(
    `https://joinposter.com/api/clients.changeClientBonus?token=${encodeURIComponent(
      token
    )}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    },
    8000
  );
  const data = await response.json().catch(() => null);
  const apiError = extractPosterError(data);
  if (!response.ok || apiError) {
    return NextResponse.json({ ok: false }, { status: 502 });
  }

  const bonusValue = Number((data as { response?: number } | null)?.response ?? 0);
  const bonus = Number.isFinite(bonusValue) ? bonusValue : 0;

  return NextResponse.json({ ok: true, bonus });
}
