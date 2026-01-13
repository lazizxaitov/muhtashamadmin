import { NextResponse } from "next/server";
import db from "@/lib/db";
import { hasPermission, isAuthorized } from "@/lib/api-auth";

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
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  if (!(await hasPermission(request, "edit_restaurants"))) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }

  await ensureSettingsTable();
  const rows = await db.all<{ key: string; value: string | null }>(
    "SELECT key, value FROM app_settings WHERE key IN (?, ?, ?)",
    ["plum_base_url", "plum_login", "plum_password"]
  );
  const map = new Map(rows.map((row) => [row.key, row.value ?? ""]));
  return NextResponse.json({
    ok: true,
    baseUrl: map.get("plum_base_url") ?? "",
    login: map.get("plum_login") ?? "",
    password: map.get("plum_password") ?? "",
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
    baseUrl?: string;
    login?: string;
    password?: string;
  };
  const baseUrl = (body?.baseUrl ?? "").trim();
  const login = (body?.login ?? "").trim();
  const password = (body?.password ?? "").trim();

  await ensureSettingsTable();
  const now = new Date().toISOString();
  const entries: Array<[string, string]> = [
    ["plum_base_url", baseUrl],
    ["plum_login", login],
    ["plum_password", password],
  ];
  for (const [key, value] of entries) {
    await db.run(
      "INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
      [key, value, now]
    );
  }

  return NextResponse.json({ ok: true, baseUrl, login });
}
