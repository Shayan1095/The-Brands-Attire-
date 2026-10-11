import fs from "node:fs";
import pg from "pg";
import { PGlite } from "@electric-sql/pglite";
import { SCHEMA } from "../db/schema.mjs";

const { Pool } = pg;

/*
 * ============================================================
 * LOAD .env.local
 * ============================================================
 */

function loadEnvLocal() {
  const path = ".env.local";

  if (!fs.existsSync(path)) {
    throw new Error(".env.local not found");
  }

  const content = fs.readFileSync(path, "utf8");

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const index = trimmed.indexOf("=");

    if (index === -1) {
      continue;
    }

    const key = trimmed.slice(0, index).trim();

    let value = trimmed.slice(index + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadEnvLocal();

const neonUrl =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL;

if (!neonUrl) {
  throw new Error(
    "DATABASE_URL or POSTGRES_URL is missing from .env.local"
  );
}

/*
 * ============================================================
 * START
 * ============================================================
 */

console.log("\n========================================");
console.log(" LOCAL PGLITE -> NEON MIGRATION");
console.log("========================================\n");

console.log("Opening local database...");

const local = new PGlite("./.data/pglite");

console.log("Connecting to Neon...");

const pool = new Pool({
  connectionString: neonUrl,
  max: 2,
});

const client = await pool.connect();

let foreignKeysMadeDeferrable = false;
let foreignKeys = [];
function normalizeJsonValue(value) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  if (typeof value === "string") {
    try {
      return JSON.stringify(JSON.parse(value));
    } catch {
      return value;
    }
  }

  return value;
}

try {
  /*
   * ============================================================
   * STEP 1
   * CREATE NEON SCHEMA
   * ============================================================
   */

  console.log("\n[1/7] Creating Neon schema...");

  await client.query(SCHEMA);

  console.log("Schema ready");

  /*
   * ============================================================
   * STEP 2
   * FIND LOCAL TABLES
   * ============================================================
   */

  console.log("\n[2/7] Reading local tables...");

  const tableResult = await local.query(`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
    ORDER BY tablename
  `);

  const tables = tableResult.rows
    .map((row) => row.tablename)
    .filter(
      (name) =>
        !name.startsWith("pg_") &&
        name !== "_pglite_migrations"
    );

  console.log(`Found ${tables.length} tables`);

  /*
   * ============================================================
   * STEP 3
   * MAKE SURE NEON IS EMPTY
   * ============================================================
   *
   * We intentionally do NOT merge into an existing database.
   * This migration is designed for the empty Neon database
   * that you just created.
   */

  console.log("\n[3/7] Checking Neon database...");

  const existingRows = [];

  for (const table of tables) {
    const result = await client.query(
      `SELECT COUNT(*)::int AS count FROM "${table}"`
    );

    const count = result.rows[0].count;

    if (count > 0) {
      existingRows.push({
        table,
        count,
      });
    }
  }

  if (existingRows.length > 0) {
    console.error("\nNeon is not empty.\n");

    console.table(existingRows);

    throw new Error(
      "Migration stopped because Neon already contains data. No data was changed."
    );
  }

  console.log("Neon is empty");

  /*
   * ============================================================
   * STEP 4
   * FIND FOREIGN KEYS
   * ============================================================
   *
   * PostgreSQL normally checks a foreign key immediately.
   *
   * During this migration we temporarily make all foreign keys
   * DEFERRABLE and defer their checks until COMMIT.
   *
   * This safely handles:
   *
   * - orders -> contacts
   * - stock_movements -> orders
   * - order_items -> orders
   * - cases -> orders
   * - case_items -> orders/order_items
   * - order_events -> orders
   * - loyalty_ledger -> orders
   * - feedback -> orders
   * - orders.exchange_of -> orders
   *
   * This means we don't have to guess the perfect table order.
   */

  console.log("\n[4/7] Preparing foreign-key constraints...");

  const fkResult = await client.query(`
    SELECT
      n.nspname AS schema_name,
      c.relname AS table_name,
      con.conname AS constraint_name
    FROM pg_constraint con
    JOIN pg_class c
      ON c.oid = con.conrelid
    JOIN pg_namespace n
      ON n.oid = c.relnamespace
    WHERE con.contype = 'f'
      AND n.nspname = 'public'
    ORDER BY c.relname, con.conname
  `);

  foreignKeys = fkResult.rows;

  console.log(
    `Found ${foreignKeys.length} foreign-key constraints`
  );

  /*
   * ============================================================
   * STEP 5
   * IMPORT EVERYTHING IN ONE TRANSACTION
   * ============================================================
   */

  console.log("\n[5/7] Importing local data...\n");

  await client.query("BEGIN");

  /*
   * Temporarily make every FK constraint deferrable.
   */

  for (const fk of foreignKeys) {
    const table = `"${fk.table_name}"`;
    const constraint = `"${fk.constraint_name}"`;

    await client.query(
      `ALTER TABLE ${table} ALTER CONSTRAINT ${constraint} DEFERRABLE`
    );
  }

  foreignKeysMadeDeferrable = true;

  /*
   * Defer FK validation until COMMIT.
   */

  await client.query("SET CONSTRAINTS ALL DEFERRED");

  /*
   * ------------------------------------------------------------
   * IMPORT ORDER
   * ------------------------------------------------------------
   *
   * Foreign keys are deferred, so this order is no longer
   * responsible for correctness.
   *
   * We still use a sensible order for readability.
   */

  const preferredOrder = [
    "settings",
    "admins",
    "categories",

    "contacts",

    "products",
    "product_images",
    "variants",

    "orders",
    "order_items",
    "stock_movements",

    "sales",
    "coupons",

    "campaigns",
    "messages",

    "stock_alerts",
    "banners",
    "contact_messages",

    "order_events",

    "conversations",
    "chat_messages",

    "faqs",
    "checkouts",

    "cases",
    "case_items",
    "case_events",

    "loyalty_ledger",
    "feedback",
  ];

  const orderedTables = [
    ...preferredOrder.filter((table) =>
      tables.includes(table)
    ),

    ...tables.filter(
      (table) => !preferredOrder.includes(table)
    ),
  ];

  /*
   * ------------------------------------------------------------
   * COPY ROWS
   * ------------------------------------------------------------
   */

  for (const table of orderedTables) {
    const localRows = await local.query(
      `SELECT * FROM "${table}"`
    );

    const rows = localRows.rows;

    if (rows.length === 0) {
      console.log(`- ${table}: 0 rows`);
      continue;
    }

    const columnsResult = await local.query(
      `
    SELECT
      column_name,
      data_type,
      udt_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = $1
    ORDER BY ordinal_position
  `,
      [table]
    );

    const columnDefinitions = columnsResult.rows;

    const columns = columnDefinitions.map(
      (row) => row.column_name
    );

    const columnList = columns
      .map((column) => `"${column}"`)
      .join(", ");

    for (const row of rows) {
      const values = columnDefinitions.map((column) => {
        const value = row[column.column_name];

        if (
          column.data_type === "json" ||
          column.data_type === "jsonb"
        ) {
          return normalizeJsonValue(value);
        }

        return value;
      });

      const placeholders = values
        .map((_, index) => `$${index + 1}`)
        .join(", ");

      const sql = `
        INSERT INTO "${table}" (${columnList})
        VALUES (${placeholders})
      `;

      /*
       * IMPORTANT:
       *
       * There is intentionally NO:
       *
       * ON CONFLICT DO NOTHING
       *
       * because Neon must be empty.
       *
       * If something unexpectedly goes wrong, we want the
       * migration to fail instead of silently losing rows.
       */

      await client.query(sql, values);
    }

    console.log(`✓ ${table}: ${rows.length} rows`);
  }

  /*
   * ------------------------------------------------------------
   * CHECK FOREIGN KEYS
   * ------------------------------------------------------------
   *
   * SET CONSTRAINTS ALL IMMEDIATE forces PostgreSQL to validate
   * all deferred foreign keys before we commit.
   *
   * If something is actually broken in the local data,
   * migration stops here instead of creating bad production data.
   */

  console.log(
    "\nValidating foreign-key relationships..."
  );

  await client.query("SET CONSTRAINTS ALL IMMEDIATE");

  console.log("Foreign-key validation passed");

  /*
   * ------------------------------------------------------------
   * FIX SERIAL / ID SEQUENCES
   * ------------------------------------------------------------
   */

  console.log("\nFixing PostgreSQL sequences...");

  const serialColumns = await local.query(`
    SELECT
      c.table_name,
      c.column_name
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.column_default LIKE 'nextval(%'
    ORDER BY c.table_name, c.column_name
  `);

  for (const item of serialColumns.rows) {
    const table = item.table_name;
    const column = item.column_name;

    const sequenceResult = await client.query(
      `
      SELECT pg_get_serial_sequence(
        $1,
        $2
      ) AS sequence
      `,
      [`public.${table}`, column]
    );

    const sequence =
      sequenceResult.rows[0]?.sequence;

    if (!sequence) {
      continue;
    }

    const maxResult = await client.query(
      `
      SELECT MAX("${column}") AS max_id
      FROM "${table}"
      `
    );

    const maxId = maxResult.rows[0].max_id;

    if (maxId === null) {
      await client.query(
        `SELECT setval($1, 1, false)`,
        [sequence]
      );
    } else {
      await client.query(
        `SELECT setval($1, $2, true)`,
        [sequence, maxId]
      );
    }
  }

  /*
   * ------------------------------------------------------------
   * COMMIT
   * ------------------------------------------------------------
   */

  console.log("\nCommitting migration...");

  await client.query("COMMIT");

  /*
   * ============================================================
   * STEP 6
   * RESTORE FOREIGN KEY BEHAVIOR
   * ============================================================
   */

  console.log(
    "\n[6/7] Restoring foreign-key constraints..."
  );

  for (const fk of foreignKeys) {
    const table = `"${fk.table_name}"`;
    const constraint = `"${fk.constraint_name}"`;

    await client.query(
      `ALTER TABLE ${table} ALTER CONSTRAINT ${constraint} NOT DEFERRABLE`
    );
  }

  foreignKeysMadeDeferrable = false;

  console.log("Foreign-key constraints restored");

  /*
   * ============================================================
   * STEP 7
   * VERIFY EVERYTHING
   * ============================================================
   */

  console.log("\n[7/7] Verifying migration...\n");

  let mismatches = 0;

  for (const table of orderedTables) {
    const localCountResult = await local.query(
      `SELECT COUNT(*)::int AS count FROM "${table}"`
    );

    const neonCountResult = await client.query(
      `SELECT COUNT(*)::int AS count FROM "${table}"`
    );

    const localCount =
      localCountResult.rows[0].count;

    const neonCount =
      neonCountResult.rows[0].count;

    if (localCount === neonCount) {
      console.log(
        `✓ ${table}: ${localCount}`
      );
    } else {
      mismatches++;

      console.log(
        `✗ ${table}: LOCAL=${localCount}, NEON=${neonCount}`
      );
    }
  }

  console.log("");

  if (mismatches > 0) {
    console.log("========================================");
    console.log(
      `WARNING: ${mismatches} TABLE(S) DIFFER`
    );
    console.log("========================================");

    throw new Error(
      "Migration completed but row-count verification found mismatches."
    );
  }

  console.log("========================================");
  console.log(" ALL TABLE COUNTS MATCH");
  console.log(" MIGRATION SUCCESSFUL");
  console.log("========================================\n");

} catch (error) {
  /*
   * ============================================================
   * ROLLBACK
   * ============================================================
   */

  try {
    await client.query("ROLLBACK");
  } catch { }

  console.error("\n========================================");
  console.error(" MIGRATION FAILED");
  console.error("========================================\n");

  console.error(error);

  /*
   * If the transaction rolled back, the DEFERRABLE changes
   * also rolled back automatically.
   */

  process.exitCode = 1;

} finally {
  client.release();

  await pool.end();

  await local.close();
}