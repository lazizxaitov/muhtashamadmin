import { NextResponse } from "next/server";
import db from "@/lib/db";
import { isAuthorized } from "@/lib/api-auth";

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const body = await request.json();
  const ids = Array.isArray(body?.ids) ? body.ids : [];
  if (!ids.length || !ids.every((id: number) => Number.isFinite(id))) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  await db.transaction(async (client) => {
    for (const [index, id] of ids.entries()) {
      await db.run(
        "UPDATE banners SET sort_order = ? WHERE id = ?",
        [index + 1, id],
        client
      );
    }
  });

  return NextResponse.json({ ok: true });
}
