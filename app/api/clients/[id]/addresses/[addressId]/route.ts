import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { isAuthorized } from "@/lib/api-auth";

type RouteContext = {
  params: Promise<{ id: string; addressId: string }>;
};

export async function DELETE(request: NextRequest, context: RouteContext) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const { id, addressId } = await context.params;
  const clientId = Number(id);
  const addrId = Number(addressId);
  if (!Number.isFinite(clientId) || !Number.isFinite(addrId)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const result = await db.run(
    "DELETE FROM client_addresses WHERE id = ? AND client_id = ?",
    [addrId, clientId]
  );

  if (!result || result.changes === 0) {
    return NextResponse.json({ ok: false }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
