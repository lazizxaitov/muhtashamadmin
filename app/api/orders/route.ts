import { NextResponse } from "next/server";
import db from "@/lib/db";
import { getClientAuth } from "@/lib/api-auth";
import { sendTelegramOrderNotification } from "@/lib/telegram";
import {
  createOrder,
  ensureOrdersTable,
  type StoredOrderItem,
  updateOrderStatus,
} from "@/lib/orders";

type OrderItemInput = {
  productId: string | number;
  qty: number;
  price?: number;
};

type OrderFeeInput = {
  title?: string;
  price?: number;
};

const parseItems = (value: string) => {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const parseFees = (value: string) => {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const normalizeFeeTitle = (value: string) => value.trim().toLowerCase();

const isDeliveryFeeTitle = (value: string) => {
  const title = normalizeFeeTitle(value);
  const deliveryKeywords = [
    "delivery",
    "yetkaz",
    "dostav",
    "dostavka",
    "достав",
  ];
  return deliveryKeywords.some((keyword) => title.includes(keyword));
};

const pickDeliveryFee = (fees: Array<{ title: string; price: number }>) => {
  for (const fee of fees) {
    if (isDeliveryFeeTitle(fee.title)) {
      return fee;
    }
  }
  return null;
};

const buildFeesComment = (
  base: string,
  fees: Array<{ title: string; price: number }>
) => {
  if (fees.length === 0) return base;
  const parts = fees.map((fee) => `${fee.title}: ${fee.price}`);
  const suffix = `Fees: ${parts.join(", ")}`;
  if (!base.trim()) return suffix;
  if (base.includes("Fees:")) return base;
  return `${base} | ${suffix}`;
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

const ensureSettingsTable = async () => {
  await db.run(
    `CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT
    )`
  );
};

const extractPosterError = (data: unknown) => {
  if (!data || typeof data !== "object") return "";
  const record = data as Record<string, unknown>;
  const error =
    record.error ??
    record.error_code ??
    record.error_message ??
    record.message ??
    "";
  if (typeof error === "string") return error.trim();
  if (typeof error === "number") return String(error);
  if (error && typeof error === "object") {
    const message = (error as Record<string, unknown>).message;
    if (typeof message === "string") return message.trim();
  }
  return "";
};

const extractPosterIncomingMeta = (data: unknown) => {
  if (!data || typeof data !== "object") return { id: "", status: null, updatedAt: null };
  const record = data as Record<string, unknown>;
  const response = record.response as Record<string, unknown> | undefined;
  const incomingId = response?.incoming_order_id;
  const status = response?.status;
  const updatedAt = response?.updated_at;
  return {
    id:
      typeof incomingId === "number" || typeof incomingId === "string"
        ? String(incomingId)
        : "",
    status: typeof status === "number" ? status : null,
    updatedAt: typeof updatedAt === "string" ? updatedAt : null,
  };
};

const createCardPayment = async (input: {
  baseUrl: string;
  authHeader: string;
  amount: number;
  cardNumber: string;
  expireDate: string;
  extraId: string;
  transactionData?: string;
}) => {
  const url = `${input.baseUrl.replace(/\/$/, "")}/Payment/paymentWithoutRegistration`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (input.authHeader) {
    headers.Authorization = input.authHeader;
  }
  const response = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        amount: input.amount,
        cardNumber: input.cardNumber,
        expireDate: input.expireDate,
        extraId: input.extraId,
        transactionData: input.transactionData ?? "",
      }),
    },
    10000
  );
  const data = await response.json().catch(() => null);
  return { ok: response.ok, data };
};

const isValidCardNumber = (value: string) => {
  const digits = value.replace(/\s+/g, "");
  if (!/^\d{13,19}$/.test(digits)) return false;
  let sum = 0;
  let shouldDouble = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let digit = Number(digits[i]);
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
};

const isValidExpireDate = (value: string) => {
  if (!/^\d{4}$/.test(value)) return false;
  const year = Number(value.slice(0, 2));
  const month = Number(value.slice(2, 4));
  if (month < 1 || month > 12) return false;
  const now = new Date();
  const currentYear = now.getFullYear() % 100;
  const currentMonth = now.getMonth() + 1;
  if (year < currentYear) return false;
  if (year === currentYear && month < currentMonth) return false;
  return true;
};

const ensurePosterClientsTable = async () => {
  await db.run(
    `CREATE TABLE IF NOT EXISTS poster_clients (
      client_id INTEGER NOT NULL,
      restaurant_id INTEGER NOT NULL,
      poster_client_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (client_id, restaurant_id)
    )`
  );
};

