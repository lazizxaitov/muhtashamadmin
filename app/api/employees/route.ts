import { NextResponse } from "next/server";
import db from "@/lib/db";
import { hasPermission, isAuthorized } from "@/lib/api-auth";
import { hashClientPassword } from "@/lib/client-auth";

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const rows = await db.all<{
    id: number;
    name: string;
    phone: string;
    role: string;
    login: string | null;
    can_edit_restaurants: number;
    can_change_restaurant_status: number;
    can_manage_employees: number;
    can_add_restaurants: number;
    created_at: string;
  }>("SELECT id, name, phone, role, login, can_edit_restaurants, can_change_restaurant_status, can_manage_employees, can_add_restaurants, created_at FROM employees ORDER BY id DESC");

  return NextResponse.json(
    rows.map((row) => ({
      id: row.id,
      name: row.name,
      phone: row.phone,
      role: row.role ?? "",
      login: row.login ?? "",
      permissions: {
        canEditRestaurants: Boolean(row.can_edit_restaurants),
        canChangeRestaurantStatus: Boolean(row.can_change_restaurant_status),
        canManageEmployees: Boolean(row.can_manage_employees),
        canAddRestaurants: Boolean(row.can_add_restaurants),
      },
      createdAt: row.created_at,
    }))
  );
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  if (!(await hasPermission(request, "manage_employees"))) {
    return NextResponse.json({ ok: false }, { status: 403 });
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

  const name = (body?.name ?? "").trim();
  const phone = (body?.phone ?? "").trim();
  const role = (body?.role ?? "").trim();
  const login = (body?.login ?? "").trim();
  const password = (body?.password ?? "").trim();
  const permissions = body?.permissions ?? {};

  if (!name || !phone || !login || !password) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const adminLogin = process.env.ADMIN_LOGIN ?? "";
  if (login === adminLogin) {
    return NextResponse.json({ ok: false }, { status: 409 });
  }

  const existing = await db.get<{ id: number }>(
    "SELECT id FROM employees WHERE phone = ?",
    [phone]
  );
  if (existing) {
    return NextResponse.json({ ok: false }, { status: 409 });
  }
  const existingLogin = await db.get<{ id: number }>(
    "SELECT id FROM employees WHERE login = ?",
    [login]
  );
  if (existingLogin) {
    return NextResponse.json({ ok: false }, { status: 409 });
  }

  const { salt, hash } = hashClientPassword(password);
  const createdAt = new Date().toISOString();
  const inserted = await db.get<{ id: number }>(
    `INSERT INTO employees
      (name, phone, role, login, password_hash, password_salt, can_edit_restaurants, can_change_restaurant_status, can_manage_employees, can_add_restaurants, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     RETURNING id`,
    [
      name,
      phone,
      role || null,
      login,
      hash,
      salt,
      permissions.canEditRestaurants ? 1 : 0,
      permissions.canChangeRestaurantStatus ? 1 : 0,
      permissions.canManageEmployees ? 1 : 0,
      permissions.canAddRestaurants ? 1 : 0,
      createdAt,
    ]
  );

  return NextResponse.json({
    ok: true,
    employee: {
      id: inserted?.id ?? 0,
      name,
      phone,
      role,
      login,
      permissions: {
        canEditRestaurants: Boolean(permissions.canEditRestaurants),
        canChangeRestaurantStatus: Boolean(permissions.canChangeRestaurantStatus),
        canManageEmployees: Boolean(permissions.canManageEmployees),
        canAddRestaurants: Boolean(permissions.canAddRestaurants),
      },
      createdAt,
    },
  });
}
