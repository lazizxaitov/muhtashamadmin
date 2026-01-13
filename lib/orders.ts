import db from "@/lib/db";

export type StoredOrderItem = {
  id: number;
  name: string;
  qty: number;
  price: number;
};

export type OrderStatus = "pending" | "pending_payment" | "sent" | "failed";

export const ensureOrdersTable = async () => {
  await db.run(
    `CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      restaurant_id INTEGER NOT NULL,
      client_id INTEGER,
      client_name TEXT,
      client_phone TEXT,
      items_json TEXT NOT NULL,
      comment TEXT,
      delivery_price INTEGER,
      service_mode INTEGER,
      fees_json TEXT,
      delivery_address TEXT,
      payment_method TEXT,
      payment_payload_json TEXT,
      payment_confirm_payload_json TEXT,
      poster_incoming_id TEXT,
      poster_status INTEGER,
      poster_updated_at TEXT,
      status TEXT NOT NULL,
      poster_payload_json TEXT,
      poster_error_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`
  );
  const columns = await db.all<{ name: string }>("PRAGMA table_info(orders)");
  const columnNames = new Set(columns.map((column) => column.name));
  if (!columnNames.has("delivery_price")) {
    await db.run("ALTER TABLE orders ADD COLUMN delivery_price INTEGER");
  }
  if (!columnNames.has("service_mode")) {
    await db.run("ALTER TABLE orders ADD COLUMN service_mode INTEGER");
  }
  if (!columnNames.has("fees_json")) {
    await db.run("ALTER TABLE orders ADD COLUMN fees_json TEXT");
  }
  if (!columnNames.has("delivery_address")) {
    await db.run("ALTER TABLE orders ADD COLUMN delivery_address TEXT");
  }
  if (!columnNames.has("payment_method")) {
    await db.run("ALTER TABLE orders ADD COLUMN payment_method TEXT");
  }
  if (!columnNames.has("payment_payload_json")) {
    await db.run("ALTER TABLE orders ADD COLUMN payment_payload_json TEXT");
  }
  if (!columnNames.has("payment_confirm_payload_json")) {
    await db.run("ALTER TABLE orders ADD COLUMN payment_confirm_payload_json TEXT");
  }
  if (!columnNames.has("poster_incoming_id")) {
    await db.run("ALTER TABLE orders ADD COLUMN poster_incoming_id TEXT");
  }
  if (!columnNames.has("poster_status")) {
    await db.run("ALTER TABLE orders ADD COLUMN poster_status INTEGER");
  }
  if (!columnNames.has("poster_updated_at")) {
    await db.run("ALTER TABLE orders ADD COLUMN poster_updated_at TEXT");
  }
  await db.run(
    "CREATE INDEX IF NOT EXISTS orders_created_at_idx ON orders(created_at)"
  );
  await db.run(
    "CREATE INDEX IF NOT EXISTS orders_restaurant_idx ON orders(restaurant_id)"
  );
};

export const createOrder = async (input: {
  restaurantId: number;
  clientId: number;
  clientName: string;
  clientPhone: string;
  items: StoredOrderItem[];
  comment: string;
  deliveryPrice?: number;
  serviceMode?: number;
  fees?: Array<{ title: string; price: number }>;
  deliveryAddress?: string;
  paymentMethod?: string;
  paymentPayload?: unknown;
  status: OrderStatus;
  createdAt: string;
}) => {
  const itemsJson = JSON.stringify(input.items);
  const feesJson =
    Array.isArray(input.fees) && input.fees.length > 0
      ? JSON.stringify(input.fees)
      : null;
  const paymentPayloadJson =
    typeof input.paymentPayload === "undefined"
      ? null
      : JSON.stringify(input.paymentPayload);
  const result = await db.get<{ id: number }>(
    `INSERT INTO orders (
      restaurant_id,
      client_id,
      client_name,
      client_phone,
      items_json,
      comment,
      delivery_price,
      service_mode,
      fees_json,
      delivery_address,
      payment_method,
      payment_payload_json,
      status,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    RETURNING id`,
    [
      input.restaurantId,
      input.clientId,
      input.clientName,
      input.clientPhone,
      itemsJson,
      input.comment,
      typeof input.deliveryPrice === "number" ? input.deliveryPrice : null,
      typeof input.serviceMode === "number" ? input.serviceMode : null,
      feesJson,
      input.deliveryAddress ?? null,
      input.paymentMethod ?? null,
      paymentPayloadJson,
      input.status,
      input.createdAt,
      input.createdAt,
    ]
  );
  return result?.id ?? null;
};

export const updateOrderStatus = async (input: {
  orderId: number;
  status: OrderStatus;
  payload?: unknown;
  error?: unknown;
  updatedAt: string;
}) => {
  const payloadJson =
    typeof input.payload === "undefined"
      ? null
      : JSON.stringify(input.payload);
  const errorJson =
    typeof input.error === "undefined" ? null : JSON.stringify(input.error);
  await db.run(
    `UPDATE orders
     SET status = ?, poster_payload_json = ?, poster_error_json = ?, updated_at = ?
     WHERE id = ?`,
    [input.status, payloadJson, errorJson, input.updatedAt, input.orderId]
  );
};