const extractPosterClientId = (data: unknown) => {
  if (!data || typeof data !== "object") return "";
  const record = data as Record<string, unknown>;
  const response = record.response;
  const candidates = [
    record.client_id,
    record.clientId,
    response && (response as Record<string, unknown>).client_id,
    response && (response as Record<string, unknown>).id,
    response &&
      (response as Record<string, unknown>).client &&
      (response as Record<string, unknown>).client &&
      (response as Record<string, unknown>).client_id,
  ];
  for (const value of candidates) {
    if (typeof value === "number" || typeof value === "string") {
      const str = String(value).trim();
      if (str) return str;
    }
  }
  return "";
};

const createPosterClient = async (
  token: string,
  phone: string,
  name: string
) => {
  const url = new URL("https://joinposter.com/api/clients.create");
  url.searchParams.set("token", token);

  const response = await fetchWithTimeout(
    url.toString(),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, client_name: name }),
    },
    8000
  );

  const data = await response.json().catch(() => null);
  if (!response.ok) return { ok: false, error: data };
  return { ok: true, id: extractPosterClientId(data), raw: data };
};

const changePosterBonus = async (
  token: string,
  posterClientId: string,
  bonusDelta: number
) => {
  const url = new URL("https://joinposter.com/api/clients.changeClientBonus");
  url.searchParams.set("token", token);

  const response = await fetchWithTimeout(
    url.toString(),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: posterClientId,
        count: bonusDelta,
      }),
    },
    8000
  );

  const data = await response.json().catch(() => null);
  return { ok: response.ok, data };
};

const updatePosterClient = async (
  token: string,
  posterClientId: string,
  phone: string,
  name: string
) => {
  const url = new URL("https://joinposter.com/api/clients.update");
  url.searchParams.set("token", token);

  const response = await fetchWithTimeout(
    url.toString(),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: posterClientId,
        phone,
        client_name: name,
      }),
    },
    8000
  );

  const data = await response.json().catch(() => null);
  return { ok: response.ok, data };
};

export async function GET(request: Request) {
  const client = getClientAuth(request);
  if (!client) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  await ensureOrdersTable();
  const url = new URL(request.url);
  const limit = Math.min(
    Math.max(Number(url.searchParams.get("limit") ?? 10), 1),
    50
  );

  const rows = await db.all<{
    id: number;
    restaurant_id: number;
    restaurant_name: string | null;
    items_json: string;
    comment: string | null;
    delivery_price: number | null;
    service_mode: number | null;
    fees_json: string | null;
    status: string;
    created_at: string;
    poster_incoming_id: string | null;
    poster_status: number | null;
    poster_updated_at: string | null;
  }>(
    `SELECT orders.id,
            orders.restaurant_id,
            restaurants.name as restaurant_name,
            orders.items_json,
            orders.comment,
            orders.delivery_price,
            orders.service_mode,
            orders.fees_json,
            orders.status,
            orders.created_at,
            orders.poster_incoming_id,
            orders.poster_status,
            orders.poster_updated_at
     FROM orders
     LEFT JOIN restaurants ON restaurants.id = orders.restaurant_id
     WHERE orders.client_id = ?
     ORDER BY orders.created_at DESC
     LIMIT ?`,
    [client.sub, limit]
  );

  const shouldSync = url.searchParams.get("sync") === "1";
  if (shouldSync) {
    for (const row of rows) {
      if (!row.poster_incoming_id) continue;
      const restaurant = await db.get<{
        token_poster: string | null;
        integration_type: string | null;
      }>(
        "SELECT token_poster, integration_type FROM restaurants WHERE id = ?",
        [row.restaurant_id]
      );
      if (!restaurant || (restaurant.integration_type ?? "poster") !== "poster") {
        continue;
      }
      const token = (restaurant.token_poster ?? "").trim();
      if (!token) continue;
      const response = await fetchWithTimeout(
        `https://joinposter.com/api/incomingOrders.getIncomingOrder?token=${encodeURIComponent(
          token
        )}&incoming_order_id=${encodeURIComponent(row.poster_incoming_id)}`,
        { method: "GET" },
        8000
      );
      const data = await response.json().catch(() => null);
      const apiError = extractPosterError(data);
      if (!response.ok || apiError) {
        continue;
      }
      const meta = extractPosterIncomingMeta(data);
      if (meta.status !== null || meta.updatedAt) {
        row.poster_status = meta.status ?? row.poster_status;
        row.poster_updated_at = meta.updatedAt ?? row.poster_updated_at;
        await db.run(
          "UPDATE orders SET poster_status = ?, poster_updated_at = ? WHERE id = ?",
          [row.poster_status, row.poster_updated_at, row.id]
        );
      }
    }
  }

  const orders = rows.map((row) => ({
    id: row.id,
    restaurantId: row.restaurant_id,
    restaurantName: row.restaurant_name ?? "",
    items: parseItems(row.items_json),
    comment: row.comment ?? "",
    deliveryPrice: row.delivery_price ?? 0,
    serviceMode: row.service_mode ?? 0,
    fees: row.fees_json ? parseFees(row.fees_json) : [],
    status: row.status,
    createdAt: row.created_at,
    posterStatus: row.poster_status ?? null,
    posterUpdatedAt: row.poster_updated_at ?? null,
    posterIncomingId: row.poster_incoming_id ?? null,
  }));

  return NextResponse.json({ ok: true, orders });
}

