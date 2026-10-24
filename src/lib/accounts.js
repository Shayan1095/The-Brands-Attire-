import "server-only";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { cache } from "react";
import { query } from "./db";
import { getSettings, siteUrl } from "./settings";
import { normalizePhone, isEmail } from "./format";
import { hashPasswordAsync as hashPassword, verifyPasswordAsync as verifyPassword } from "@db/password.mjs";

/*
  Customer accounts: optional, with a password. Guests can still buy without one.

    - An account is a contact (lib/contacts.js) with a password, signed in with its phone or its email.
    - Signing up gives a one-time code for the first order (Settings -> Loyalty: signup_percent, 0 = off).
    - Placing an order while signed in adds it to the account. A guest can turn their order into an account from
      the order page ("set a password"): holding the private order link proves the phone is theirs.
    - Safety: anyone could type someone else's phone number when signing up. So an account opened on a phone or
      email that already has orders starts "unverified": those earlier orders, codes and points stay hidden until
      the customer opens one of their order links and adds it to the account.
    - The bag of a signed-in customer is kept on the account (any device), so a reminder can be sent if they agreed.
*/

const COOKIE = "tba_customer";
const MAX_AGE = 60 * 60 * 24 * 60; // 60 days

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set");
  return s;
}
// a different key from the admin cookie, so one can never be used as the other
const mac = (data) => crypto.createHmac("sha256", `customer:${secret()}`).update(data).digest("base64url");

export async function startSession(contactId) {
  const payload = Buffer.from(JSON.stringify({ id: contactId, exp: Date.now() + MAX_AGE * 1000 })).toString("base64url");
  (await cookies()).set(COOKIE, `${payload}.${mac(payload)}`, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: MAX_AGE, path: "/",
  });
}

export async function endSession() {
  (await cookies()).delete(COOKIE);
}

/** The signed-in customer (contact row with an account), or null. */
export const getCustomer = cache(async () => {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  const [payload, sig] = raw.split(".");
  if (!payload || !sig) return null;
  const expected = mac(payload);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (data.exp <= Date.now()) return null;
    const [row] = await query("SELECT * FROM contacts WHERE id = $1 AND password_hash IS NOT NULL", [data.id]);
    return row || null;
  } catch {
    return null;
  }
});

/** What the shop's pages may know about the signed-in customer (never the password or tokens). */
export const publicCustomer = (c) => c && ({
  id: c.id, name: c.name, first: (c.name || "").split(" ")[0] || "there", email: c.email || "", phone: c.phone || "",
  address: c.address || "", city: c.city || "", cart: Array.isArray(c.cart) ? c.cart : [],
});

const findByLogin = async (login, cc) => {
  const raw = String(login || "").trim();
  if (isEmail(raw)) return (await query("SELECT * FROM contacts WHERE lower(email) = $1 AND password_hash IS NOT NULL", [raw.toLowerCase()]))[0];
  const phone = normalizePhone(raw, cc);
  if (phone.length < 11) return null;
  return (await query("SELECT * FROM contacts WHERE phone = $1 AND password_hash IS NOT NULL ORDER BY id LIMIT 1", [phone]))[0];
};

/** Gives the sign-up code once, only to someone who has never ordered. Returns the code or null. */
async function welcomeCode(contact, settings) {
  const pct = Number(settings.crm.signup_percent) || 0;
  if (pct <= 0) return null;
  const [{ n }] = await query(
    `SELECT (SELECT count(*) FROM orders WHERE (contact_id = $1 OR phone = $2) AND status <> 'cancelled')
          + (SELECT count(*) FROM coupons WHERE contact_id = $1 AND note = 'Sign-up offer') AS n`,
    [contact.id, contact.phone || ""]);
  if (Number(n) > 0) return null;
  const { personalCode } = await import("./crm");
  return personalCode(contact.id, { prefix: "WELCOME", value: Math.min(50, pct), days: Number(settings.crm.signup_days) || 30, note: "Sign-up offer", type: "percent" });
}

/**
 * New account. input = { name, phone, email, password, offers }. Returns { ok, code } or { error }.
 * The phone is required (it is how orders are matched); the email is optional but needed to reset a password.
 */
