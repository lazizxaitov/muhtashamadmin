import { NextResponse } from "next/server";
import { hasPermission, isAuthorized } from "@/lib/api-auth";
import {
  getTelegramBotToken,
  getTelegramSettingsForRestaurant,
  sendTelegramMessage,
} from "@/lib/telegram";

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  if (!(await hasPermission(request, "edit_restaurants"))) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as
    | { restaurantId?: number; message?: string }
    | null;
  const restaurantId = Number(body?.restaurantId);
  if (!Number.isFinite(restaurantId) || restaurantId <= 0) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const token = await getTelegramBotToken();
  const settings = await getTelegramSettingsForRestaurant(restaurantId);
  if (!token || !settings?.enabled) {
    return NextResponse.json(
      { ok: false, error: "Telegram is not configured for this restaurant." },
      { status: 400 }
    );
  }

  const text =
    (body?.message ?? "").trim() || "Muhtasham Admin: Telegram test message.";
  const result = await sendTelegramMessage({
    token,
    chatId: settings.chatId,
    text,
  });
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: 502 }
    );
  }
  return NextResponse.json({ ok: true });
}

