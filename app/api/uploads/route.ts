import { NextResponse } from "next/server";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { isAuthorized } from "@/lib/api-auth";

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const uploadsDir =
    process.env.UPLOAD_DIR ?? path.join(process.cwd(), "public", "uploads");
  await mkdir(uploadsDir, { recursive: true });

  const ext = path.extname(file.name || "").toLowerCase() || ".png";
  const filename = `${Date.now()}-${Math.random()
    .toString(16)
    .slice(2)}${ext}`;
  const filePath = path.join(uploadsDir, filename);

  await writeFile(filePath, buffer);

  return NextResponse.json({ ok: true, url: `/uploads/${filename}` });
}
