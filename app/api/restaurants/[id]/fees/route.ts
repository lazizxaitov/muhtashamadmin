import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { isAuthorized } from "@/lib/api-auth";
import { isRateLimited } from "@/lib/rate-limit";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const isAdmin = isAuthorized(request);
  if (!isAdmin && isRateLimited(request, { limit: 120, windowMs: 60_000 })) {
    return NextResponse.json({ ok: false }, { status: 429 });
  }

  const { id } = await context.params;
  const restaurantId = Number(id);
  if (!Number.isFinite(restaurantId)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const rows = await db.all<{
    id: number;
    title: string;
    description: string;
    price: number;
    is_default: number;
  }>("SELECT id, title, description, price, is_default FROM restaurant_fees WHERE restaurant_id = ? ORDER BY is_default DESC, id ASC", [restaurantId]);

  return NextResponse.json(
    rows.map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      price: row.price,
      isDefault: Boolean(row.is_default),
    }))
  );
}

export async function POST(request: NextRequest, context: RouteContext) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const { id } = await context.params;
  const restaurantId = Number(id);
  if (!Number.isFinite(restaurantId)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const body = (await request.json()) as {
    title?: string;
    description?: string;
    price?: number;
  };

  const title = (body?.title ?? "").trim();
  const description = (body?.description ?? "").trim();
  const price = Number(body?.price ?? 0);
  if (!title || !Number.isFinite(price)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const result = await db.get<{ id: number }>(
    "INSERT INTO restaurant_fees (restaurant_id, title, description, price, is_default) VALUES (?, ?, ?, ?, 0) RETURNING id",
    [restaurantId, title, description, price]
  );

  return NextResponse.json({ ok: true, id: result?.id });
}
