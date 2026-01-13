import { NextResponse } from "next/server";
import db from "@/lib/db";
import { isAuthorized } from "@/lib/api-auth";
import { isRateLimited } from "@/lib/rate-limit";

export async function GET(request: Request) {
  const isAdmin = isAuthorized(request);
  if (!isAdmin && isRateLimited(request, { limit: 120, windowMs: 60_000 })) {
    return NextResponse.json({ ok: false }, { status: 429 });
  }

  const url = new URL(request.url);
  const activeOnly = url.searchParams.get("active") === "1";

  const rows = await db.all<{
    id: number;
    title: string;
    image: string;
    status: string;
    open: number;
    added_at: string;
    sort_order: number;
  }>(`SELECT id, title, image, status, open, added_at, sort_order FROM banners ${
        activeOnly ? "WHERE open = 1" : ""
      } ORDER BY sort_order ASC, id ASC`);

  return NextResponse.json(
    rows.map((row) => ({
      ...row,
      open: Boolean(row.open),
      addedAt: row.added_at,
      sortOrder: row.sort_order,
    }))
  );
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const body = await request.json();
  const title = (body?.title ?? "").trim();

  if (!title) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const image = (body?.image ?? "/logo_green.png").trim();
  const status = (body?.status ?? "Активен").trim();
  const open = status === "Активен" ? 1 : 0;
  const addedAt =
    (body?.addedAt ?? new Date().toISOString().slice(0, 10)).trim();
  const maxRow = await db.get<{ max_order: number | null }>(
    "SELECT MAX(sort_order) as max_order FROM banners"
  );
  const sortOrder = (maxRow?.max_order ?? 0) + 1;

  const result = await db.get<{ id: number }>(
    `INSERT INTO banners (title, image, status, sort_order, open, added_at)
     VALUES (?, ?, ?, ?, ?, ?)
     RETURNING id`,
    [title, image, status, sortOrder, open, addedAt]
  );

  return NextResponse.json({ ok: true, id: result?.id });
}
