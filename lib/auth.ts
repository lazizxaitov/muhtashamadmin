import crypto from "crypto";

const COOKIE_NAME = "admin_session";

const base64Url = (input: Buffer) =>
  input
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

const sign = (data: string, secret: string) => {
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(data);
  return base64Url(hmac.digest());
};

export const getSessionCookieName = () => COOKIE_NAME;

export const createSessionToken = (
  login: string,
  secret: string,
  ttlSeconds: number
) => {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const data = `${login}.${exp}`;
  const signature = sign(data, secret);
  return `${data}.${signature}`;
};

export const verifySessionToken = (token: string, secret: string) => {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [login, expRaw, signature] = parts;
  const exp = Number(expRaw);
  if (!login || !exp || !signature) return null;

  const data = `${login}.${exp}`;
  const expected = sign(data, secret);
  const expectedBuf = Buffer.from(expected);
  const signatureBuf = Buffer.from(signature);

  if (expectedBuf.length !== signatureBuf.length) return null;
  if (!crypto.timingSafeEqual(expectedBuf, signatureBuf)) return null;
  if (exp < Math.floor(Date.now() / 1000)) return null;

  return { login };
};
