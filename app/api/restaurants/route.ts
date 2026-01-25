import { NextResponse } from "next/server";
import db from "@/lib/db";
import { hasPermission, isAuthorized } from "@/lib/api-auth";
import { isRateLimited } from "@/lib/rate-limit";
import { AdminRestaurantDTO, PublicRestaurantDTO } from "@/lib/restaurant-dto";
import { isOnecTlsError, OnecTlsConfigError, pingOnecBaseUrl } from "@/lib/onec-tls";
import { getNowMinutesInTimeZone } from "@/lib/timezone";

export async function GET(request: Request) {
  const isAdmin = isAuthorized(request);
  if (!isAdmin && isRateLimited(request, { limit: 120, windowMs: 60_000 })) {
    return NextResponse.json({ ok: false }, { status: 429 });
  }

  const columns = await db.all<{ name: string }>("PRAGMA table_info(restaurants)");
  const columnNames = new Set(columns.map((column) => column.name));
  if (!columnNames.has("work_start")) {
    await db.run("ALTER TABLE restaurants ADD COLUMN work_start TEXT");
  }
  if (!columnNames.has("work_end")) {
    await db.run("ALTER TABLE restaurants ADD COLUMN work_end TEXT");
  }
  if (!columnNames.has("auto_schedule")) {
    await db.run("ALTER TABLE restaurants ADD COLUMN auto_schedule INTEGER");
  }

  const rows = (await db.all<{
    id: number;
    name: string;
    address: string;
    description: string;
    status: string;
    image: string;
    logo: string | null;
    color: string;
    open: number;
    added_at: string;
    token_poster: string | null;
    spot_id: string | null;
    integration_type: string | null;
    onec_base_url: string | null;
    onec_auth_method: string | null;
    onec_login: string | null;
    onec_password: string | null;
    onec_token: string | null;
    work_start: string | null;
    work_end: string | null;
    auto_schedule: number | null;
  }>("SELECT id, name, address, description, status, image, logo, color, open, added_at, token_poster, spot_id, integration_type, onec_base_url, onec_auth_method, onec_login, onec_password, onec_token, work_start, work_end, auto_schedule FROM restaurants ORDER BY id DESC"));

  const parseTime = (value: string | null) => {
    if (!value) return null;
    const [rawH, rawM] = value.split(":");
    const hours = Number(rawH);
    const minutes = Number(rawM);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
    return hours * 60 + minutes;
  };
  const shouldBeOpen = (start: string | null, end: string | null) => {
    const startMinutes = parseTime(start);
    const endMinutes = parseTime(end);
    if (startMinutes === null || endMinutes === null) return null;
    if (startMinutes === endMinutes) return true;
    const nowMinutes =
      getNowMinutesInTimeZone("Asia/Tashkent") ??
      new Date().getHours() * 60 + new Date().getMinutes();
    if (startMinutes < endMinutes) {
      return nowMinutes >= startMinutes && nowMinutes < endMinutes;
    }
    return nowMinutes >= startMinutes || nowMinutes < endMinutes;
  };

  for (const row of rows) {
    if (!row.auto_schedule) continue;
    const nextOpen = shouldBeOpen(row.work_start, row.work_end);
    if (nextOpen === null) continue;
    const desiredOpen = nextOpen ? 1 : 0;
    if (row.open !== desiredOpen) {
      row.open = desiredOpen;
      row.status = desiredOpen ? "Открыто" : "Закрыто";
      await db.run(
        "UPDATE restaurants SET open = ?, status = ? WHERE id = ?",
        [row.open, row.status, row.id]
      );
    }
  }

  if (isAdmin) {
    const adminPayload: AdminRestaurantDTO[] = rows.map((row) => ({
      ...row,
      color: row.color,
      logo: row.logo ?? "",
      open: Boolean(row.open),
      addedAt: row.added_at,
      tokenPoster: row.token_poster ?? "",
      spotId: row.spot_id ?? "",
      integrationType: row.integration_type ?? "poster",
      onecBaseUrl: row.onec_base_url ?? "",
      onecAuthMethod: row.onec_auth_method ?? "",
      onecLogin: row.onec_login ?? "",
      onecPassword: row.onec_password ?? "",
      onecToken: row.onec_token ?? "",
      workStart: row.work_start ?? "",
      workEnd: row.work_end ?? "",
      autoSchedule: Boolean(row.auto_schedule),
    }));
    return NextResponse.json(adminPayload);
  }

  const publicPayload: PublicRestaurantDTO[] = rows.map((row) => ({
    id: row.id,
    name: row.name,
    address: row.address,
    description: row.description,
    status: row.status,
    image: row.image,
    logo: row.logo ?? "",
    color: row.color,
    open: Boolean(row.open),
    addedAt: row.added_at,
    workStart: row.work_start ?? "",
    workEnd: row.work_end ?? "",
    autoSchedule: Boolean(row.auto_schedule),
  }));
  return NextResponse.json(publicPayload);
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  if (!(await hasPermission(request, "add_restaurants"))) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }

  const columns = await db.all<{ name: string }>("PRAGMA table_info(restaurants)");
  const columnNames = new Set(columns.map((column) => column.name));
  if (!columnNames.has("work_start")) {
    await db.run("ALTER TABLE restaurants ADD COLUMN work_start TEXT");
  }
  if (!columnNames.has("work_end")) {
    await db.run("ALTER TABLE restaurants ADD COLUMN work_end TEXT");
  }
  if (!columnNames.has("auto_schedule")) {
    await db.run("ALTER TABLE restaurants ADD COLUMN auto_schedule INTEGER");
  }

  const body = await request.json();
  const name = (body?.name ?? "").trim();
  const address = (body?.address ?? "").trim();
  const description = (body?.description ?? "").trim();

  if (!name || !address || !description) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const status = (body?.status ?? "Открыто").trim();
  const image = (body?.image ?? "/logo_green.png").trim();
  const logo = (body?.logo ?? "").trim();
  const color = (body?.color ?? "#1a6b3a").trim();
  const open = status === "Открыто" ? 1 : 0;
  const addedAt =
    (body?.addedAt ?? new Date().toISOString().slice(0, 10)).trim();
  const tokenPoster = (body?.tokenPoster ?? "").trim();
  const spotId = (body?.spotId ?? "").trim();
  const integrationType = (body?.integrationType ?? "poster").trim();
  const workStart = (body?.workStart ?? "").trim();
  const workEnd = (body?.workEnd ?? "").trim();
  const autoSchedule = body?.autoSchedule ? 1 : 0;
  const onecBaseUrl = (body?.onecBaseUrl ?? "").trim();
  const onecAuthMethod = (body?.onecAuthMethod ?? "").trim();
  const onecLogin = (body?.onecLogin ?? "").trim();
  const onecPassword = (body?.onecPassword ?? "").trim();
  const onecToken = (body?.onecToken ?? "").trim();

  const parseTime = (value: string | null) => {
    if (!value) return null;
    const [rawH, rawM] = value.split(":");
    const hours = Number(rawH);
    const minutes = Number(rawM);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
    return hours * 60 + minutes;
  };
  const shouldBeOpen = (start: string | null, end: string | null) => {
    const startMinutes = parseTime(start);
    const endMinutes = parseTime(end);
    if (startMinutes === null || endMinutes === null) return null;
    if (startMinutes === endMinutes) return true;
    const nowMinutes =
      getNowMinutesInTimeZone("Asia/Tashkent") ??
      new Date().getHours() * 60 + new Date().getMinutes();
    if (startMinutes < endMinutes) {
      return nowMinutes >= startMinutes && nowMinutes < endMinutes;
    }
    return nowMinutes >= startMinutes || nowMinutes < endMinutes;
  };

  let nextOpen = open;
  let nextStatus = status;
  if (autoSchedule) {
    const scheduledOpen = shouldBeOpen(workStart || null, workEnd || null);
    if (scheduledOpen !== null) {
      nextOpen = scheduledOpen ? 1 : 0;
      nextStatus = scheduledOpen ? "Открыто" : "Закрыто";
    }
  }

  if (integrationType === "1c" && onecBaseUrl) {
    try {
      await pingOnecBaseUrl(onecBaseUrl);
    } catch (error) {
      const isConfigError =
        error instanceof OnecTlsConfigError ||
        (error as { code?: unknown } | null)?.code === "ENOENT";
      if (isConfigError || isOnecTlsError(error)) {
        console.error("1C TLS setup error:", {
          onecBaseUrl,
          message: error instanceof Error ? error.message : String(error),
          code: (error as { code?: unknown } | null)?.code,
        });
        return NextResponse.json(
          {
            ok: false,
            code: "ONEC_TLS_ERROR",
            error:
              "TLS error while connecting to 1C. Provide a trusted CA cert via ONEC_CA_CERT_PATH.",
          },
          { status: 500 }
        );
      }

      console.error("1C request failed:", {
        onecBaseUrl,
        message: error instanceof Error ? error.message : String(error),
        code: (error as { code?: unknown } | null)?.code,
      });
      return NextResponse.json(
        { ok: false, code: "ONEC_REQUEST_FAILED" },
        { status: 502 }
      );
    }
  }

  const result = await db.get<{ id: number }>(
    `INSERT INTO restaurants (name, address, description, status, image, logo, color, open, added_at, token_poster, spot_id, integration_type, work_start, work_end, auto_schedule, onec_base_url, onec_auth_method, onec_login, onec_password, onec_token)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     RETURNING id`,
    [
      name,
      address,
      description,
      nextStatus,
      image,
      logo,
      color,
      nextOpen,
      addedAt,
      tokenPoster,
      spotId,
      integrationType,
      workStart || null,
      workEnd || null,
      autoSchedule,
      onecBaseUrl,
      onecAuthMethod,
      onecLogin,
      onecPassword,
      onecToken,
    ]
  );

  const defaultFees = [
    {
      title: "Доставка",
      description: "Стандартная стоимость доставки по городу.",
      price: 15000,
    },
    {
      title: "Пакет",
      description: "Стоимость упаковки и расходных материалов.",
      price: 2000,
    },
  ];
  if (result?.id) {
    for (const fee of defaultFees) {
      await db.run(
        "INSERT INTO restaurant_fees (restaurant_id, title, description, price, is_default) VALUES (?, ?, ?, ?, 1)",
        [result.id, fee.title, fee.description, fee.price]
      );
    }
  }

  return NextResponse.json({ ok: true, id: result?.id });
}
