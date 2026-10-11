import { PGlite } from "@electric-sql/pglite";

const local = new PGlite("./.data/pglite");

try {
  console.log("\n========================================");
  console.log(" CHECKOUTS DATA");
  console.log("========================================\n");

  const columns = await local.query(`
    SELECT
      column_name,
      data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'checkouts'
    ORDER BY ordinal_position
  `);

  console.table(columns.rows);

  const rows = await local.query(`
    SELECT *
    FROM checkouts
  `);

  console.log("\nROWS:\n");

  console.dir(rows.rows, {
    depth: null,
    maxArrayLength: null,
  });

  console.log("\n========================================\n");
} finally {
  await local.close();
}