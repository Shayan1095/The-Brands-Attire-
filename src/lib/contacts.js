import "server-only";
import crypto from "node:crypto";
import { query } from "./db";

/**
 * Finds a contact by email or phone and updates it, or creates a new one.
 * Opt-ins are only ever switched on here - switching off happens via unsubscribe.
 */
export async function upsertContact({ name = "", email = null, phone = null, city = "", emailOptIn = false, whatsappOptIn = false, source = "" }) {
  email = email ? email.trim().toLowerCase() : null;
  phone = phone || null;
  if (!email && !phone) return null;

  const [found] = await query(
    `SELECT * FROM contacts
     WHERE ($1::text IS NOT NULL AND lower(email) = $1) OR ($2::text IS NOT NULL AND phone = $2)
     ORDER BY (lower(email) = $1) DESC NULLS LAST LIMIT 1`,
    [email, phone]
  );

  if (found) {
    const [row] = await query(
      `UPDATE contacts SET
         name = CASE WHEN $2 <> '' THEN $2 ELSE name END,
         email = COALESCE(email, $3),
         phone = COALESCE($4, phone),
         city = CASE WHEN $5 <> '' THEN $5 ELSE city END,
         email_opt_in = email_opt_in OR $6,
         whatsapp_opt_in = whatsapp_opt_in OR $7
       WHERE id = $1 RETURNING *`,
      [found.id, name, found.email ? null : email, phone, city, emailOptIn, whatsappOptIn]
    );
    return row;
  }

  const [row] = await query(
    `INSERT INTO contacts (name, email, phone, city, email_opt_in, whatsapp_opt_in, token, source)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [name, email, phone, city, emailOptIn, whatsappOptIn, crypto.randomBytes(16).toString("hex"), source]
  );
  return row;
}
