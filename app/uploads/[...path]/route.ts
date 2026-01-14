import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { getUploadsDir } from "@/lib/uploads";

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

const getContentType = (ext: string) => {
  const normalized = ext.toLowerCase();
  if (normalized === ".jpg" || normalized === ".jpeg") return "image/jpeg";
  if (normalized === ".png") return "image/png";
  if (normalized === ".webp") return "image/webp";
  if (normalized === ".gif") return "image/gif";
  if (normalized === ".svg") return "image/svg+xml";
  return "application/octet-stream";
};

const resolveUploadPath = (parts: string[]) => {
  const safeParts = parts.filter(Boolean);
  const normalized = path.normalize(safeParts.join("/"));
  if (
    normalized.startsWith("..") ||
    normalized.includes("../") ||
    normalized.includes("..\\")
  ) {
    return null;
  }
  const uploadsDir = getUploadsDir();
  return path.join(uploadsDir, normalized);
};

export async function GET(_request: NextRequest, context: RouteContext) {
  const { path: parts } = await context.params;
  const filePath = resolveUploadPath(parts);
  if (!filePath) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  try {
    const buffer = await readFile(filePath);
    const ext = path.extname(filePath);
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": getContentType(ext),
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return NextResponse.json({ ok: false }, { status: 404 });
  }
}

