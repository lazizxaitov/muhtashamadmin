import { NextResponse } from "next/server";
import db from "@/lib/db";
import { getClientAuth } from "@/lib/api-auth";

export async function GET(request: Request) {
  const client = getClientAuth(request);
  if (!client) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const rows = await db.all<{
    id: number;
    title: string | null;
    address: string;
    created_at: string;
  }>("SELECT id, title, address, created_at FROM client_addresses WHERE client_id = ? ORDER BY id DESC", [client.sub]);

  return NextResponse.json(
    rows.map((row) => ({
      id: row.id,
      title: row.title ?? "",
      address: row.address,
      createdAt: row.created_at,
    }))
  );
}

export async function POST(request: Request) {
  const client = getClientAuth(request);
  if (!client) {
    return NextResponse.json({ ok: false }, { status: 401 });
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
    [client.sub, title || null, address, createdAt]
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