export async function signUp(input) {
  const settings = await getSettings();
  const cc = settings.store.country_code;
  const name = String(input?.name || "").trim().slice(0, 80);
  const phone = normalizePhone(input?.phone, cc);
  const email = String(input?.email || "").trim().toLowerCase().slice(0, 160);
  const password = String(input?.password || "");
  const offers = Boolean(input?.offers);
  if (name.length < 2) return { error: "Please enter your name." };
  if (phone.length < 11 || phone.length > 15) return { error: "Please enter a valid mobile number, like 0300 1234567." };
  if (email && !isEmail(email)) return { error: "That email does not look right." };
  if (password.length < 8) return { error: "Choose a password of at least 8 characters." };

  const [taken] = await query(
    "SELECT id FROM contacts WHERE password_hash IS NOT NULL AND (phone = $1 OR ($2 <> '' AND lower(email) = $2)) LIMIT 1", [phone, email]);
  if (taken) return { error: "There is already an account with this phone or email. Sign in instead (or reset your password)." };

  // an existing customer record (from an order or a sign-up) becomes the account; a new person gets a new one
  const [existing] = await query(
    `SELECT * FROM contacts WHERE phone = $1 OR ($2 <> '' AND lower(email) = $2) ORDER BY (phone = $1) DESC, id LIMIT 1`, [phone, email]);
  let contact;
  if (existing) {
    const [{ history }] = await query(
      "SELECT ((SELECT count(*) FROM orders WHERE contact_id = $1) + (SELECT count(*) FROM coupons WHERE contact_id = $1))::int AS history", [existing.id]);
    [contact] = await query(
      `UPDATE contacts SET name = $2, email = COALESCE(email, NULLIF($3, '')), password_hash = $4, account_at = now(),
         account_verified = $5, email_opt_in = email_opt_in OR ($6 AND $3 <> ''), whatsapp_opt_in = whatsapp_opt_in OR $6,
         remind_ok = remind_ok OR $6
       WHERE id = $1 RETURNING *`,
      [existing.id, name, email, await hashPassword(password), history === 0, offers]);
  } else {
    [contact] = await query(
      `INSERT INTO contacts (name, email, phone, email_opt_in, whatsapp_opt_in, remind_ok, token, source, password_hash, account_at, account_verified)
       VALUES ($1, NULLIF($2, ''), $3, $4, $5, $5, $6, 'account', $7, now(), true) RETURNING *`,
      [name, email, phone, offers && Boolean(email), offers, crypto.randomBytes(16).toString("hex"), await hashPassword(password)]);
  }
  const code = await welcomeCode(contact, settings);
  await startSession(contact.id);
  if (code) {
    const { notify, sendSoon } = await import("./notify");
    await notify("account_welcome", {
      email: contact.email, phone: contact.phone, contactId: contact.id,
      vars: { name: name.split(" ")[0], code, percent: `${Math.min(50, Number(settings.crm.signup_percent))}%`, days: String(Number(settings.crm.signup_days) || 30), url: `${siteUrl()}/products` },
    }).catch((e) => console.error("[account] welcome message", e?.message));
    sendSoon(5);
  }
  return { ok: true, code, verified: contact.account_verified };
}

/** Sign in with phone or email and the password. */
export async function signIn(login, password) {
  const settings = await getSettings();
  const c = await findByLogin(login, settings.store.country_code);
  if (!c || !await verifyPassword(String(password || ""), c.password_hash)) return { error: "Wrong phone / email or password." };
  await startSession(c.id);
  return { ok: true };
}

/**
 * Proves the customer owns this order (they hold its private link) and adds it, and every other order placed with
 * the same phone, to their account. Signed out: sets a password and opens the account from the order.
 */
export async function claimOrder(token, password = null) {
  const [o] = await query("SELECT id, contact_id, phone, customer_name, email, city, address FROM orders WHERE token = $1", [String(token || "")]);
  if (!o || !o.contact_id || o.phone === "0") return { error: "Order not found." };
  const me = await getCustomer();
  let account = me;
  if (!me) {
    if (String(password || "").length < 8) return { error: "Choose a password of at least 8 characters." };
    const [c] = await query("SELECT * FROM contacts WHERE id = $1", [o.contact_id]);
    if (c.password_hash) return { error: "This order already belongs to an account. Sign in to see it." };
    [account] = await query(
      `UPDATE contacts SET password_hash = $2, account_at = now(), account_verified = true,
         name = CASE WHEN name = '' THEN $3 ELSE name END, address = CASE WHEN address = '' THEN $4 ELSE address END,
         city = CASE WHEN city = '' THEN $5 ELSE city END WHERE id = $1 RETURNING *`,
      [o.contact_id, await hashPassword(String(password)), o.customer_name, o.address, o.city]);
    await startSession(account.id);
  } else if (me.phone !== o.phone && me.id !== o.contact_id) {
    return { error: "This order was placed with another phone number, so it cannot be added to this account." };
  }
  await query("UPDATE orders SET account_id = $1 WHERE phone = $2 AND (account_id IS NULL OR account_id = $1)", [account.id, o.phone]);
  await query("UPDATE contacts SET account_verified = true WHERE id = $1", [account.id]);
  return { ok: true };
}

