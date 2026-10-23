"use server";

import { revalidatePath } from "next/cache";
import { query } from "./db";
import { getSettings } from "./settings";
import { listProducts, listCategories, toCard } from "./catalog";
import { showcaseFor } from "./showcase";
import { rank, rankAny, correct, words } from "./search";
import { quoteCart, placeOrder, customerConfirm, customerCancel, customerChange } from "./orders";
import { upsertContact } from "./contacts";
import { notify, processQueue } from "./notify";
import { normalizePhone, isEmail } from "./format";
import { receiveMessage, readThread } from "./inbox";
import { limit, visitor, BUSY } from "./limits";
import { humanCheck } from "./turnstile";

/*
  Server actions the storefront calls. Everything here is public, so every input is validated, and anything a
  script could abuse (guessing codes or order numbers, fake orders, chat or sign-up floods) is rate-limited per
  visitor (lib/limits.js).
*/

/**
 * The search panel. Empty query: what is trending (featured first, then newest).
 * Otherwise: { items (best 12), total, collections that match, corrected } where `corrected` is set when
 * nothing matched as typed and a likely typo fix found results instead ("jaket" -> "jacket"), and `partial` when
 * no piece has every word and the closest pieces (most of the words) are shown instead.
 */
export async function searchAction(q) {
  const text = String(q || "").slice(0, 60).trim();
  const [all, categories] = await Promise.all([listProducts(), listCategories()]);
  if (!words(text).length) {
    const trending = [...all].sort((a, b) => Number(b.is_featured) - Number(a.is_featured) || Number(b.total_stock > 0) - Number(a.total_stock > 0));
    return { items: trending.slice(0, 8).map(toCard), total: all.length, collections: [], corrected: null };
  }
  let found = rank(all, text);
  let corrected = null;
  if (!found.length) {
    const fix = correct(all, text);
    if (fix) { found = rank(all, fix); if (found.length) corrected = fix; }
  }
  let partial = false;
  if (!found.length) { found = rankAny(all, corrected || text); partial = found.length > 0; }
  const look = words(corrected || text);
  const collections = categories
    .filter((c) => c.product_count > 0 && look.some((w) => words(c.name).some((x) => x.startsWith(w))))
    .map(({ name, slug, product_count }) => ({ name, slug, count: product_count }));
  return { items: found.slice(0, 12).map(toCard), total: found.length, collections, corrected, partial };
}

/** Live cards (current price and stock) for products the visitor looked at, in the order given. */
export async function cardsByIdAction(ids) {
  const want = (Array.isArray(ids) ? ids : []).map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 12);
  if (!want.length) return [];
  const list = await listProducts({ ids: want });
  return want.map((id) => list.find((p) => p.id === id)).filter(Boolean).map(toCard);
}

/**
 * "Complete the look" in the bag: up to 3 in-stock pieces that are not in the bag,
 * from the same collections as the bag first, then the newest of the rest.
 */
export async function bagPicksAction(productIds) {
  const inBag = new Set((Array.isArray(productIds) ? productIds : []).map(Number).filter(Number.isInteger).slice(0, 50));
  const all = (await listProducts()).filter((p) => !inBag.has(p.id) && p.total_stock > 0);
  const worlds = new Set((await listProducts({ ids: [...inBag] })).map((p) => p.category_id));
  const ranked = [...all.filter((p) => worlds.has(p.category_id)), ...all.filter((p) => !worlds.has(p.category_id))];
  return (await showcaseFor("bag", ranked, { exclude: [...inBag], limit: 3 })).map((p) => ({ ...toCard(p), lowAt: p.low_stock_threshold }));
}

export async function quoteAction(items, coupon, who = null) {
  const settings = await getSettings();
  const list = Array.isArray(items) ? items.slice(0, 50) : [];
  const code = String(coupon || "").trim();
  // trying codes is limited, so nobody can guess other customers' personal codes
  if (code && !(await limit("code", 20, 600))) {
    const quote = await quoteCart(list, "", { maxQty: Number(settings.orders.max_qty) || 0 });
    return { ...quote, lines: quote.lines.map(({ threshold, ...l }) => l), coupon: { code: code.toUpperCase(), error: BUSY } };
  }
  const person = who && (who.phone || who.email) ? { phone: String(who.phone || ""), email: String(who.email || "") } : null;
  const quote = await quoteCart(list, code, { who: person, maxQty: Number(settings.orders.max_qty) || 0 });
  return { ...quote, lines: quote.lines.map(({ threshold, ...l }) => l) };
}

