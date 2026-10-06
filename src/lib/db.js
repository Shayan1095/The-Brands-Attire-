import "server-only";
import fs from "node:fs";
import pg from "pg";
import { SCHEMA } from "@db/schema.mjs";
import { seed } from "@db/seed.mjs";

/*
  One tiny data-access layer for two drivers:
  - production: Postgres over DATABASE_URL (Neon, Supabase, ...)
  - local dev:  PGlite, a real Postgres embedded in Node, stored in ./.data (no install needed)
*/
async function connect() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;

  if (url) {
    const pool = new pg.Pool({ connectionString: url, max: 3 });
    const run = (client) => (text, params) => client.query(text, params).then((r) => r.rows);
    return {
      query: run(pool),
      async tx(fn) {
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          const result = await fn(run(client));
          await client.query("COMMIT");
          return result;
        } catch (err) {
          await client.query("ROLLBACK");
          throw err;
        } finally {
          client.release();
        }
      },
    };
  }

  if (process.env.VERCEL) throw new Error("DATABASE_URL is not set. Add a Postgres database to this Vercel project.");

  const { PGlite } = await import("@electric-sql/pglite");
  fs.mkdirSync("./.data", { recursive: true });
  const db = new PGlite("./.data/pglite");
  const query = (text, params) => db.query(text, params).then((r) => r.rows);
  await db.exec(SCHEMA);
  await seed(query, { demo: true });
  return {
    query,
    tx: (fn) => db.transaction((t) => fn((text, params) => t.query(text, params).then((r) => r.rows))),
  };
}

const db = () => (globalThis.__tbaDb ??= connect());

/** Run a query and get the rows back. */
export async function query(text, params) {
  return (await db()).query(text, params);
}

/** Run several queries in one transaction: `tx(async (q) => { await q(...) })`. */
export async function tx(fn) {
  return (await db()).tx(fn);
}