/** The account page: their orders, codes and points (earlier history only once verified). */
export async function accountView(c) {
  const settings = await getSettings();
  const [orders, codes] = await Promise.all([
    query(
      `SELECT o.number, o.token, o.status, o.total, o.created_at,
              (SELECT count(*)::int FROM order_items i WHERE i.order_id = o.id) AS pieces,
              (SELECT i.image_url FROM order_items i WHERE i.order_id = o.id ORDER BY i.id LIMIT 1) AS image
       FROM orders o WHERE o.account_id = $1 OR ($2 AND o.contact_id = $1) ORDER BY o.id DESC LIMIT 30`,
      [c.id, c.account_verified]),
    query(
      `SELECT code, type, value, ends_at, note FROM coupons
       WHERE contact_id = $1 AND is_active AND used_count < COALESCE(max_uses, 1) AND (ends_at IS NULL OR ends_at > now())
         AND ($2 OR created_at >= $3) ORDER BY id DESC LIMIT 5`,
      [c.id, c.account_verified, c.account_at]),
  ]);
  return { orders, codes, points: c.account_verified && settings.crm.points_per_100 > 0 ? c.points : null, verified: c.account_verified };
}

export async function saveProfile(c, input) {
  const settings = await getSettings();
  const name = String(input?.name || "").trim().slice(0, 80);
  const email = String(input?.email || "").trim().toLowerCase().slice(0, 160);
  const address = String(input?.address || "").trim().slice(0, 300);
  const city = String(input?.city || "").trim().slice(0, 80);
  if (name.length < 2) return { error: "Please enter your name." };
  if (email && !isEmail(email)) return { error: "That email does not look right." };
  if (email && email !== (c.email || "").toLowerCase()) {
    const [clash] = await query("SELECT id FROM contacts WHERE lower(email) = $1 AND id <> $2 AND password_hash IS NOT NULL", [email, c.id]);
    if (clash) return { error: "Another account already uses that email." };
  }
  await query(
    `UPDATE contacts SET name = $2, email = NULLIF($3, ''), address = $4, city = $5,
       email_opt_in = $6 AND $3 <> '', whatsapp_opt_in = $7, remind_ok = $6 OR $7 WHERE id = $1`,
    [c.id, name, email, address, city, Boolean(input?.emailOffers), Boolean(input?.whatsappOffers)]);
  void settings;
  return { ok: true };
}

export async function changePassword(c, current, next) {
  if (!await verifyPassword(String(current || ""), c.password_hash)) return { error: "Your current password is not right." };
  if (String(next || "").length < 8) return { error: "The new password needs at least 8 characters." };
  await query("UPDATE contacts SET password_hash = $2, reset_token = NULL WHERE id = $1", [c.id, await hashPassword(String(next))]);
  return { ok: true };
}

/** Forgotten password: a link by email, valid for an hour. Always answers the same, so it never reveals accounts. */
export async function sendReset(login) {
  const settings = await getSettings();
  const c = await findByLogin(login, settings.store.country_code);
  if (c?.email) {
    const token = crypto.randomBytes(24).toString("base64url");
    await query("UPDATE contacts SET reset_token = $2, reset_expires = now() + interval '1 hour' WHERE id = $1", [c.id, token]);
    const { notify, sendSoon } = await import("./notify");
    await notify("account_reset", { email: c.email, contactId: c.id, vars: { name: (c.name || "").split(" ")[0] || "there", url: `${siteUrl()}/account/reset/${token}` } });
    sendSoon(3);
  }
  return { ok: true, hasEmail: Boolean(c?.email), found: Boolean(c) };
}

export async function resetPassword(token, password) {
  if (String(password || "").length < 8) return { error: "Choose a password of at least 8 characters." };
  const [c] = await query("SELECT id FROM contacts WHERE reset_token = $1 AND reset_expires > now()", [String(token || "")]);
  if (!c) return { error: "This link has expired. Ask for a new one." };
  await query("UPDATE contacts SET password_hash = $2, reset_token = NULL, reset_expires = NULL WHERE id = $1", [c.id, await hashPassword(String(password))]);
  await startSession(c.id);
  return { ok: true };
}

/** Keeps the signed-in customer's bag on the account (merged with what the device had when they signed in). */
export async function saveCart(c, items) {
  const clean = (Array.isArray(items) ? items : []).slice(0, 40).map((i) => ({ variantId: Number(i?.variantId) || 0, qty: Math.min(20, Math.max(1, Number(i?.qty) || 1)) })).filter((i) => i.variantId);
  const same = JSON.stringify(clean) === JSON.stringify(c.cart || []);
  if (same) return { ok: true };
  await query("UPDATE contacts SET cart = $2::jsonb, cart_at = CASE WHEN $3 THEN NULL ELSE now() END WHERE id = $1", [c.id, JSON.stringify(clean), clean.length === 0]);
  return { ok: true };
}
