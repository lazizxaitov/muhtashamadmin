import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";

const resolveSqlitePath = (value) => {
  if (value.startsWith("file:")) {
    return fileURLToPath(new URL(value));
  }
  return value;
};

const sqliteUrl = (process.env.DATABASE_URL ?? "").trim();
const dbPath = sqliteUrl
  ? resolveSqlitePath(sqliteUrl)
  : path.join(process.cwd(), "data.sqlite");

const phone = "+998997447744";
const password = "test";

const salt = crypto.randomBytes(16).toString("hex");
const hash = crypto.scryptSync(password, salt, 64).toString("hex");

const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("busy_timeout = 5000");

const existing = db
  .prepare("SELECT id FROM clients WHERE phone = ?")
  .get(phone);

if (existing?.id) {
  db.prepare(
    "UPDATE clients SET password_hash = ?, password_salt = ? WHERE id = ?"
  ).run(hash, salt, existing.id);
} else {
  db.prepare(
    "INSERT INTO clients (phone, name, password_hash, password_salt, created_at) VALUES (?, ?, ?, ?, ?)"
  ).run(phone, "Test Client", hash, salt, new Date().toISOString());
}

db.close();
console.log("Test client is ready:", phone);
