import db from "@/lib/db";

type TelegramRestaurantSettingsRow = {
  restaurant_id: number;
  chat_id: string;
  enabled: number;
  updated_at: string;
};

const TELEGRAM_TOKEN_KEY = "telegram_bot_token";

const ensureSettingsTable = async () => {
  await db.run(
    `CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT
    )`
  );
};

export const ensureTelegramTables = async () => {
  await ensureSettingsTable();
  await db.run(
    `CREATE TABLE IF NOT EXISTS restaurant_telegram_settings (
      restaurant_id INTEGER PRIMARY KEY,
      chat_id TEXT,
      enabled INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    )`
  );
  await db.run(
    "CREATE INDEX IF NOT EXISTS restaurant_telegram_enabled_idx ON restaurant_telegram_settings(enabled)"
  );
};

export const maskTelegramToken = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.length <= 10) return `${trimmed.slice(0, 2)}…${trimmed.slice(-2)}`;
  return `${trimmed.slice(0, 6)}…${trimmed.slice(-4)}`;
};

export const normalizeTelegramChatId = (value: string) => {
  const raw = value.trim();
  if (!raw) return "";
  const withoutQuery = raw.replace(/[?#].*$/, "");
  const cleaned = withoutQuery.replace(/\/+$/, "");
  const tMeMatch = cleaned.match(/(?:https?:\/\/)?t\.me\/(.+)$/i);
  const maybe = tMeMatch?.[1] ?? cleaned;
  if (/^-?\d+$/.test(maybe)) return maybe;
  const username = maybe.startsWith("@") ? maybe : `@${maybe}`;
  return username;
};

export const getTelegramBotToken = async () => {
  await ensureSettingsTable();
  const row = await db.get<{ value: string | null }>(
    "SELECT value FROM app_settings WHERE key = ?",
    [TELEGRAM_TOKEN_KEY]
  );
  return (row?.value ?? "").trim();
};

export const setTelegramBotToken = async (token: string) => {
  await ensureSettingsTable();
  const now = new Date().toISOString();
  await db.run(
    "INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
    [TELEGRAM_TOKEN_KEY, token.trim(), now]
  );
};

export const listTelegramRestaurantSettings = async () => {
  await ensureTelegramTables();
  return await db.all<TelegramRestaurantSettingsRow>(
    "SELECT restaurant_id, chat_id, enabled, updated_at FROM restaurant_telegram_settings"
  );
};

export const upsertTelegramRestaurantSettings = async (input: {
  restaurantId: number;
  chatId: string;
  enabled: boolean;
}) => {
  await ensureTelegramTables();
  const now = new Date().toISOString();
  const normalizedChatId = normalizeTelegramChatId(input.chatId);
  await db.run(
    `INSERT INTO restaurant_telegram_settings (restaurant_id, chat_id, enabled, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(restaurant_id) DO UPDATE SET chat_id = excluded.chat_id, enabled = excluded.enabled, updated_at = excluded.updated_at`,
    [input.restaurantId, normalizedChatId, input.enabled ? 1 : 0, now]
  );
  return { chatId: normalizedChatId, enabled: input.enabled, updatedAt: now };
};

export const getTelegramSettingsForRestaurant = async (restaurantId: number) => {
  await ensureTelegramTables();
  const row = await db.get<TelegramRestaurantSettingsRow>(
    "SELECT restaurant_id, chat_id, enabled, updated_at FROM restaurant_telegram_settings WHERE restaurant_id = ?",
    [restaurantId]
  );
  if (!row) return null;
  const chatId = (row.chat_id ?? "").trim();
  if (!chatId) return null;
  return { chatId, enabled: Boolean(row.enabled) };
};

const fetchWithTimeout = async (
  url: string,
  options: RequestInit,
  timeoutMs = 8000
) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

export const sendTelegramMessage = async (input: {
  token: string;
  chatId: string;
  text: string;
}) => {
  const token = input.token.trim();
  const chatId = input.chatId.trim();
  if (!token || !chatId || !input.text.trim()) {
    return { ok: false as const, error: "Missing telegram configuration." };
  }
  const url = `https://api.telegram.org/bot${encodeURIComponent(
    token
  )}/sendMessage`;
  const response = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: input.text,
        disable_web_page_preview: true,
      }),
    },
    8000
  );
  const data = await response.json().catch(() => null);
  if (!response.ok || !(data as { ok?: boolean } | null)?.ok) {
    const description =
      (data as { description?: string } | null)?.description ??
      `HTTP ${response.status}`;
    return { ok: false as const, error: description, data };
  }
  return { ok: true as const, data };
};

export const sendTelegramOrderNotification = async (input: {
  restaurantId: number;
  orderId: number;
  restaurantName?: string;
  items: Array<{ name: string; qty: number; price: number }>;
  fees?: Array<{ title: string; price: number }>;
  deliveryPrice?: number;
  total?: number;
  clientPhone?: string;
  deliveryAddress?: string;
  comment?: string;
  status?: string;
}) => {
  try {
    const [token, settings] = await Promise.all([
      getTelegramBotToken(),
      getTelegramSettingsForRestaurant(input.restaurantId),
    ]);
    if (!token || !settings?.enabled) return;

    const lines: string[] = [];
    lines.push(`New order #${input.orderId}`);
    if (input.restaurantName) lines.push(`Restaurant: ${input.restaurantName}`);
    if (input.status) lines.push(`Status: ${input.status}`);
    if (input.clientPhone) lines.push(`Phone: ${input.clientPhone}`);
    if (input.deliveryAddress) lines.push(`Address: ${input.deliveryAddress}`);
    if (input.comment?.trim()) lines.push(`Comment: ${input.comment.trim()}`);
    lines.push("");
    lines.push("Items:");
    for (const item of input.items) {
      lines.push(`- ${item.name} × ${item.qty} = ${item.price * item.qty}`);
    }
    const fees = Array.isArray(input.fees) ? input.fees : [];
    if (fees.length > 0 || (input.deliveryPrice ?? 0) > 0) {
      lines.push("");
      if ((input.deliveryPrice ?? 0) > 0) {
        lines.push(`Delivery: ${input.deliveryPrice}`);
      }
      for (const fee of fees) {
        lines.push(`${fee.title}: ${fee.price}`);
      }
    }
    if (typeof input.total === "number") {
      lines.push("");
      lines.push(`Total: ${input.total}`);
    }

    const message = lines.join("\n").slice(0, 3900);
    const result = await sendTelegramMessage({
      token,
      chatId: settings.chatId,
      text: message,
    });
    if (!result.ok) {
      console.error("telegram:send-order-failed", {
        restaurantId: input.restaurantId,
        orderId: input.orderId,
        token: maskTelegramToken(token),
        chatId: settings.chatId,
        error: result.error,
      });
    }
  } catch (error) {
    console.error("telegram:send-order-exception", {
      restaurantId: input.restaurantId,
      orderId: input.orderId,
      message: error instanceof Error ? error.message : String(error),
    });
  }
};

