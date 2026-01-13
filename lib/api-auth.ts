import { getSessionCookieName, verifySessionToken } from "@/lib/auth";
import db from "@/lib/db";
import { verifyClientToken, type ClientTokenPayload } from "@/lib/client-jwt";

export const isAuthorized = (request: Request) => {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const cookies = Object.fromEntries(
    cookieHeader
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [key, ...rest] = part.split("=");
        return [key, decodeURIComponent(rest.join("="))];
      })
  );

  const secret = process.env.ADMIN_SESSION_SECRET ?? "";
  const session = cookies[getSessionCookieName()];
  if (session && secret && verifySessionToken(session, secret)) {
    return true;
  }

  return false;
};

export const getClientAuth = (request: Request): ClientTokenPayload | null => {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return null;
  return verifyClientToken(token);
};

export const isClientAuthorized = (request: Request) =>
  Boolean(getClientAuth(request));

export const getSessionLogin = (request: Request) => {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const cookies = Object.fromEntries(
    cookieHeader
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [key, ...rest] = part.split("=");
        return [key, decodeURIComponent(rest.join("="))];
      })
  );

  const secret = process.env.ADMIN_SESSION_SECRET ?? "";
  const session = cookies[getSessionCookieName()];
  if (!session || !secret) return null;

  const payload = verifySessionToken(session, secret);
  return payload?.login ?? null;
};

type PermissionKey =
  | "edit_restaurants"
  | "change_restaurant_status"
  | "add_restaurants"
  | "manage_employees";

export const hasPermission = async (
  request: Request,
  permission: PermissionKey
) => {
  const login = getSessionLogin(request);
  if (!login) return false;

  const adminLogin = process.env.ADMIN_LOGIN ?? "";
  if (login && adminLogin && login === adminLogin) {
    return true;
  }

  const employee = await db.get<{
    can_edit_restaurants: boolean;
    can_change_restaurant_status: boolean;
    can_add_restaurants: boolean;
    can_manage_employees: boolean;
  }>(
    `SELECT can_edit_restaurants, can_change_restaurant_status, can_add_restaurants, can_manage_employees
     FROM employees WHERE login = ?`,
    [login]
  );

  if (!employee) return false;

  if (permission === "edit_restaurants") {
    return Boolean(employee.can_edit_restaurants);
  }
  if (permission === "change_restaurant_status") {
    return Boolean(employee.can_change_restaurant_status);
  }
  if (permission === "add_restaurants") {
    return Boolean(employee.can_add_restaurants);
  }
  if (permission === "manage_employees") {
    return Boolean(employee.can_manage_employees);
  }
  return false;
};
