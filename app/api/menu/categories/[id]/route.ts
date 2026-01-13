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
  };

  const fields: string[] = [];
  const values: Array<string | number | null> = [];

  if (typeof body.hidden === "boolean") {
    fields.push("hidden = ?");
    values.push(body.hidden ? 1 : 0);
  }
  if (typeof body.nameRu === "string") {
    fields.push("name_ru = ?");
    values.push(body.nameRu.trim());
  }
  if (typeof body.nameUz === "string") {
    fields.push("name_uz = ?");
    values.push(body.nameUz.trim());
  }

  if (fields.length === 0) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  values.push(idNumber);
  await db.run(
    `UPDATE menu_categories SET ${fields.join(", ")} WHERE id = ?`,
    values
  );

  return NextResponse.json({ ok: true });
}