export async function placeOrderAction(input) {
  // No spam trap here on purpose: browser autofill once filled it and silently blocked real customers.
  // Orders only go ahead after the customer confirms from their own WhatsApp / email link anyway; the limit
  // stops a script from reserving the stock with a flood of fake orders.
  if (!(await limit("order", 6, 3600))) return { error: BUSY };
  // the free "are you a person?" check (Cloudflare Turnstile), when it is set up
  if (!(await humanCheck(input?.human, await visitor()))) return { error: "Please tick the check that you are a person, then place your order again.", human: true };
  try {
    return await placeOrder({ ...input, items: Array.isArray(input?.items) ? input.items.slice(0, 50) : [] });
  } catch (err) {
    // the real reason goes to the server logs (Vercel -> Logs); the customer gets a message they can act on
    console.error("[checkout] placing the order failed:", err);
    return { error: "We could not place your order just now. Please try again in a moment, or message us on WhatsApp and we will take it for you." };
  }
}

export async function confirmOrderAction(token) {
  const res = await customerConfirm(String(token));
  revalidatePath(`/order/${token}`);
  return res;
}

/** The customer changes a confirmed order inside the change window (their order link is the proof it is theirs). */
export async function changeOrderAction(token, input) {
  if (!(await limit("change", 20, 600))) return { error: BUSY };
  const res = await customerChange(String(token || ""), input || {});
  revalidatePath(`/order/${token}`);
  return res;
}

export async function cancelOrderAction(token) {
  const res = await customerCancel(String(token));
  revalidatePath(`/order/${token}`);
  return res;
}

