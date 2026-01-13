import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { getClientAuth } from "@/lib/api-auth";

type RouteContext = {
  params: Promise<{ addressId: string }>;
};

export async function DELETE(request: NextRequest, context: RouteContext) {
  const client = getClientAuth(request);
  if (!client) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const { addressId } = await context.params;
  const addrId = Number(addressId);
  if (!Number.isFinite(addrId)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const result = await db.run(
    "DELETE FROM client_addresses WHERE id = ? AND client_id = ?",
    [addrId, client.sub]
  );

  if (!result || result.changes === 0) {
    return NextResponse.json({ ok: false }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
