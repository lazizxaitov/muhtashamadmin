import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { getClientAuth } from "@/lib/api-auth";
import { ensureOrdersTable, updateOrderStatus } from "@/lib/orders";

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

const extractPosterIncomingMeta = (data: unknown) => {
  if (!data || typeof data !== "object") return { id: "", status: null, updatedAt: null };
  const record = data as Record<string, unknown>;
  const response = record.response as Record<string, unknown> | undefined;
  const incomingId = response?.incoming_order_id;
  const status = response?.status;
  const updatedAt = response?.updated_at;
  return {
    id:
      typeof incomingId === "number" || typeof incomingId === "string"
        ? String(incomingId)
        : "",
    status: typeof status === "number" ? status : null,
    updatedAt: typeof updatedAt === "string" ? updatedAt : null,
  };
};

const parseItems = (value: string) => {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
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

const getPlumConfig = async () => {
  await db.run(
    `CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT
    )`
  );
  const settings = await db.all<{ key: string; value: string | null }>(
    "SELECT key, value FROM app_settings WHERE key IN (?, ?, ?)",
    ["plum_base_url", "plum_login", "plum_password"]
  );
  const map = new Map(settings.map((row) => [row.key, row.value ?? ""]));
  const baseUrl =
    (map.get("plum_base_url") ?? "").trim() ||
    (process.env.PAYMENT_BASE_URL ?? "").trim();
  const login = (map.get("plum_login") ?? "").trim();
  const password = (map.get("plum_password") ?? "").trim();
  const authHeader =
    login && password
      ? `Basic ${Buffer.from(`${login}:${password}`).toString("base64")}`
      : "";
  return { baseUrl, authHeader };
};

export async function POST(request: NextRequest, context: RouteContext) {
  const client = getClientAuth(request);
  if (!client) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  await ensureOrdersTable();
  const { id } = await context.params;
  const orderId = Number(id);
  if (!Number.isFinite(orderId)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const body = (await request.json()) as { otp?: string; session?: number };
  const otp = (body?.otp ?? "").trim();
  const sessionInput = Number(body?.session ?? "");
  if (!otp) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const order = await db.get<{
    id: number;
    restaurant_id: number;
    client_id: number;
    client_name: string | null;
    client_phone: string | null;
    items_json: string;
    comment: string | null;
    delivery_price: number | null;
    service_mode: number | null;
    fees_json: string | null;
    delivery_address: string | null;
    payment_method: string | null;
    payment_payload_json: string | null;
  }>(
    `SELECT id, restaurant_id, client_id, client_name, client_phone, items_json, comment,
            delivery_price, service_mode, fees_json, delivery_address,
            payment_method, payment_payload_json
     FROM orders WHERE id = ?`,
    [orderId]
  );
  if (!order || order.client_id !== client.sub) {
    return NextResponse.json({ ok: false }, { status: 404 });
  }
  if ((order.payment_method ?? "") !== "card") {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  let session = Number.isFinite(sessionInput) ? sessionInput : null;
  if (!session && order.payment_payload_json) {
    try {
      const parsed = JSON.parse(order.payment_payload_json) as {
        result?: { session?: number };
      };
      const payloadSession = Number(parsed?.result?.session ?? "");
      if (Number.isFinite(payloadSession)) {
        session = payloadSession;
      }
    } catch {
      session = null;
    }
  }
  if (!session) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const { baseUrl, authHeader } = await getPlumConfig();
  if (!baseUrl) {
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (authHeader) {
    headers.Authorization = authHeader;
  }

  const response = await fetchWithTimeout(
    `${baseUrl.replace(/\/$/, "")}/Payment/confirmPayment`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ session, otp }),
    },
    10000
  );
  const data = await response.json().catch(() => null);
  const error = (data as { error?: string } | null)?.error ?? null;
  if (!response.ok || error) {
    await db.run(
      "UPDATE orders SET payment_confirm_payload_json = ? WHERE id = ?",
      [JSON.stringify(data), orderId]
    );
    return NextResponse.json({ ok: false, error: data }, { status: 402 });
  }

  await db.run(
    "UPDATE orders SET payment_confirm_payload_json = ? WHERE id = ?",
    [JSON.stringify(data), orderId]
  );

  const restaurant = await db.get<{
    token_poster: string | null;
    spot_id: string | null;
    integration_type: string | null;
  }>(
    "SELECT token_poster, spot_id, integration_type FROM restaurants WHERE id = ?",
    [order.restaurant_id]
  );
  if (!restaurant || (restaurant.integration_type ?? "poster") !== "poster") {
    return NextResponse.json({ ok: true, payment: data });
  }

  const token = (restaurant.token_poster ?? "").trim();
  const spotId = Number(restaurant.spot_id ?? "");
  if (!token || !Number.isFinite(spotId)) {
    return NextResponse.json({ ok: true, payment: data });
  }

  const items = parseItems(order.items_json) as Array<{
    id: number;
    qty: number;
    price: number;
  }>;
  if (items.length === 0) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const itemIds = items.map((item) => Number(item.id));
  const menuRows = await db.all<{
    id: number;
    source_id: string | null;
  }>(
    `SELECT id, source_id FROM menu_items WHERE id IN (${itemIds
      .map(() => "?")
      .join(",")})`,
    itemIds
  );
  const byId = new Map(menuRows.map((row) => [row.id, row]));
  const posterProducts = [];
  for (const item of items) {
    const row = byId.get(Number(item.id));
    if (!row || !row.source_id) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }
    posterProducts.push({
      product_id: Number(row.source_id),
      count: Number(item.qty),
      price: Number(item.price),
    });
  }

  let posterClientId = "";
  if (order.client_id) {
    const clientRow = await db.get<{ phone: string; name: string | null }>(
      "SELECT phone, name FROM clients WHERE id = ?",
      [order.client_id]
    );
    if (clientRow?.phone) {
      posterClientId = await getPosterClientId(
        order.client_id,
        order.restaurant_id,
        token,
        clientRow.phone,
        clientRow.name ?? order.client_name ?? ""
      );
    }
  }

  const params = new URLSearchParams();
  params.set("spot_id", String(spotId));
  if (posterClientId) {
    params.set("client_id", posterClientId);
  } else if (order.client_phone) {
    params.set("phone", order.client_phone);
    if (order.client_name) {
      params.set("first_name", order.client_name);
    }
  }
  if (order.service_mode) {
    params.set("service_mode", String(order.service_mode));
  }
  if (order.delivery_price && order.delivery_price > 0) {
    params.set(
      "delivery_price",
      String(Math.round(order.delivery_price * 100))
    );
  }
  if (order.delivery_address) {
    params.set("client_address[address1]", order.delivery_address);
  }
  params.set("comment", (order.comment ?? "").trim() || "Order from app");
  posterProducts.forEach((product, index) => {
    params.set(`products[${index}][product_id]`, String(product.product_id));
    params.set(`products[${index}][count]`, String(product.count));
    params.set(
      `products[${index}][price]`,
      String(Math.round(product.price * 100))
    );
  });

  const posterResponse = await fetchWithTimeout(
    `https://joinposter.com/api/incomingOrders.createIncomingOrder?token=${encodeURIComponent(
      token
    )}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    },
    10000
  );
  const posterData = await posterResponse.json().catch(() => null);
  const posterError = extractPosterError(posterData);
  if (!posterResponse.ok || posterError) {
    await updateOrderStatus({
      orderId,
      status: "failed",
      error: posterData,
      updatedAt: new Date().toISOString(),
    });
    return NextResponse.json({
      ok: false,
      payment: data,
      error: posterData,
    });
  }

  const posterMeta = extractPosterIncomingMeta(posterData);
  await updateOrderStatus({
    orderId,
    status: "sent",
    payload: posterData,
    updatedAt: new Date().toISOString(),
  });
  if (posterMeta.id || posterMeta.status !== null || posterMeta.updatedAt) {
    await db.run(
      "UPDATE orders SET poster_incoming_id = ?, poster_status = ?, poster_updated_at = ? WHERE id = ?",
      [posterMeta.id || null, posterMeta.status, posterMeta.updatedAt, orderId]
    );
  }

  return NextResponse.json({ ok: true, payment: data, poster: posterData });
}