export async function trackOrderAction(_prev, formData) {
  // order number + phone is the key to an order: limited so it cannot be guessed
  if (!(await limit("track", 20, 600))) return { error: BUSY };
  const settings = await getSettings();
  const number = String(formData.get("number") || "").trim().toUpperCase().replace(/^#/, "");
  // our tracking number from the slip: shows the parcel's progress only, so no phone is needed
  if (/^[A-Z0-9]{2,6}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(number)) {
    const [byRef] = await query("SELECT ref, number FROM orders WHERE ref = $1", [number]);
    return byRef ? { ref: byRef.ref, number: byRef.number } : { error: "We could not find that tracking number. Please check it and try again." };
  }
  const phone = normalizePhone(formData.get("phone"), settings.store.country_code);
  const [order] = await query("SELECT token, number FROM orders WHERE number = $1 AND phone = $2", [number.startsWith("TBA-") ? number : `TBA-${number}`, phone]);
  if (!order) return { error: "We could not find an order with that number and phone. Please check both and try again." };
  // the form shows "found" for a moment, then opens the order itself
  return { token: order.token, number: order.number };
}

/**
 * Live status of the orders placed from this device (their links are kept in the browser, see Track.jsx).
 * The link token is the only key, exactly as on the order page itself.
 */
export async function recentOrdersAction(tokens) {
  const list = (Array.isArray(tokens) ? tokens : []).map(String).filter((t) => /^[\w-]{10,64}$/.test(t)).slice(0, 6);
  if (!list.length) return [];
  const rows = await query(
    `SELECT o.token, o.number, o.status, o.total, o.created_at,
       COALESCE((SELECT json_agg(i.image_url ORDER BY i.id) FROM order_items i WHERE i.order_id = o.id), '[]'::json) AS images,
       (SELECT COALESCE(sum(i.qty), 0)::int FROM order_items i WHERE i.order_id = o.id) AS pieces
     FROM orders o WHERE o.token = ANY($1::text[])`,
    [list]
  );
  return list.map((t) => rows.find((r) => r.token === t)).filter(Boolean)
    .map((r) => ({ ...r, images: r.images.filter(Boolean).slice(0, 3), created_at: new Date(r.created_at).toISOString() }));
}

/** Newsletter / WhatsApp updates sign-up. Accepts an email, a phone number, or both. */
export async function subscribeAction(_prev, formData) {
  if (formData.get("tba_trap")) return { ok: true }; // hidden field only bots fill in (named so browsers never autofill it)
  const settings = await getSettings();
  const raw = String(formData.get("contact") || "").trim();
  const email = isEmail(raw) ? raw : null;
  const phone = !email ? normalizePhone(raw, settings.store.country_code) : null;
  if (!email && (!phone || phone.length < 11 || phone.length > 15)) return { error: "Enter a valid email or WhatsApp number." };
  if (!(await limit("subscribe", 5, 3600))) return { error: BUSY };
  // an email address is only added to the list once its owner confirms from the message (nobody can sign up
  // someone else); a WhatsApp number joins straight away, rate-limited
  const contact = await upsertContact({ email, phone, emailOptIn: false, whatsappOptIn: Boolean(phone), source: "newsletter" });
  if (email && contact && !contact.email_opt_in) {
    const { siteUrl } = await import("./settings");
    await notify("subscribe_confirm", { email, contactId: contact.id, vars: { name: contact.name?.split(" ")[0] || "there", confirm_url: `${siteUrl()}/updates/${contact.token}?confirm=email` } });
    const { sendSoon } = await import("./notify");
    sendSoon(5);
    return { ok: true, confirm: true };
  }
  return { ok: true };
}

export async function stockAlertAction(variantId, contact) {
  if (!(await limit("alert", 12, 3600))) return { error: BUSY };
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
  if (formData.get("tba_trap")) return { ok: true }; // hidden field only bots fill in (named so browsers never autofill it)
  if (!(await limit("contact", 5, 3600))) return { error: BUSY };
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
  // a visitor cannot open chat after chat, or send endless messages (each could call in the team)
  if (!key && !(await limit("chat-new", 6, 3600))) return { error: BUSY };
  if (!(await limit("chat-msg", 40, 600))) return { error: "That is a lot of messages. Please wait a few minutes." };
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

/**
 * The subscriber's own choices, from the link in a message (the link token is the only key).
 * A channel can only be switched on if the contact has that address; switching WhatsApp off also drops
 * any pending "you left something in your bag" reminder for that number.
 */
export async function subscriptionAction(token, { email = false, whatsapp = false } = {}) {
  const t = String(token || "");
  if (!/^[\w-]{6,128}$/.test(t)) return { error: "This link is not valid." };
  const [c] = await query("SELECT id, email, phone FROM contacts WHERE token = $1", [t]);
  if (!c) return { error: "This link is no longer valid." };
  const e = Boolean(email) && Boolean(c.email);
  const w = Boolean(whatsapp) && Boolean(c.phone);
  await query("UPDATE contacts SET email_opt_in = $2, whatsapp_opt_in = $3 WHERE id = $1", [c.id, e, w]);
  if (!w && c.phone) await query("DELETE FROM checkouts WHERE phone = $1", [c.phone]);
  return { ok: true, email: e, whatsapp: w };
}

/* ---------------- returns and exchanges from the order page ---------------- */

/** A customer asks for a return, an exchange or reports a problem. Their order link is the proof it is theirs. */
export async function requestCaseAction(token, input) {
  const { getOrder } = await import("./orders");
  const { openCase } = await import("./cases");
  const order = await getOrder("token", String(token || ""));
  if (!order) return { error: "Order not found." };
  try {
    return await openCase(order, input);
  } catch (err) {
    console.error("[case]", err);
    return { error: "Your request could not be sent. Please try again or message us on WhatsApp." };
  }
}

/* ---------------- feedback after delivery ---------------- */

/**
 * The customer rates their order (1-5) from the link in the "How was your order?" message.
 * One rating per order. A low rating with a comment also opens a complaint, so a person follows it up.
 */
export async function feedbackAction(token, rating, comment) {
  const { getOrder } = await import("./orders");
  const order = await getOrder("token", String(token || ""));
  if (!order || !["shipped", "delivered", "returned"].includes(order.status)) return { error: "This order cannot be rated yet." };
  const stars = Math.round(Number(rating));
  if (!(stars >= 1 && stars <= 5)) return { error: "Choose from one to five stars." };
  const text = String(comment || "").trim().slice(0, 1500);
  const [row] = await query(
    "INSERT INTO feedback (order_id, contact_id, rating, comment) VALUES ($1,$2,$3,$4) ON CONFLICT (order_id) DO NOTHING RETURNING id",
    [order.id, order.contact_id, stars, text]
  );
  if (!row) return { error: "Thank you, this order has already been rated." };
  if (stars <= 2 && text) {
    const { openCase } = await import("./cases");
    await openCase(order, { type: "complaint", reason: "other", details: `Feedback: ${stars} of 5. ${text}`, items: [] }, { source: "feedback" }).catch((e) => console.error("[feedback case]", e));
  }
  return { ok: true, followUp: stars <= 2 && Boolean(text) };
}
