// Applies the schema to the Postgres database in DATABASE_URL and creates the first admin.
// Runs automatically before every `next build` (so each Vercel deploy is migrated).
import fs from "node:fs";
import pg from "pg";
import { SCHEMA } from "../db/schema.mjs";
import { seed } from "../db/seed.mjs";

// load .env.local when run by hand (Vercel injects env vars itself)
for (const file of [".env.local", ".env"]) {
  if (!fs.existsSync(file)) continue;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
  }
}

const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!url) {
  console.log("[db] DATABASE_URL not set - skipping migration (local dev uses the embedded database in ./.data)");
  process.exit(0);
}

const pool = new pg.Pool({ connectionString: url, max: 1 });
try {
  await pool.query(SCHEMA);
  await seed((text, params) => pool.query(text, params).then((r) => r.rows), { demo: process.env.SEED_DEMO === "1" });
  console.log("[db] schema is up to date");
} finally {
  await pool.end();
}
