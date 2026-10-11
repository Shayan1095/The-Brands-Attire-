import fs from "node:fs";
import pg from "pg";

const { Pool } = pg;

const env = fs.readFileSync(".env.local", "utf8");

for (const line of env.split(/\r?\n/)) {
  const trimmed = line.trim();

  if (!trimmed || trimmed.startsWith("#")) continue;

  const index = trimmed.indexOf("=");

  if (index === -1) continue;

  const key = trimmed.slice(0, index).trim();
  let value = trimmed.slice(index + 1).trim();

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  process.env[key] ??= value;
}

const databaseUrl =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL or POSTGRES_URL is missing");
}

const pool = new Pool({
  connectionString: databaseUrl,
});

try {
  const result = await pool.query(`
    SELECT
      column_name,
      data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'orders'
    ORDER BY ordinal_position
  `);

  console.log("\n========================================");
  console.log(" ORDERS TABLE COLUMNS");
  console.log("========================================\n");

  console.table(result.rows);

  console.log("\n========================================\n");
} finally {
  await pool.end();
}