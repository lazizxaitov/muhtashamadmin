import { NextResponse } from "next/server";
import { hasPermission, isAuthorized } from "@/lib/api-auth";
import {
  ensureTelegramTables,
  getTelegramBotToken,
  listTelegramRestaurantSettings,
  maskTelegramToken,
  setTelegramBotToken,
  upsertTelegramRestaurantSettings,
} from "@/lib/telegram";

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  if (!(await hasPermission(request, "edit_restaurants"))) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }

  await ensureTelegramTables();
  const token = await getTelegramBotToken();
  const settings = await listTelegramRestaurantSettings();
  return NextResponse.json({
    ok: true,
    token: token ? maskTelegramToken(token) : "",
    hasToken: Boolean(token),
    restaurants: settings.map((row) => ({
      restaurantId: row.restaurant_id,
      chatId: row.chat_id ?? "",
      enabled: Boolean(row.enabled),
      updatedAt: row.updated_at,
    })),
  });
}

export async function PATCH(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  if (!(await hasPermission(request, "edit_restaurants"))) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        token?: string;
        restaurantId?: number;
        chatId?: string;
        enabled?: boolean;
      }
    | null;

  if (!body) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  await ensureTelegramTables();

  if (typeof body.token === "string") {
    await setTelegramBotToken(body.token);
  }

  let restaurantResult: unknown = null;
  if (typeof body.restaurantId === "number") {
    const id = Number(body.restaurantId);
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }
    const chatId = typeof body.chatId === "string" ? body.chatId : "";
    const enabled = Boolean(body.enabled) && Boolean(chatId.trim());
    restaurantResult = await upsertTelegramRestaurantSettings({
      restaurantId: id,
      chatId,
      enabled,
    });
  }

  return NextResponse.json({
    ok: true,
    restaurant: restaurantResult,
  });
}

