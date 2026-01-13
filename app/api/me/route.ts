import { NextResponse } from "next/server";
import db from "@/lib/db";
import { getSessionLogin, isAuthorized } from "@/lib/api-auth";

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const login = getSessionLogin(request);
  if (!login) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const adminLogin = process.env.ADMIN_LOGIN ?? "";
  if (adminLogin && login === adminLogin) {
    return NextResponse.json({
      ok: true,
      login,
      permissions: {
        canEditRestaurants: true,
        canChangeRestaurantStatus: true,
        canAddRestaurants: true,
        canManageEmployees: true,
      },
    });
  }

  const employee = await db.get<{
    login: string;
    can_edit_restaurants: number;
    can_change_restaurant_status: number;
    can_add_restaurants: number;
    can_manage_employees: number;
  }>(`SELECT login, can_edit_restaurants, can_change_restaurant_status, can_add_restaurants, can_manage_employees
       FROM employees WHERE login = ?`, [login]);

  if (!employee) {
    return NextResponse.json({ ok: false }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    login: employee.login,
    permissions: {
      canEditRestaurants: Boolean(employee.can_edit_restaurants),
      canChangeRestaurantStatus: Boolean(employee.can_change_restaurant_status),
      canAddRestaurants: Boolean(employee.can_add_restaurants),
      canManageEmployees: Boolean(employee.can_manage_employees),
    },
  });
}
