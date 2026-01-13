import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { isAuthorized } from "@/lib/api-auth";
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

const parseFees = (value: string | null) => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const buildFeesComment = (
  base: string,
  fees: Array<{ title: string; price: number }>
) => {
  if (fees.length === 0) return base;
  const parts = fees.map((fee) => `${fee.title}: ${fee.price}`);
  const suffix = `Fees: ${parts.join(", ")}`;
  if (!base.trim()) return suffix;
  if (base.includes("Fees:")) return base;
  return `${base} | ${suffix}`;
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

export async function POST(request: NextRequest, context: RouteContext) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  await ensureOrdersTable();
  const { id } = await context.params;
  const orderId = Number(id);
  if (!Number.isFinite(orderId)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const order = await db.get<{
    id: number;
    restaurant_id: number;
    client_id: number | null;
    client_name: string | null;
    client_phone: string | null;
    items_json: string;
    comment: string | null;
    delivery_price: number | null;
    service_mode: number | null;
    fees_json: string | null;
  }>(
    `SELECT id, restaurant_id, client_id, client_name, client_phone, items_json, comment,
            delivery_price, service_mode, fees_json
     FROM orders WHERE id = ?`,
    [orderId]
  );
  if (!order) {
    return NextResponse.json({ ok: false }, { status: 404 });
  }

  const restaurant = await db.get<{
    token_poster: string | null;
    spot_id: string | null;
    integration_type: string | null;
  }>(
    "SELECT token_poster, spot_id, integration_type FROM restaurants WHERE id = ?",
    [order.restaurant_id]
  );

  if (!restaurant || (restaurant.integration_type ?? "poster") !== "poster") {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const token = (restaurant.token_poster ?? "").trim();
  const spotId = Number(restaurant.spot_id ?? "");
  if (!token || !Number.isFinite(spotId)) {
    return NextResponse.json({ ok: false }, { status: 400 });
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

  await ensurePosterClientsTable();
  let posterClientId = "";
  if (order.client_id) {
    const existingPoster = await db.get<{ poster_client_id: string }>(
      "SELECT poster_client_id FROM poster_clients WHERE client_id = ? AND restaurant_id = ?",
      [order.client_id, order.restaurant_id]
    );
    posterClientId = existingPoster?.poster_client_id ?? "";
    if (!posterClientId && order.client_phone) {
      const created = await createPosterClient(
        token,
        order.client_phone,
        order.client_name ?? ""
      );
      if (created.ok && created.id) {
        posterClientId = created.id;
        const now = new Date().toISOString();
        await db.run(
          "INSERT INTO poster_clients (client_id, restaurant_id, poster_client_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
          [order.client_id, order.restaurant_id, posterClientId, now, now]
        );
      }
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
  const fees = parseFees(order.fees_json) as Array<{
    title: string;
    price: number;
  }>;
  const comment = buildFeesComment(order.comment ?? "", fees);
  params.set("comment", comment || "Order from app");
  posterProducts.forEach((product, index) => {
    params.set(`products[${index}][product_id]`, String(product.product_id));
    params.set(`products[${index}][count]`, String(product.count));
    params.set(
      `products[${index}][price]`,
      String(Math.round(product.price * 100))
    );
  });

  const response = await fetchWithTimeout(
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

  const data = await response.json().catch(() => null);
  const apiError = extractPosterError(data);
  const posterMeta = extractPosterIncomingMeta(data);
  if (!response.ok || apiError) {
    await updateOrderStatus({
      orderId,
      status: "failed",
      error: data,
      updatedAt: new Date().toISOString(),
    });
    return NextResponse.json({
      ok: false,
      error: apiError ? { message: apiError, raw: data } : data,
    });
  }

  await updateOrderStatus({
    orderId,
    status: "sent",
    payload: data,
    updatedAt: new Date().toISOString(),
  });
  if (posterMeta.id || posterMeta.status !== null || posterMeta.updatedAt) {
    await db.run(
      "UPDATE orders SET poster_incoming_id = ?, poster_status = ?, poster_updated_at = ? WHERE id = ?",
      [posterMeta.id || null, posterMeta.status, posterMeta.updatedAt, orderId]
    );
  }

  return NextResponse.json({ ok: true, poster: data });
}
