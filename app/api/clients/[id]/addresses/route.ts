import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { isAuthorized } from "@/lib/api-auth";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const { id } = await context.params;
  const clientId = Number(id);
  if (!Number.isFinite(clientId)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const rows = await db.all<{
    id: number;
    title: string | null;
    address: string;
    created_at: string;
  }>("SELECT id, title, address, created_at FROM client_addresses WHERE client_id = ? ORDER BY id DESC", [clientId]);

  return NextResponse.json(
    rows.map((row) => ({
      id: row.id,
      title: row.title ?? "",
      address: row.address,
      createdAt: row.created_at,
    }))
  );
}

export async function POST(request: NextRequest, context: RouteContext) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const { id } = await context.params;
  const clientId = Number(id);
  if (!Number.isFinite(clientId)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const body = (await request.json()) as {
    title?: string;
    address?: string;
  };

  const title = (body?.title ?? "").trim();
  const address = (body?.address ?? "").trim();

  if (!address) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const createdAt = new Date().toISOString();
  const result = await db.get<{ id: number }>(
    "INSERT INTO client_addresses (client_id, title, address, created_at) VALUES (?, ?, ?, ?) RETURNING id",
    [clientId, title || null, address, createdAt]
  );

  return NextResponse.json({
    ok: true,
    address: {
      id: result?.id,
      title,
      address,
      createdAt,
    },
  });
}
