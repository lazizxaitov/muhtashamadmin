import { NextResponse } from "next/server";
import db from "@/lib/db";
import { hasPermission, isAuthorized } from "@/lib/api-auth";
import { isRateLimited } from "@/lib/rate-limit";

const ensureSettingsTable = async () => {
  await db.run(
    `CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT
    )`
  );
};

export async function GET(request: Request) {
  if (isRateLimited(request, { limit: 120, windowMs: 60_000 })) {
    return NextResponse.json({ ok: false }, { status: 429 });
  }

  await ensureSettingsTable();
  const rows = await db.all<{ key: string; value: string | null }>(
    "SELECT key, value FROM app_settings WHERE key IN (?, ?, ?)",
    ["support_phone", "support_message_ru", "support_message_uz"]
  );
  const map = new Map(rows.map((row) => [row.key, row.value ?? ""]));
  return NextResponse.json({
    phone: map.get("support_phone") ?? "",
    messageRu: map.get("support_message_ru") ?? "",
    messageUz: map.get("support_message_uz") ?? "",
  });
}

export async function PATCH(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  if (!(await hasPermission(request, "edit_restaurants"))) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }

  const body = (await request.json()) as {
    phone?: string;
    messageRu?: string;
    messageUz?: string;
  };
  const phone = (body?.phone ?? "").trim();
  const messageRu = (body?.messageRu ?? "").trim();
  const messageUz = (body?.messageUz ?? "").trim();

  await ensureSettingsTable();
  const now = new Date().toISOString();
  const entries: Array<[string, string]> = [
    ["support_phone", phone],
    ["support_message_ru", messageRu],
    ["support_message_uz", messageUz],
  ];
  for (const [key, value] of entries) {
    await db.run(
      "INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
      [key, value, now]
    );
  }

  return NextResponse.json({ ok: true, phone, messageRu, messageUz });
}
