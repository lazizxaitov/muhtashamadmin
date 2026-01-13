import { NextResponse } from "next/server";
import db from "@/lib/db";
import { hashClientPassword } from "@/lib/client-auth";
import { createClientToken } from "@/lib/client-jwt";
import { isRateLimited } from "@/lib/rate-limit";

export async function POST(request: Request) {
  if (isRateLimited(request, { limit: 10, windowMs: 60_000 })) {
    return NextResponse.json({ ok: false }, { status: 429 });
  }
  const body = (await request.json()) as {
    phone?: string;
    password?: string;
    name?: string;
  };

  const normalizePhone = (value: string) => {
    const digits = value.replace(/\D/g, "");
    if (!digits) return "";
    if (digits.startsWith("998") && digits.length === 12) {
      return `+${digits}`;
    }
    if (digits.length === 9) {
      return `+998${digits}`;
    }
    return value.trim();
  };

  const phone = normalizePhone(body?.phone ?? "");
  const password = (body?.password ?? "").trim();
  const name = (body?.name ?? "").trim();

  if (!phone || !password || !name) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const existing = await db.get<{ id: number }>(
    "SELECT id FROM clients WHERE phone = ?",
    [phone]
  );
  if (existing) {
    return NextResponse.json({ ok: false }, { status: 409 });
  }

  const { salt, hash } = hashClientPassword(password);
  const createdAt = new Date().toISOString();

  const result = await db.get<{ id: number }>(
    "INSERT INTO clients (phone, name, password_hash, password_salt, created_at) VALUES (?, ?, ?, ?, ?) RETURNING id",
    [phone, name, hash, salt, createdAt]
  );

  const accessToken = createClientToken({
    sub: Number(result?.id),
    phone,
    name,
  });
  if (!accessToken) {
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    accessToken,
    client: {
      id: result?.id,
      phone,
      name,
    },
  });
}
