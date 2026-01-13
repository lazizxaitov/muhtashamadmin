import crypto from "crypto";

const HASH_KEY_LENGTH = 64;

const decodeStoredHash = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const isHex = /^[0-9a-f]+$/i.test(trimmed) && trimmed.length % 2 === 0;
  if (isHex) return Buffer.from(trimmed, "hex");
  const isBase64 =
    /^[A-Za-z0-9+/=]+$/.test(trimmed) && trimmed.length % 4 === 0;
  if (isBase64) return Buffer.from(trimmed, "base64");
  return null;
};

export const hashClientPassword = (password: string) => {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto
    .scryptSync(password, salt, HASH_KEY_LENGTH)
    .toString("hex");
  return { salt, hash };
};

export const verifyClientPassword = (
  password: string,
  salt: string,
  hash: string
) => {
  try {
    if (!salt || !hash) return false;
    const hashedBuffer = crypto.scryptSync(password, salt, HASH_KEY_LENGTH);
    const storedBuffer = decodeStoredHash(hash);
    if (!storedBuffer || storedBuffer.length !== hashedBuffer.length) {
      return false;
    }
    return crypto.timingSafeEqual(storedBuffer, hashedBuffer);
  } catch {
    return false;
  }
};
