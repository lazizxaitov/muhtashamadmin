import path from "path";

export const getUploadsDir = () =>
  (process.env.UPLOAD_DIR ?? path.join(process.cwd(), "public", "uploads")).trim();

