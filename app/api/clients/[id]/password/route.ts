import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { isAuthorized } from "@/lib/api-auth";
import { hashClientPassword } from "@/lib/client-auth";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const { id } = await context.params;
  const clientId = Number(id);
  if (!Number.isFinite(clientId)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const body = (await request.json()) as {
    password?: string;
  };

  const password = (body?.password ?? "").trim();
  if (!password) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const existing = await db.get<{ id: number }>(
    "SELECT id FROM clients WHERE id = ?",
    [clientId]
  );
  if (!existing) {
    return NextResponse.json({ ok: false }, { status: 404 });
  }

  const { salt, hash } = hashClientPassword(password);
  await db.run(
    "UPDATE clients SET password_hash = ?, password_salt = ? WHERE id = ?",
    [hash, salt, clientId]
  );

  return NextResponse.json({ ok: true });
}
