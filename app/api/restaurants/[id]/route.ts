import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { hasPermission, isAuthorized } from "@/lib/api-auth";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false }, { status: 401 });
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

  const { id } = await context.params;
  const idNumber = Number(id);
  if (!Number.isFinite(idNumber)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const body = await request.json();
  const fields: string[] = [];
  const values: Array<string | number> = [];
  let hasStatusUpdate = false;
  let hasOtherUpdate = false;
  let hasScheduleUpdate = false;

  const pushField = (name: string, value: string | number) => {
    fields.push(`${name} = ?`);
    values.push(value);
  };

  if (typeof body?.name === "string") {
    pushField("name", body.name.trim());
    hasOtherUpdate = true;
  }
  if (typeof body?.address === "string") {
    pushField("address", body.address.trim());
    hasOtherUpdate = true;
  }
  if (typeof body?.description === "string") {
    pushField("description", body.description.trim());
    hasOtherUpdate = true;
  }
  if (typeof body?.status === "string") {
    const status = body.status.trim();
    pushField("status", status);
    pushField("open", status === "Открыто" ? 1 : 0);
    hasStatusUpdate = true;
  }
  if (typeof body?.workStart === "string") {
    pushField("work_start", body.workStart.trim());
    hasOtherUpdate = true;
    hasScheduleUpdate = true;
  }
  if (typeof body?.workEnd === "string") {
    pushField("work_end", body.workEnd.trim());
    hasOtherUpdate = true;
    hasScheduleUpdate = true;
  }
  if (typeof body?.autoSchedule === "boolean") {
    pushField("auto_schedule", body.autoSchedule ? 1 : 0);
    hasOtherUpdate = true;
    hasScheduleUpdate = true;
  }
  if (typeof body?.image === "string") {
    pushField("image", body.image.trim());
    hasOtherUpdate = true;
  }
  if (typeof body?.logo === "string") {
    pushField("logo", body.logo.trim());
    hasOtherUpdate = true;
  }
  if (typeof body?.color === "string") {
    pushField("color", body.color.trim());
    hasOtherUpdate = true;
  }
  if (typeof body?.addedAt === "string") {
    pushField("added_at", body.addedAt.trim());
    hasOtherUpdate = true;
  }
  if (typeof body?.tokenPoster === "string") {
    pushField("token_poster", body.tokenPoster.trim());
    hasOtherUpdate = true;
  }
  if (typeof body?.spotId === "string") {
    pushField("spot_id", body.spotId.trim());
    hasOtherUpdate = true;
  }
  if (typeof body?.integrationType === "string") {
    pushField("integration_type", body.integrationType.trim());
    hasOtherUpdate = true;
  }
  if (typeof body?.onecBaseUrl === "string") {
    pushField("onec_base_url", body.onecBaseUrl.trim());
    hasOtherUpdate = true;
  }
  if (typeof body?.onecAuthMethod === "string") {
    pushField("onec_auth_method", body.onecAuthMethod.trim());
    hasOtherUpdate = true;
  }
  if (typeof body?.onecLogin === "string") {
    pushField("onec_login", body.onecLogin.trim());
    hasOtherUpdate = true;
  }
  if (typeof body?.onecPassword === "string") {
    pushField("onec_password", body.onecPassword.trim());
    hasOtherUpdate = true;
  }
  if (typeof body?.onecToken === "string") {
    pushField("onec_token", body.onecToken.trim());
    hasOtherUpdate = true;
  }

  if (hasOtherUpdate && !(await hasPermission(request, "edit_restaurants"))) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }
  if (
    hasStatusUpdate &&
    !(await hasPermission(request, "change_restaurant_status")) &&
    !(await hasPermission(request, "edit_restaurants"))
  ) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }

  if (fields.length === 0) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  if (hasScheduleUpdate) {
    const current = await db.get<{
      work_start: string | null;
      work_end: string | null;
      auto_schedule: number | null;
    }>(
      "SELECT work_start, work_end, auto_schedule FROM restaurants WHERE id = ?",
      [idNumber]
    );
    const workStart =
      typeof body?.workStart === "string"
        ? body.workStart.trim()
        : current?.work_start ?? "";
    const workEnd =
      typeof body?.workEnd === "string"
        ? body.workEnd.trim()
        : current?.work_end ?? "";
    const autoSchedule =
      typeof body?.autoSchedule === "boolean"
        ? body.autoSchedule
        : Boolean(current?.auto_schedule);

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
      const now = new Date();
      const nowMinutes = now.getHours() * 60 + now.getMinutes();
      if (startMinutes < endMinutes) {
        return nowMinutes >= startMinutes && nowMinutes < endMinutes;
      }
      return nowMinutes >= startMinutes || nowMinutes < endMinutes;
    };

    if (autoSchedule) {
      const scheduledOpen = shouldBeOpen(workStart || null, workEnd || null);
      if (scheduledOpen !== null) {
        pushField("open", scheduledOpen ? 1 : 0);
        pushField("status", scheduledOpen ? "Открыто" : "Закрыто");
        hasStatusUpdate = true;
      }
    }
  }

  values.push(idNumber);
  await db.run(`UPDATE restaurants SET ${fields.join(", ")} WHERE id = ?`, values);

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  if (!(await hasPermission(request, "edit_restaurants"))) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }

  const { id } = await context.params;
  const idNumber = Number(id);
  if (!Number.isFinite(idNumber)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  await db.run("DELETE FROM restaurants WHERE id = ?", [idNumber]);
  return NextResponse.json({ ok: true });
}
