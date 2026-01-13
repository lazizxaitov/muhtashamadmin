import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";

const resolveSqlitePath = (value) => {
  if (value.startsWith("file:")) {
    return fileURLToPath(new URL(value));
  }
  return value;
};

const connectionString = (process.env.DATABASE_URL ?? "").trim();
const dbPath = connectionString
  ? resolveSqlitePath(connectionString)
  : path.join(process.cwd(), "data.sqlite");
const dbDir = path.dirname(dbPath);
fs.mkdirSync(dbDir, { recursive: true });

const schemaPath = path.join(process.cwd(), "schema.sql");
if (!fs.existsSync(schemaPath)) {
  throw new Error("schema.sql not found in project root.");
}
const schemaSql = fs.readFileSync(schemaPath, "utf8");

const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("busy_timeout = 5000");
db.exec(schemaSql);
db.close();

console.log(`SQLite schema applied to ${dbPath}`);
