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
    hidden?: boolean;
    nameRu?: string;
    nameUz?: string;
    descriptionRu?: string;
    descriptionUz?: string;
  };

  const fields: string[] = [];
  const values: Array<string | number> = [];
  const pushField = (name: string, value: string | number) => {
    fields.push(`${name} = ?`);
    values.push(value);
  };

  if (typeof body.hidden === "boolean") {
    pushField("hidden", body.hidden ? 1 : 0);
  }
  if (typeof body.nameRu === "string") pushField("name_ru", body.nameRu.trim());
  if (typeof body.nameUz === "string") pushField("name_uz", body.nameUz.trim());
  if (typeof body.descriptionRu === "string") {
    pushField("description_ru", body.descriptionRu.trim());
  }
  if (typeof body.descriptionUz === "string") {
    pushField("description_uz", body.descriptionUz.trim());
  }

  if (fields.length === 0) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  values.push(idNumber);
  await db.run(`UPDATE menu_items SET ${fields.join(", ")} WHERE id = ?`, values);

  return NextResponse.json({ ok: true });
}
