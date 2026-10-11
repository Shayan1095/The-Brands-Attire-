import fs from "node:fs";
import pg from "pg";

const { Pool } = pg;

const env = fs.readFileSync(".env.local", "utf8");

for (const line of env.split(/\r?\n/)) {
  const trimmed = line.trim();

  if (!trimmed || trimmed.startsWith("#")) continue;

  const i = trimmed.indexOf("=");

  if (i === -1) continue;

  const key = trimmed.slice(0, i).trim();
  let value = trimmed.slice(i + 1).trim();

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  process.env[key] ??= value;
}

const neonUrl =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL;

if (!neonUrl) {
  throw new Error("DATABASE_URL or POSTGRES_URL is missing from .env.local");
}

const pool = new Pool({
  connectionString: neonUrl,
});

const client = await pool.connect();

try {
  console.log("\n========================================");
  console.log(" NEON DATABASE CHECK");
  console.log("========================================\n");

  const tables = [
    "admins",
    "categories",
    "products",
    "product_images",
    "variants",
    "contacts",
    "orders",
    "order_items",
    "stock_movements",
  ];

  for (const table of tables) {
    const result = await client.query(
      `SELECT COUNT(*)::int AS count FROM "${table}"`
    );

    console.log(`${table}: ${result.rows[0].count}`);
  }

  console.log("\n========================================");
  console.log(" ORDERS");
  console.log("========================================\n");

 const orders = await client.query(`
    SELECT *
    FROM orders
    ORDER BY id
    LIMIT 20
  `);

  console.table(orders.rows);

  console.log("\n========================================");
  console.log(" STOCK MOVEMENTS");
  console.log("========================================\n");

  const movements = await client.query(`
    SELECT
      id,
      order_id,
      variant_id
    FROM stock_movements
    ORDER BY id
    LIMIT 20
  `);

  console.table(movements.rows);

  console.log("\n========================================");
  console.log(" CHECK COMPLETE");
  console.log("========================================\n");

} finally {
  client.release();
  await pool.end();
}