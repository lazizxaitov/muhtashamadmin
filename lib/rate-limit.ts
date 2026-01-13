type RateLimitOptions = {
  limit: number;
  windowMs: number;
};

type RateEntry = {
  count: number;
  resetAt: number;
};

const store = new Map<string, RateEntry>();

const getClientKey = (request: Request) => {
  const forwardedFor = request.headers.get("x-forwarded-for") ?? "";
  const first = forwardedFor.split(",")[0]?.trim();
  const realIp = request.headers.get("x-real-ip") ?? "";
  return first || realIp || "unknown";
};

export const isRateLimited = (request: Request, options: RateLimitOptions) => {
  const key = getClientKey(request);
  const now = Date.now();
  const existing = store.get(key);

  if (!existing || existing.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + options.windowMs });
    return false;
  }

  if (existing.count >= options.limit) {
    return true;
  }

  existing.count += 1;
  store.set(key, existing);
  return false;
};
