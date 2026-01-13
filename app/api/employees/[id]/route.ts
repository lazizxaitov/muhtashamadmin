import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { hasPermission, isAuthorized } from "@/lib/api-auth";
import { hashClientPassword } from "@/lib/client-auth";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  if (!(await hasPermission(request, "manage_employees"))) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }

  const { id } = await context.params;
  const idNumber = Number(id);
  if (!Number.isFinite(idNumber)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const body = (await request.json()) as {
    name?: string;
    phone?: string;
    role?: string;
    login?: string;
    password?: string;
    permissions?: {
      canEditRestaurants?: boolean;
      canChangeRestaurantStatus?: boolean;
      canManageEmployees?: boolean;
      canAddRestaurants?: boolean;
    };
  };

  const fields: string[] = [];
  const values: Array<string | number> = [];

  const pushField = (name: string, value: string | number) => {
    fields.push(`${name} = ?`);
    values.push(value);
  };

  if (typeof body?.name === "string") pushField("name", body.name.trim());
  if (typeof body?.phone === "string") pushField("phone", body.phone.trim());
  if (typeof body?.role === "string") pushField("role", body.role.trim());
  if (typeof body?.login === "string") {
    const login = body.login.trim();
    const adminLogin = process.env.ADMIN_LOGIN ?? "";
    if (login && login === adminLogin) {
      return NextResponse.json({ ok: false }, { status: 409 });
    }
    if (login) {
      const existingLogin = await db.get<{ id: number }>(
        "SELECT id FROM employees WHERE login = ? AND id != ?",
        [login, idNumber]
      );
      if (existingLogin) {
        return NextResponse.json({ ok: false }, { status: 409 });
      }
    }
    pushField("login", login);
  }

  if (body?.permissions) {
    if (typeof body.permissions.canEditRestaurants === "boolean") {
      pushField(
        "can_edit_restaurants",
        body.permissions.canEditRestaurants ? 1 : 0
      );
    }
    if (typeof body.permissions.canChangeRestaurantStatus === "boolean") {
      pushField(
        "can_change_restaurant_status",
        body.permissions.canChangeRestaurantStatus ? 1 : 0
      );
    }
    if (typeof body.permissions.canManageEmployees === "boolean") {
      pushField(
        "can_manage_employees",
        body.permissions.canManageEmployees ? 1 : 0
      );
    }
    if (typeof body.permissions.canAddRestaurants === "boolean") {
      pushField(
        "can_add_restaurants",
        body.permissions.canAddRestaurants ? 1 : 0
      );
    }
  }

  if (typeof body?.password === "string" && body.password.trim()) {
    const { salt, hash } = hashClientPassword(body.password.trim());
    pushField("password_hash", hash);
    pushField("password_salt", salt);
  }

  if (fields.length === 0) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  values.push(idNumber);
  await db.run(`UPDATE employees SET ${fields.join(", ")} WHERE id = ?`, values);

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  if (!(await hasPermission(request, "manage_employees"))) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }

  const { id } = await context.params;
  const idNumber = Number(id);
  if (!Number.isFinite(idNumber)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  await db.run("DELETE FROM employees WHERE id = ?", [idNumber]);
  return NextResponse.json({ ok: true });
}
