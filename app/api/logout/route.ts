import { NextResponse } from "next/server";
import { getSessionCookieName } from "@/lib/auth";

export async function POST(request: Request) {
  const forwardedProto = request.headers.get("x-forwarded-proto") ?? "";
  const isHttps =
    forwardedProto.split(",")[0]?.trim().toLowerCase() === "https";

  const response = NextResponse.json({ ok: true });
  response.cookies.set(getSessionCookieName(), "", {
    httpOnly: true,
    sameSite: "lax",
    secure: isHttps,
    path: "/",
    maxAge: 0,
  });
  return response;
}
