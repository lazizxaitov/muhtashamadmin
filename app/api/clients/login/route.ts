import { NextResponse } from "next/server";
import db from "@/lib/db";
import { verifyClientPassword } from "@/lib/client-auth";
import { createClientToken } from "@/lib/client-jwt";
import { isRateLimited } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    if (isRateLimited(request, { limit: 20, windowMs: 60_000 })) {
      return NextResponse.json({ ok: false }, { status: 429 });
    }
    const body = (await request.json().catch(() => null)) as
      | {
          phone?: string;
          password?: string;
        }
      | null;

    if (!body) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

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

    const phone = normalizePhone(body.phone ?? "");
    const password = (body.password ?? "").trim();

    if (!phone || !password) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    const client = await db.get<{
      id: number;
      phone: string;
      name: string | null;
      password_hash: string | null;
      password_salt: string | null;
    }>(
      "SELECT id, phone, name, password_hash, password_salt FROM clients WHERE phone = ?",
      [phone]
    );

    if (!client) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    if (!client.password_salt || !client.password_hash) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    const ok = verifyClientPassword(
      password,
      client.password_salt,
      client.password_hash
    );

    if (!ok) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    const accessToken = createClientToken({
      sub: client.id,
      phone: client.phone,
      name: client.name ?? "",
    });
    if (!accessToken) {
      console.error("clients/login: CLIENT_JWT_SECRET is missing.");
      return NextResponse.json(
        { ok: false, error: "CLIENT_JWT_SECRET is missing." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      accessToken,
      client: {
        id: client.id,
        phone: client.phone,
        name: client.name ?? "",
      },
    });
  } catch (error) {
    console.error("clients/login error", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
