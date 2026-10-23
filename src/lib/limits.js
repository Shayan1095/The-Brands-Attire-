import "server-only";
import { headers } from "next/headers";
import { query } from "./db";

/*
  Rate limits for the public parts of the shop (checkout, codes, chat, sign-ups, tracking, contact form).
  Server actions are open endpoints: without limits a script can guess discount codes, flood the inbox with
  chats, or reserve all the stock with fake orders. Counts live in the shop's own database (rate_limits),
  so this needs no extra service. Each limit is "at most `max` in `seconds`" per visitor (their IP address).
*/

/** Who is asking: the visitor's IP as Vercel reports it ("local" in development). */
export async function visitor() {
  const h = await headers();
  return (h.get("x-forwarded-for") || "").split(",")[0].trim() || h.get("x-real-ip") || "local";
}

/**
 * Counts one more use of `key` in the current window. Returns true while it is within `max`.
 * Fails open (allows) if the database cannot be reached, so a hiccup never blocks real customers.
 */
export async function allow(key, max, seconds) {
  try {
    const bucket = Math.floor(Date.now() / 1000 / seconds);
    const [row] = await query(
      `INSERT INTO rate_limits (key, bucket, n) VALUES ($1, $2, 1)
       ON CONFLICT (key, bucket) DO UPDATE SET n = rate_limits.n + 1 RETURNING n`,
      [key, bucket]
    );
    // now and then, forget yesterday's counts
    if (Math.random() < 0.01) await query("DELETE FROM rate_limits WHERE created_at < now() - interval '1 day'");
    return row.n <= max;
  } catch (err) {
    console.error("[limits]", err.message);
    return true;
  }
}

/** allow() for this visitor: limit(name, max, seconds). */
export async function limit(name, max, seconds) {
  return allow(`${name}:${await visitor()}`, max, seconds);
}

export const BUSY = "Too many tries in a short time. Please wait a few minutes and try again, or message us on WhatsApp.";
