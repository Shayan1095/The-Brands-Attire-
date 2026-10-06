"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { query } from "./db";
import { getSettings } from "./settings";
import { listProducts, toCard } from "./catalog";
import { quoteCart, placeOrder, customerConfirm, customerCancel } from "./orders";
import { upsertContact } from "./contacts";
import { notify, processQueue } from "./notify";
import { normalizePhone, isEmail } from "./format";
import { receiveMessage, readThread } from "./inbox";

/* Server actions the storefront calls. Everything here is public, so every input is validated. */

export async function searchAction(q) {
  const list = await listProducts({ q: String(q || "").slice(0, 60), limit: 8 });
  return list.map(toCard);
}

export async function quoteAction(items, coupon) {
  const quote = await quoteCart(Array.isArray(items) ? items.slice(0, 50) : [], coupon);
  return { ...quote, lines: quote.lines.map(({ threshold, ...l }) => l) };
}

export async function placeOrderAction(input) {
  if (input?.website) return { error: "Something went wrong. Please try again." }; // honeypot
  return placeOrder({ ...input, items: Array.isArray(input?.items) ? input.items.slice(0, 50) : [] });
}

export async function confirmOrderAction(token) {
  const res = await customerConfirm(String(token));
  revalidatePath(`/order/${token}`);
  return res;
}

export async function cancelOrderAction(token) {
  const res = await customerCancel(String(token));
  revalidatePath(`/order/${token}`);
  return res;
}

export async function trackOrderAction(_prev, formData) {
  const settings = await getSettings();
  const number = String(formData.get("number") || "").trim().toUpperCase().replace(/^#/, "");
  const phone = normalizePhone(formData.get("phone"), settings.store.country_code);
  const [order] = await query("SELECT token FROM orders WHERE number = $1 AND phone = $2", [number.startsWith("TBA-") ? number : `TBA-${number}`, phone]);
  if (!order) return { error: "We could not find an order with that number and phone. Please check both and try again." };
  redirect(`/order/${order.token}`);
}

/** Newsletter / WhatsApp updates sign-up. Accepts an email, a phone number, or both. */
export async function subscribeAction(_prev, formData) {
  if (formData.get("website")) return { ok: true };
  const settings = await getSettings();
  const raw = String(formData.get("contact") || "").trim();
  const email = isEmail(raw) ? raw : null;
  const phone = !email ? normalizePhone(raw, settings.store.country_code) : null;
  if (!email && (!phone || phone.length < 11 || phone.length > 15)) return { error: "Enter a valid email or WhatsApp number." };
  await upsertContact({ email, phone, emailOptIn: Boolean(email), whatsappOptIn: Boolean(phone), source: "newsletter" });
  return { ok: true };
}

export async function stockAlertAction(variantId, contact) {
  const settings = await getSettings();
  const raw = String(contact || "").trim();
  const email = isEmail(raw) ? raw.toLowerCase() : null;
  const phone = !email ? normalizePhone(raw, settings.store.country_code) : null;
  if (!email && (!phone || phone.length < 11 || phone.length > 15)) return { error: "Enter a valid email or WhatsApp number." };
  const [variant] = await query("SELECT id FROM variants WHERE id = $1", [Number(variantId) || 0]);
  if (!variant) return { error: "That size no longer exists." };
  await query(
    `INSERT INTO stock_alerts (variant_id, email, phone)
     SELECT $1, $2, $3 WHERE NOT EXISTS (
       SELECT 1 FROM stock_alerts WHERE variant_id = $1 AND notified_at IS NULL AND (email = $2 OR phone = $3))`,
    [variant.id, email, phone]
  );
  return { ok: true };
}

export async function contactAction(_prev, formData) {
  if (formData.get("website")) return { ok: true };
  const name = String(formData.get("name") || "").trim().slice(0, 120);
  const email = String(formData.get("email") || "").trim().slice(0, 200);
  const phone = String(formData.get("phone") || "").trim().slice(0, 30);
  const topic = String(formData.get("topic") || "").slice(0, 60);
  const order = String(formData.get("order") || "").trim().slice(0, 30);
  const message = `${order ? `Order: ${order}\n\n` : ""}${String(formData.get("message") || "").trim()}`.slice(0, 4000);
  if (name.length < 2 || message.length < 5) return { error: "Please add your name and a message." };
  if (!isEmail(email) && phone.replace(/\D/g, "").length < 10) return { error: "Please add an email or phone number so we can reply." };
  await query("INSERT INTO contact_messages (name, email, phone, topic, message) VALUES ($1,$2,$3,$4,$5)", [name, email, phone, topic, message]);
  return { ok: true };
}

/* ---------------- website chat ---------------- */

/** A visitor's chat message. Returns the new messages (theirs and the reply) and the thread's key. */
export async function chatSendAction({ token, text, page } = {}) {
  const body = String(text || "").trim().slice(0, 600);
  if (!body) return { error: "Type a message first." };
  const key = /^[a-f0-9]{32}$/.test(String(token || "")) ? token : null;
  if (key) {
    // one visitor cannot flood the inbox or the assistant
    const [{ n }] = await query(
      `SELECT count(*)::int AS n FROM chat_messages m JOIN conversations c ON c.id = m.conversation_id
       WHERE c.token = $1 AND m.sender = 'customer' AND m.created_at > now() - interval '10 minutes'`,
      [key]
    );
    if (n >= 25) return { error: "That is a lot of messages. Please wait a few minutes." };
  }
  return receiveMessage({ channel: "web", token: key, text: body, page: String(page || "").slice(0, 200) });
}

export async function chatReadAction(token, afterId) {
  if (!/^[a-f0-9]{32}$/.test(String(token || ""))) return { status: "bot", messages: [], gone: true };
  return readThread(token, afterId);
}

/* ---------------- unfinished checkouts ---------------- */

/**
 * Remembers a checkout the moment the customer has typed a phone number, but only when they
 * ticked the box agreeing to be contacted. Unticking removes it again.
 */
export async function saveCheckoutAction({ name, phone, email, items, consent } = {}) {
  const settings = await getSettings();
  const number = normalizePhone(phone, settings.store.country_code);
  if (number.length < 11 || number.length > 15) return { ok: false };
  if (!consent) {
    await query("DELETE FROM checkouts WHERE phone = $1", [number]);
    return { ok: true };
  }
  const quote = await quoteCart(Array.isArray(items) ? items.slice(0, 50) : []);
  if (!quote.lines.length) return { ok: false };
  const lines = quote.lines.map((l) => ({ variantId: l.variantId, name: l.name, size: l.size, qty: l.qty }));
  await query(
    `INSERT INTO checkouts (phone, name, email, items, total) VALUES ($1,$2,$3,$4::jsonb,$5)
     ON CONFLICT (phone) DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email, items = EXCLUDED.items, total = EXCLUDED.total, updated_at = now()`,
    [number, String(name || "").trim().slice(0, 120), isEmail(email) ? String(email).trim().toLowerCase() : null, JSON.stringify(lines), quote.total]
  );
  return { ok: true };
}

export async function unsubscribeAction(token) {
  await query("UPDATE contacts SET email_opt_in = false, whatsapp_opt_in = false WHERE token = $1", [String(token)]);
  return { ok: true };
}
