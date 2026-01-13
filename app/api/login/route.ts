import { NextResponse } from "next/server";
import crypto from "crypto";
import { createSessionToken, getSessionCookieName } from "@/lib/auth";
import db from "@/lib/db";
import { verifyClientPassword } from "@/lib/client-auth";

export async function POST(request: Request) {
  const forwardedProto = request.headers.get("x-forwarded-proto") ?? "";
  const isHttps =
    forwardedProto.split(",")[0]?.trim().toLowerCase() === "https";

  const body = await request.json();
  const login = typeof body?.login === "string" ? body.login : "";
  const password = typeof body?.password === "string" ? body.password : "";

  const adminLogin = process.env.ADMIN_LOGIN ?? "";
  const adminSalt = process.env.ADMIN_PASSWORD_SALT ?? "";
  const adminHash = process.env.ADMIN_PASSWORD_HASH ?? "";

  if (login === adminLogin && adminSalt && adminHash) {
    const salt = Buffer.from(adminSalt, "base64");
    const hash = crypto.scryptSync(password, salt, 64);
    const storedHash = Buffer.from(adminHash, "base64");

    if (
      storedHash.length === hash.length &&
      crypto.timingSafeEqual(storedHash, hash)
    ) {
      const secret = process.env.ADMIN_SESSION_SECRET ?? "";
      if (!secret) {
        return NextResponse.json({ ok: false }, { status: 500 });
      }

      const token = createSessionToken(login, secret, 60 * 60 * 8);
      const response = NextResponse.json({ ok: true });
      response.cookies.set(getSessionCookieName(), token, {
        httpOnly: true,
        sameSite: "lax",
        secure: isHttps,
        path: "/",
        maxAge: 60 * 60 * 8,
      });

      return response;
    }
  }

  const employee = await db.get<{
    id: number;
    login: string;
    password_hash: string | null;
    password_salt: string | null;
  }>("SELECT id, login, password_hash, password_salt FROM employees WHERE login = ?", [login]);

  if (employee && employee.password_hash && employee.password_salt) {
    const ok = verifyClientPassword(
      password,
      employee.password_salt,
      employee.password_hash
    );
    if (ok) {
      const secret = process.env.ADMIN_SESSION_SECRET ?? "";
      if (!secret) {
        return NextResponse.json({ ok: false }, { status: 500 });
      }

      const token = createSessionToken(login, secret, 60 * 60 * 8);
      const response = NextResponse.json({ ok: true });
      response.cookies.set(getSessionCookieName(), token, {
        httpOnly: true,
        sameSite: "lax",
        secure: isHttps,
        path: "/",
        maxAge: 60 * 60 * 8,
      });
      return response;
    }
  }

  return NextResponse.json({ ok: false }, { status: 401 });
}