export async function POST(request: Request) {
  try {
    const client = getClientAuth(request);
    if (!client) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    const body = (await request.json()) as {
      restaurantId?: number;
      spotId?: number;
      items?: OrderItemInput[];
      comment?: string;
      deliveryPrice?: number;
      serviceMode?: number;
      fees?: OrderFeeInput[];
      paymentMethod?: string;
      cardNumber?: string;
      expireDate?: string;
      transactionData?: string;
      lang?: string;
      locale?: string;
      bonusUsed?: number;
      bonus_used?: number;
      bonusAmount?: number;
      bonus_amount?: number;
      bonus?: number | { used?: number; amount?: number };
      addressId?: number;
      address?: string;
      deliveryAddress?: string;
      delivery_address?: string;
      posterToken?: string;
      tokenPoster?: string;
      token?: string;
    };
    const posterToken = (
      body?.posterToken ??
      body?.tokenPoster ??
      body?.token ??
      ""
    ).trim();
    let restaurantId = Number(body?.restaurantId);
    let restaurant =
      Number.isFinite(restaurantId)
        ? await db.get<{
            id: number;
            name: string | null;
            token_poster: string | null;
            spot_id: string | null;
            integration_type: string | null;
          }>(
            "SELECT id, name, token_poster, spot_id, integration_type FROM restaurants WHERE id = ?",
            [restaurantId]
          )
        : undefined;

    if (!restaurant && posterToken) {
      restaurant = await db.get<{
        id: number;
        name: string | null;
        token_poster: string | null;
        spot_id: string | null;
        integration_type: string | null;
      }>(
        "SELECT id, name, token_poster, spot_id, integration_type FROM restaurants WHERE token_poster = ?",
        [posterToken]
      );
      if (restaurant) {
        restaurantId = restaurant.id;
      }
    }

    if (!restaurant && !Number.isFinite(restaurantId) && !posterToken) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    if (!restaurant) {
      return NextResponse.json({ ok: false }, { status: 404 });
    }
    if ((restaurant.integration_type ?? "poster") !== "poster") {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    const token = (restaurant.token_poster ?? "").trim();
    const spotId = Number(restaurant.spot_id ?? "");
    if (!token || !Number.isFinite(spotId)) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }
    const maskToken = (value: string) =>
      value.length <= 6 ? "***" : `${value.slice(0, 3)}***${value.slice(-3)}`;

    if (typeof body?.spotId === "number" && body.spotId !== spotId) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

  const items = Array.isArray(body?.items) ? body.items : [];
  if (items.length === 0) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  let deliveryPrice =
    typeof body?.deliveryPrice === "number" && Number.isFinite(body.deliveryPrice)
      ? body.deliveryPrice
      : null;
  const rawServiceMode =
    typeof body?.serviceMode === "number" ? body.serviceMode : null;
  let serviceMode: number | null =
    rawServiceMode === 1 || rawServiceMode === 2 || rawServiceMode === 3
      ? rawServiceMode
      : deliveryPrice && deliveryPrice > 0
      ? 3
      : null;
  let fees = Array.isArray(body?.fees)
    ? body.fees
        .map((fee) => ({
          title: (fee?.title ?? "").trim(),
          price: Number(fee?.price ?? 0),
        }))
        .filter((fee) => fee.title && Number.isFinite(fee.price))
    : [];
  if (fees.length === 0) {
    const feeRows = await db.all<{
      title: string;
      price: number;
      is_default: number;
    }>(
      "SELECT title, price, is_default FROM restaurant_fees WHERE restaurant_id = ? ORDER BY is_default DESC, id ASC",
      [restaurantId]
    );
    fees = feeRows
      .map((fee) => ({
        title: fee.title,
        price: Number(fee.price ?? 0),
      }))
      .filter((fee) => fee.title && Number.isFinite(fee.price));
  }
  if (fees.length > 0) {
    const deliveryFee = pickDeliveryFee(fees);
    if (deliveryFee && deliveryPrice === null && Number.isFinite(deliveryFee.price)) {
      deliveryPrice = deliveryFee.price;
    }
    fees = fees.filter((fee) => !isDeliveryFeeTitle(fee.title));
  }
  if (deliveryPrice && deliveryPrice > 0) {
    serviceMode = 3;
  }
  const bonusField = body?.bonus;
  const bonusObject =
    bonusField && typeof bonusField === "object" ? bonusField : null;
  const bonusUsedValue = Number(
    body?.bonusUsed ??
      body?.bonus_used ??
      (typeof bonusField === "number" ? bonusField : undefined) ??
      body?.bonusAmount ??
      body?.bonus_amount ??
      bonusObject?.used ??
      bonusObject?.amount ??
      0
  );
  const bonusUsed =
    Number.isFinite(bonusUsedValue) && bonusUsedValue > 0
      ? bonusUsedValue
      : null;
  const feeComment = buildFeesComment(body?.comment ?? "", fees);
  const orderLang = (body?.lang ?? body?.locale ?? "").trim().toLowerCase();
  const bonusSuffix = bonusUsed
    ? orderLang.startsWith("uz") || orderLang.startsWith("uz-")
      ? `Bonuslar ishlatildi: ${bonusUsed}`
      : `Использовано бонусов: ${bonusUsed}`
    : "";
  const comment = feeComment
    ? bonusSuffix
      ? `${feeComment} | ${bonusSuffix}`
      : feeComment
    : bonusSuffix;
  const deliveryAddress = (
    body?.deliveryAddress ??
    body?.delivery_address ??
    body?.address ??
    ""
  ).trim();
  const paymentMethod = (body?.paymentMethod ?? "").trim().toLowerCase();

  const clientRow = await db.get<{
    id: number;
    phone: string;
    name: string | null;
  }>("SELECT id, phone, name FROM clients WHERE id = ?", [client.sub]);
  if (!clientRow) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  await ensurePosterClientsTable();
  const existingPoster = await db.get<{ poster_client_id: string }>(
    "SELECT poster_client_id FROM poster_clients WHERE client_id = ? AND restaurant_id = ?",
    [clientRow.id, restaurantId]
  );

  let posterClientId = existingPoster?.poster_client_id ?? "";
  if (!posterClientId) {
    try {
      const created = await createPosterClient(
        token,
        clientRow.phone,
        clientRow.name ?? ""
      );
      if (created.ok && created.id) {
        posterClientId = created.id;
        const now = new Date().toISOString();
        await db.run(
          "INSERT INTO poster_clients (client_id, restaurant_id, poster_client_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
          [clientRow.id, restaurantId, posterClientId, now, now]
        );
      } else {
        console.error("orders:create:poster-client-failed", {
          restaurantId,
          clientId: clientRow.id,
          error: created.error,
        });
      }
    } catch (error) {
      console.error("orders:create:poster-client-exception", {
        restaurantId,
        clientId: clientRow.id,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  } else {
    try {
      await updatePosterClient(
        token,
        posterClientId,
        clientRow.phone,
        clientRow.name ?? ""
      );
    } catch (error) {
      console.error("orders:create:poster-client-update-failed", {
        restaurantId,
        clientId: clientRow.id,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (bonusUsed) {
    if (!posterClientId) {
      return NextResponse.json(
        { ok: false, error: { message: "Poster client is missing." } },
        { status: 502 }
      );
    }
    const bonusDelta = -Math.round(bonusUsed);
    if (bonusDelta !== 0) {
      const bonusResult = await changePosterBonus(
        token,
        posterClientId,
        bonusDelta
      );
      if (!bonusResult.ok) {
        return NextResponse.json(
          { ok: false, error: bonusResult.data },
          { status: 502 }
        );
      }
    }
  }

  const itemIds = items.map((item) => Number(item.productId));
  if (itemIds.some((id) => !Number.isFinite(id))) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const menuRows = await db.all<{
    id: number;
    source_id: string | null;
    name_ru: string | null;
    price: number | null;
  }>(
    `SELECT id, source_id, name_ru, price FROM menu_items WHERE id IN (${itemIds
      .map(() => "?")
      .join(",")})`,
    itemIds
  );

  const byId = new Map(menuRows.map((row) => [row.id, row]));
  const posterProducts = [];
  const storedItems: StoredOrderItem[] = [];

  for (const item of items) {
    const id = Number(item.productId);
    const row = byId.get(id);
    if (!row || !row.source_id) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }
    const qty = Number(item.qty);
    if (!Number.isFinite(qty) || qty <= 0) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }
    const price =
      typeof item.price === "number" && item.price > 0
        ? item.price
        : Number(row.price ?? 0);
    if (!Number.isFinite(price) || price <= 0) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    posterProducts.push({
      product_id: Number(row.source_id),
      count: qty,
      price,
    });
    storedItems.push({
      id,
      name: (row.name_ru ?? "").trim() || `Item #${id}`,
      qty,
      price,
    });
  }

  await ensureOrdersTable();
  const now = new Date().toISOString();
  const initialStatus = paymentMethod === "card" ? "pending_payment" : "pending";
  const orderId = await createOrder({
    restaurantId,
    clientId: clientRow.id,
    clientName: clientRow.name ?? "",
    clientPhone: clientRow.phone,
    items: storedItems,
    comment,
    deliveryPrice: deliveryPrice ?? undefined,
    serviceMode: serviceMode ?? undefined,
    fees,
    deliveryAddress: deliveryAddress || undefined,
    paymentMethod: paymentMethod || undefined,
    status: initialStatus,
    createdAt: now,
  });
  if (!orderId) {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
  await db.run(
    "UPDATE clients SET orders_count = COALESCE(orders_count, 0) + 1, last_order_at = ? WHERE id = ?",
    [now, clientRow.id]
  );

  const orderTotal =
    storedItems.reduce((sum, item) => sum + item.price * item.qty, 0) +
    fees.reduce((sum, fee) => sum + fee.price, 0) +
    (deliveryPrice ?? 0);

  await sendTelegramOrderNotification({
    restaurantId,
    restaurantName: (restaurant.name ?? "").trim() || undefined,
    orderId,
    items: storedItems.map((item) => ({
      name: item.name,
      qty: item.qty,
      price: item.price,
    })),
    fees,
    deliveryPrice: deliveryPrice ?? undefined,
    total: orderTotal,
    clientPhone: clientRow.phone,
    deliveryAddress: deliveryAddress || undefined,
    comment,
    status: initialStatus,
  });

  let paymentResponse: unknown = null;
  let posterComment = comment;
  if (paymentMethod === "card") {
    await ensureSettingsTable();
    const settings = await db.all<{ key: string; value: string | null }>(
      "SELECT key, value FROM app_settings WHERE key IN (?, ?, ?)",
      ["plum_base_url", "plum_login", "plum_password"]
    );
    const settingsMap = new Map(settings.map((row) => [row.key, row.value ?? ""]));
    const baseUrl =
      (settingsMap.get("plum_base_url") ?? "").trim() ||
      (process.env.PAYMENT_BASE_URL ?? "").trim();
    const login = (settingsMap.get("plum_login") ?? "").trim();
    const password = (settingsMap.get("plum_password") ?? "").trim();
    const authHeader =
      login && password
        ? `Basic ${Buffer.from(`${login}:${password}`).toString("base64")}`
        : "";
    const cardNumber = (body?.cardNumber ?? "").trim();
    const expireDate = (body?.expireDate ?? "").trim();
    if (!baseUrl || !cardNumber || !expireDate) {
      await updateOrderStatus({
        orderId,
        status: "failed",
        error: { message: "Missing card payment data." },
        updatedAt: new Date().toISOString(),
      });
      return NextResponse.json(
        { ok: false, error: { message: "Card payment data is required." } },
        { status: 400 }
      );
    }
    if (!isValidCardNumber(cardNumber) || !isValidExpireDate(expireDate)) {
      await updateOrderStatus({
        orderId,
        status: "failed",
        error: { message: "Invalid card data." },
        updatedAt: new Date().toISOString(),
      });
      return NextResponse.json(
        { ok: false, error: { message: "Invalid card data." } },
        { status: 400 }
      );
    }
    const paymentResult = await createCardPayment({
      baseUrl,
      authHeader,
      amount: Math.round(orderTotal),
      cardNumber,
      expireDate,
      extraId: `order-${orderId}`,
      transactionData: body?.transactionData ?? "",
    });
    paymentResponse = paymentResult.data;
    await db.run(
      "UPDATE orders SET payment_payload_json = ? WHERE id = ?",
      [JSON.stringify(paymentResponse), orderId]
    );
    if (!paymentResult.ok || (paymentResult.data as { error?: string } | null)?.error) {
      await updateOrderStatus({
        orderId,
        status: "failed",
        error: paymentResponse,
        updatedAt: new Date().toISOString(),
      });
      return NextResponse.json(
        { ok: false, error: paymentResponse },
        { status: 402 }
      );
    }
    const paidSuffix =
      orderLang.startsWith("uz") || orderLang.startsWith("uz-")
        ? "Karta bilan to'langan"
        : "Оплачено картой";
    posterComment = posterComment
      ? `${posterComment} | ${paidSuffix}`
      : paidSuffix;
    await db.run("UPDATE orders SET comment = ? WHERE id = ?", [
      posterComment,
      orderId,
    ]);
    return NextResponse.json({
      ok: true,
      orderId,
      payment: paymentResponse,
      requiresOtp: true,
    });
  }

  let data: unknown = null;
  try {
    const params = new URLSearchParams();
    params.set("spot_id", String(spotId));
    if (posterClientId) {
      params.set("client_id", posterClientId);
    } else {
      params.set("phone", clientRow.phone);
      if (clientRow.name) {
        params.set("first_name", clientRow.name);
      }
    }
    if (serviceMode) {
      params.set("service_mode", String(serviceMode));
    }
    if (deliveryPrice && deliveryPrice > 0) {
      params.set("delivery_price", String(Math.round(deliveryPrice * 100)));
    }
    if (deliveryAddress) {
      params.set("client_address[address1]", deliveryAddress);
    }
    params.set("comment", posterComment || "Order from app");
    posterProducts.forEach((product, index) => {
      params.set(`products[${index}][product_id]`, String(product.product_id));
      params.set(`products[${index}][count]`, String(product.count));
      params.set(
        `products[${index}][price]`,
        String(Math.round(product.price * 100))
      );
    });

    const response = await fetchWithTimeout(
      `https://joinposter.com/api/incomingOrders.createIncomingOrder?token=${encodeURIComponent(
        token
      )}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      },
      10000
    );

    data = await response.json().catch(() => null);
    const apiError = extractPosterError(data);
    const posterMeta = extractPosterIncomingMeta(data);
    if (!response.ok || apiError) {
      console.error("orders:create:poster-error", {
        restaurantId,
        spotId,
        status: response.status,
        token: maskToken(token),
        data,
        apiError,
      });
      if (orderId) {
        await updateOrderStatus({
          orderId,
          status: "failed",
          error: data,
          updatedAt: new Date().toISOString(),
        });
      }
      return NextResponse.json({
        ok: true,
        orderId,
        posterOk: false,
        error: apiError ? { message: apiError, raw: data } : data,
      });
    }

    console.log("orders:create:poster-ok", {
      restaurantId,
      spotId,
      token: maskToken(token),
      posterResponse: data,
    });

    if (orderId) {
      await updateOrderStatus({
        orderId,
        status: "sent",
        payload: data,
        updatedAt: new Date().toISOString(),
      });
      if (posterMeta.id || posterMeta.status !== null || posterMeta.updatedAt) {
        await db.run(
          "UPDATE orders SET poster_incoming_id = ?, poster_status = ?, poster_updated_at = ? WHERE id = ?",
          [posterMeta.id || null, posterMeta.status, posterMeta.updatedAt, orderId]
        );
      }
    }

    return NextResponse.json({
      ok: true,
      orderId,
      poster: data,
      payment: paymentResponse,
    });
  } catch (error) {
    console.error("orders:create:poster-exception", {
      restaurantId,
      spotId,
      token: maskToken(token),
      message: error instanceof Error ? error.message : String(error),
    });
    if (orderId) {
      await updateOrderStatus({
        orderId,
        status: "failed",
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
        updatedAt: new Date().toISOString(),
      });
    }
    return NextResponse.json({
      ok: true,
      orderId,
      posterOk: false,
      error: { message: "Poster request failed." },
      payment: paymentResponse,
    });
  }
  } catch (error) {
    console.error("orders:create:exception", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : null,
    });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

