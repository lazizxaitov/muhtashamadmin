import { NextResponse } from "next/server";
import db from "@/lib/db";
import { getClientAuth } from "@/lib/api-auth";
import { hashClientPassword, verifyClientPassword } from "@/lib/client-auth";

export async function POST(request: Request) {
  const client = getClientAuth(request);
  if (!client) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const body = (await request.json()) as {
    oldPassword?: string;
    newPassword?: string;
  };
  const oldPassword = (body?.oldPassword ?? "").trim();
  const newPassword = (body?.newPassword ?? "").trim();
  if (!oldPassword || !newPassword) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const row = await db.get<{
    password_hash: string | null;
    password_salt: string | null;
  }>("SELECT password_hash, password_salt FROM clients WHERE id = ?", [
    client.sub,
  ]);
  if (!row?.password_hash || !row?.password_salt) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const valid = verifyClientPassword(
    oldPassword,
    row.password_salt,
    row.password_hash
  );
  if (!valid) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const { salt, hash } = hashClientPassword(newPassword);
  await db.run(
    "UPDATE clients SET password_hash = ?, password_salt = ? WHERE id = ?",
    [hash, salt, client.sub]
  );

  return NextResponse.json({ ok: true });
}
