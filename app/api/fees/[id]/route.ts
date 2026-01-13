import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { isAuthorized } from "@/lib/api-auth";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const { id } = await context.params;
  const idNumber = Number(id);
  if (!Number.isFinite(idNumber)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const body = (await request.json()) as {
    title?: string;
    description?: string;
    price?: number;
  };

  const fields: string[] = [];
  const values: Array<string | number> = [];
  const pushField = (name: string, value: string | number) => {
    fields.push(`${name} = ?`);
    values.push(value);
  };

  if (typeof body.title === "string") {
    pushField("title", body.title.trim());
  }
  if (typeof body.description === "string") {
    pushField("description", body.description.trim());
  }
  if (typeof body.price === "number" && Number.isFinite(body.price)) {
    pushField("price", body.price);
  }

  if (fields.length === 0) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  values.push(idNumber);
  await db.run(`UPDATE restaurant_fees SET ${fields.join(", ")} WHERE id = ?`, values);

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const { id } = await context.params;
  const idNumber = Number(id);
  if (!Number.isFinite(idNumber)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const row = await db.get<{ is_default?: number }>("SELECT is_default FROM restaurant_fees WHERE id = ?", [idNumber]);
  if (!row) {
    return NextResponse.json({ ok: false }, { status: 404 });
  }
  if (row.is_default) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  await db.run("DELETE FROM restaurant_fees WHERE id = ?", [idNumber]);
  return NextResponse.json({ ok: true });
}
