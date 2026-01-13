import Database from "better-sqlite3";
import { fileURLToPath } from "url";
import path from "path";

type QueryParam = string | number | boolean | null;
type QueryResultRow = Record<string, unknown>;

const resolveSqlitePath = (value: string) => {
  if (value.startsWith("file:")) {
    return fileURLToPath(new URL(value));
  }
  return value;
};

const sqliteUrl = (process.env.DATABASE_URL ?? "").trim();
const dbPath = sqliteUrl
  ? resolveSqlitePath(sqliteUrl)
  : path.join(process.cwd(), "data.sqlite");

const createInstance = () => {
  const instance = new Database(dbPath);
  instance.pragma("journal_mode = WAL");
  instance.pragma("busy_timeout = 5000");
  instance.exec(`
    CREATE TABLE IF NOT EXISTS restaurants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      address TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL,
      image TEXT NOT NULL,
      logo TEXT,
      color TEXT NOT NULL,
      open INTEGER NOT NULL DEFAULT 1,
      added_at TEXT NOT NULL,
      token_poster TEXT,
      spot_id TEXT,
      integration_type TEXT,
      onec_base_url TEXT,
      onec_auth_method TEXT,
      onec_login TEXT,
      onec_password TEXT,
      onec_token TEXT,
      work_start TEXT,
      work_end TEXT,
      auto_schedule INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS restaurant_fees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      restaurant_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      price INTEGER NOT NULL DEFAULT 0,
      is_default INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS restaurant_fees_restaurant_idx ON restaurant_fees(restaurant_id);

    CREATE TABLE IF NOT EXISTS banners (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      image TEXT NOT NULL,
      status TEXT NOT NULL,
      open INTEGER NOT NULL DEFAULT 1,
      added_at TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS banners_sort_order_idx ON banners(sort_order);

    CREATE TABLE IF NOT EXISTS menu_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      restaurant_id INTEGER NOT NULL,
      name_ru TEXT NOT NULL,
      name_uz TEXT NOT NULL,
      image TEXT,
      hidden INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      source TEXT,
      source_id TEXT
    );
    CREATE INDEX IF NOT EXISTS menu_categories_restaurant_idx ON menu_categories(restaurant_id);

    CREATE TABLE IF NOT EXISTS menu_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL,
      name_ru TEXT NOT NULL,
      name_uz TEXT NOT NULL,
      description_ru TEXT,
      description_uz TEXT,
      price INTEGER NOT NULL DEFAULT 0,
      image TEXT,
      hidden INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      source TEXT,
      source_id TEXT
    );
    CREATE INDEX IF NOT EXISTS menu_items_category_idx ON menu_items(category_id);

    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT NOT NULL UNIQUE,
      name TEXT,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      created_at TEXT NOT NULL,
      orders_count INTEGER NOT NULL DEFAULT 0,
      last_order_at TEXT
    );
    CREATE INDEX IF NOT EXISTS clients_phone_idx ON clients(phone);

    CREATE TABLE IF NOT EXISTS client_addresses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL,
      title TEXT,
      address TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS client_addresses_client_idx ON client_addresses(client_id);

    CREATE TABLE IF NOT EXISTS employees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT NOT NULL UNIQUE,
      role TEXT,
      login TEXT UNIQUE,
      password_hash TEXT,
      password_salt TEXT,
      can_edit_restaurants INTEGER NOT NULL DEFAULT 0,
      can_change_restaurant_status INTEGER NOT NULL DEFAULT 0,
      can_manage_employees INTEGER NOT NULL DEFAULT 0,
      can_add_restaurants INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS employees_login_idx ON employees(login);

    CREATE TABLE IF NOT EXISTS newsletters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      image TEXT,
      channel TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      delivered_at TEXT,
      error TEXT,
      deleted_at TEXT
    );
    CREATE INDEX IF NOT EXISTS newsletters_created_at_idx ON newsletters(created_at);

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT
    );
  `);
  return instance;
};

type SqliteDb = ReturnType<typeof createInstance>;
const globalForDb = globalThis as { __sqliteDb?: SqliteDb };

const getDefaultDb = () => {
  if (!globalForDb.__sqliteDb) {
    globalForDb.__sqliteDb = createInstance();
  }
  return globalForDb.__sqliteDb;
};

const getDb = (client?: SqliteDb) => client ?? getDefaultDb();

const all = async <T extends QueryResultRow>(
  sql: string,
  params: QueryParam[] = [],
  client?: SqliteDb
): Promise<T[]> => {
  const statement = getDb(client).prepare(sql);
  return statement.all(...params) as T[];
};

const get = async <T extends QueryResultRow>(
  sql: string,
  params: QueryParam[] = [],
  client?: SqliteDb
): Promise<T | undefined> => {
  const statement = getDb(client).prepare(sql);
  return statement.get(...params) as T | undefined;
};

const run = async (
  sql: string,
  params: QueryParam[] = [],
  client?: SqliteDb
) => {
  const statement = getDb(client).prepare(sql);
  return statement.run(...params);
};

const transaction = async <T>(callback: (client: SqliteDb) => Promise<T>) => {
  const db = getDefaultDb();
  db.exec("BEGIN");
  try {
    const result = await callback(db);
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
};

const db = { all, get, run, transaction };
export type DbClient = SqliteDb;
export default db;
