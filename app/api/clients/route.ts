import { NextResponse } from "next/server";
import db from "@/lib/db";
import { isAuthorized } from "@/lib/api-auth";

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const rows = await db.all<{
    id: number;
    phone: string;
    name: string | null;
    created_at: string;
    orders_count: number | null;
    last_order_at: string | null;
  }>("SELECT id, phone, name, created_at, orders_count, last_order_at FROM clients ORDER BY id DESC");

  return NextResponse.json(
    rows.map((row) => ({
      id: row.id,
      phone: row.phone,
      name: row.name ?? "",
      createdAt: row.created_at,
      ordersCount: row.orders_count ?? 0,
      lastOrderAt: row.last_order_at ?? "",
    }))
  );
}
