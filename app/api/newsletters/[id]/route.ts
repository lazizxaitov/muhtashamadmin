import { NextResponse } from "next/server";
import db from "@/lib/db";
import { hasPermission, isAuthorized } from "@/lib/api-auth";

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

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  if (!(await hasPermission(request, "edit_restaurants"))) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }

  const { id } = await context.params;
  const idNumber = Number(id);
  if (!Number.isFinite(idNumber) || idNumber <= 0) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  await ensureNewslettersTable();
  const now = new Date().toISOString();
  await db.run(
    "UPDATE newsletters SET deleted_at = ? WHERE id = ?",
    [now, idNumber]
  );
  return NextResponse.json({ ok: true });
}

