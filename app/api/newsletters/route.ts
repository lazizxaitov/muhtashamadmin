import { isAuthorized } from "@/lib/api-auth";
import db from "@/lib/db";
import { NextResponse } from "next/server";

const ensureNewslettersTable = async () => {
  await db.run(
    `CREATE TABLE IF NOT EXISTS newsletters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      image TEXT,
      channel TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      delivered_at TEXT,
      error TEXT
    )`
  );
  const columns = await db.all<{ name: string }>("PRAGMA table_info(newsletters)");
  const names = new Set(columns.map((column) => column.name));
  if (!names.has("deleted_at")) {
    await db.run("ALTER TABLE newsletters ADD COLUMN deleted_at TEXT");
  }
};

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  await ensureNewslettersTable();

  const url = new URL(request.url);
  const channel = url.searchParams.get("channel") ?? "";
  const status = url.searchParams.get("status") ?? "";
  const markDelivered = url.searchParams.get("markDelivered") === "1";

  const filters: string[] = [];
  const values: Array<string> = [];

  filters.push("deleted_at IS NULL");

  if (channel === "splash" || channel === "push") {
    filters.push("channel = ?");
    values.push(channel);
  }
  if (status) {
    filters.push("status = ?");
    values.push(status);
  }

  const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const rows = await db.all<{
    id: number;
    title: string;
    message: string;
    image: string | null;
    channel: string;
    status: string;
    created_at: string;
    delivered_at: string | null;
    error: string | null;
  }>(`SELECT id, title, message, image, channel, status, created_at, delivered_at, error FROM newsletters ${whereClause} ORDER BY created_at DESC`, values);

  if (markDelivered && channel === "splash" && rows.length > 0) {
    const now = new Date().toISOString();
    const ids = rows
      .filter((row) => row.status !== "delivered")
      .map((row) => row.id);
    if (ids.length) {
      const placeholders = ids.map(() => "?").join(", ");
      await db.run(
        `UPDATE newsletters SET status = 'delivered', delivered_at = ? WHERE id IN (${placeholders})`,
        [now, ...ids]
      );
      rows.forEach((row) => {
        if (ids.includes(row.id)) {
          row.status = "delivered";
          row.delivered_at = now;
        }
      });
    }
  }

  const data = rows.map((row) => ({
    id: row.id,
    title: row.title,
    message: row.message,
    image: row.image,
    channel: row.channel,
    status: row.status,
    createdAt: row.created_at,
    deliveredAt: row.delivered_at,
    error: row.error,
  }));

  return NextResponse.json(data);
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  await ensureNewslettersTable();

  const body = (await request.json()) as {
    title?: string;
    message?: string;
    image?: string;
    channel?: string;
  };

  const title = body.title?.trim() ?? "";
  const message = body.message?.trim() ?? "";
  const channel = body.channel?.trim() ?? "";
  const image = body.image?.trim() ?? "";

  if (!title || !message || !channel) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  if (channel !== "splash" && channel !== "push") {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const createdAt = new Date().toISOString();
  const inserted = await db.get<{ id: number }>(
    "INSERT INTO newsletters (title, message, image, channel, status, created_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING id",
    [title, message, image, channel, "queued", createdAt]
  );

  return NextResponse.json({
    ok: true,
    id: inserted?.id ?? 0,
    createdAt,
    status: "queued",
  });
}
