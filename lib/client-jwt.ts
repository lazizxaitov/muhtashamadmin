import crypto from "crypto";

type ClientTokenPayload = {
  sub: number;
  phone: string;
  name: string;
  iat: number;
  exp: number;
};

const base64UrlEncode = (value: Buffer | string) => {
  const buffer = typeof value === "string" ? Buffer.from(value) : value;
  return buffer
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
};

const base64UrlDecode = (value: string) => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return Buffer.from(padded, "base64").toString("utf8");
};

const sign = (input: string, secret: string) =>
  crypto.createHmac("sha256", secret).update(input).digest("base64url");

const getSecret = () => (process.env.CLIENT_JWT_SECRET ?? "").trim();

export const createClientToken = (
  payload: Omit<ClientTokenPayload, "iat" | "exp">,
  ttlSeconds = 60 * 60 * 24 * 30
) => {
  const secret = getSecret();
  if (!secret) {
    return null;
  }
  const now = Math.floor(Date.now() / 1000);
  const fullPayload: ClientTokenPayload = {
    ...payload,
    iat: now,
    exp: now + ttlSeconds,
  };
  const header = { alg: "HS256", typ: "JWT" };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(fullPayload));
  const signature = sign(`${encodedHeader}.${encodedPayload}`, secret);
  return `${encodedHeader}.${encodedPayload}.${signature}`;
};

export const verifyClientToken = (token: string) => {
  const secret = getSecret();
  if (!secret) {
    return null;
  }
  const [encodedHeader, encodedPayload, signature] = token.split(".");
  if (!encodedHeader || !encodedPayload || !signature) {
    return null;
  }
  const expected = sign(`${encodedHeader}.${encodedPayload}`, secret);
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return null;
  }
  const payload = JSON.parse(base64UrlDecode(encodedPayload)) as
    | ClientTokenPayload
    | undefined;
  if (!payload || typeof payload.sub !== "number") {
    return null;
  }
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) {
    return null;
  }
  return payload;
};

export type { ClientTokenPayload };
