import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { isAuthorized } from "@/lib/api-auth";
import { ensureOrdersTable } from "@/lib/orders";

type DbOrderRow = {
  id: number;
  restaurant_id: number;
  restaurant_name: string | null;
  client_name: string | null;
  client_phone: string | null;
  items_json: string;
  comment: string | null;
  delivery_price: number | null;
  service_mode: number | null;
  fees_json: string | null;
  status: string;
  created_at: string;
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

const normalizeDate = (value: string | null, endOfDay = false) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  if (endOfDay) {
    date.setHours(23, 59, 59, 999);
  }
  return date.toISOString();
};

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  await ensureOrdersTable();
  const url = new URL(request.url);
  const limit = Math.min(
    Math.max(Number(url.searchParams.get("limit") ?? 10), 1),
    200
  );
  const page = Math.max(Number(url.searchParams.get("page") ?? 1), 1);
  const status = url.searchParams.get("status") ?? "";
  const restaurantParam = url.searchParams.get("restaurantId");
  const restaurantId =
    restaurantParam && restaurantParam.trim() !== ""
      ? Number(restaurantParam)
      : null;
  const search = (url.searchParams.get("q") ?? "").trim();
  const since = Number(url.searchParams.get("since") ?? "");
  const from = normalizeDate(url.searchParams.get("from"));
  const to = normalizeDate(url.searchParams.get("to"), true);

  const where: string[] = [];
  const params: Array<string | number> = [];
  if (
    status === "pending" ||
    status === "sent" ||
    status === "failed" ||
    status === "pending_payment"
  ) {
    where.push("orders.status = ?");
    params.push(status);
  } else {
    where.push("orders.status != ?");
    params.push("pending_payment");
  }
  if (restaurantId !== null && Number.isFinite(restaurantId)) {
    where.push("orders.restaurant_id = ?");
    params.push(restaurantId);
  }
  if (from) {
    where.push("orders.created_at >= ?");
    params.push(from);
  }
  if (to) {
    where.push("orders.created_at <= ?");
    params.push(to);
  }
  if (search) {
    where.push(
      "(orders.client_name LIKE ? OR orders.client_phone LIKE ? OR restaurants.name LIKE ?)"
    );
    const like = `%${search}%`;
    params.push(like, like, like);
  }
  const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const offset = (page - 1) * limit;
  const rows = await db.all<DbOrderRow>(
    `SELECT orders.id,
            orders.restaurant_id,
            restaurants.name as restaurant_name,
            orders.client_name,
            orders.client_phone,
            orders.items_json,
            orders.comment,
            orders.delivery_price,
            orders.service_mode,
            orders.fees_json,
            orders.status,
            orders.created_at
     FROM orders
     LEFT JOIN restaurants ON restaurants.id = orders.restaurant_id
     ${whereClause}
     ORDER BY orders.created_at DESC
     LIMIT ?
     OFFSET ?`,
    [...params, limit, offset]
  );

  const orders = rows.map((row) => ({
    id: row.id,
    restaurantId: row.restaurant_id,
    restaurantName: row.restaurant_name ?? "",
    clientName: row.client_name ?? "",
    clientPhone: row.client_phone ?? "",
    items: parseItems(row.items_json),
    comment: row.comment ?? "",
    deliveryPrice: row.delivery_price ?? 0,
    serviceMode: row.service_mode ?? 0,
    fees: parseFees(row.fees_json),
    status: row.status,
    createdAt: row.created_at,
  }));

  const latestId = orders[0]?.id ?? 0;
  let unseenCount: number | null = null;
  if (Number.isFinite(since)) {
    const countRow = await db.get<{ count: number }>(
      "SELECT COUNT(*) as count FROM orders WHERE id > ? AND status != ?",
      [since, "pending_payment"]
    );
    unseenCount = countRow?.count ?? 0;
  }

  const totalRow = await db.get<{ count: number }>(
    `SELECT COUNT(*) as count
     FROM orders
     LEFT JOIN restaurants ON restaurants.id = orders.restaurant_id
     ${whereClause}`,
    params
  );
  const total = totalRow?.count ?? 0;

  return NextResponse.json({ orders, latestId, unseenCount, total });
}
