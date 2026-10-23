import "server-only";
import crypto from "node:crypto";
import QRCode from "qrcode";
import { query } from "./db";
import { getSettings, siteUrl } from "./settings";
import { profile } from "./crm";
import { money } from "./format";

/*
  What goes in the parcel: the courier slip and the thank-you card (Admin -> Orders -> Print).

    ref       our own tracking number (TBA-7K3Q-M9X2), made once per order. It works on /track and
              /track/<ref>, so the customer can follow the parcel before the courier's number exists.
    slip      everything the courier needs: who, where, phone, the amount to collect, pieces, a caution
              line and the return address, with the ref as a barcode and a QR.
    card      a thank-you note written from the customer's history (first order, returning, VIP, exchange),
              with their points, a care tip for the piece, a QR to get updates, a QR to rate the order
              and, if switched on, a one-time code for their next order.

  Nothing here needs a paid service: the barcode and QR codes are drawn as SVG on our own server.
*/

/* ---------------- our tracking number ---------------- */

// no 0/O, 1/I/L, U: easy to read out over the phone
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";
const randomPart = (n) => Array.from(crypto.randomBytes(n), (b) => ALPHABET[b % ALPHABET.length]).join("");

export const isRef = (s) => /^[A-Z0-9]{2,6}-[2-9A-HJKMNP-TV-Z]{4}-[2-9A-HJKMNP-TV-Z]{4}$/.test(String(s || ""));

/** Gives every order in `ids` a tracking number if it has none yet. Returns { [id]: ref }. */
export async function ensureRefs(ids) {
  const list = [...new Set((ids || []).map(Number).filter(Boolean))];
  if (!list.length) return {};
  const rows = await query("SELECT id, number, ref FROM orders WHERE id = ANY($1::int[])", [list]);
  const out = {};
  for (const r of rows) {
    if (r.ref) { out[r.id] = r.ref; continue; }
    // the order number's prefix (TBA-1166 -> TBA), so every brand's numbers look like its own
    const prefix = (String(r.number || "").split("-")[0] || "ORD").replace(/[^A-Z0-9]/gi, "").toUpperCase().slice(0, 6) || "ORD";
    for (let tries = 0; tries < 5 && !out[r.id]; tries++) {
      const ref = `${prefix}-${randomPart(4)}-${randomPart(4)}`;
      const [done] = await query("UPDATE orders SET ref = $2 WHERE id = $1 AND ref IS NULL AND NOT EXISTS (SELECT 1 FROM orders WHERE ref = $2) RETURNING ref", [r.id, ref]);
      if (done) out[r.id] = done.ref;
      else { const [again] = await query("SELECT ref FROM orders WHERE id = $1", [r.id]); if (again?.ref) out[r.id] = again.ref; }
    }
  }
  return out;
}

/** The public tracking page for a ref. */
export const trackUrl = (ref) => `${siteUrl()}/track/${ref}`;

/* ---------------- barcode (Code 128, set B) and QR, as SVG ---------------- */

// bar and space widths of each Code 128 symbol (0-102 data, 103-105 start A/B/C, 106 stop)
const C128 = "212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 112232 122132 122231 113222 123122 123221 223211 221132 221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 212123 212321 232121 111323 131123 131321 112313 132113 132311 211313 231113 231311 112133 112331 132131 113123 113321 133121 313121 211331 231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 314111 221411 431111 111224 111422 121124 121421 141122 141221 112214 112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 111242 121142 121241 114212 124112 124211 411212 421112 421211 212141 214121 412121 111143 111341 131141 114113 114311 411113 411311 113141 114131 311141 411131 211412 211214 211232 2331112".split(" ");

/** The module widths (bar, space, bar...) of a Code 128 B barcode for printable ASCII text. */
export function code128(text) {
  const codes = [104, ...[...String(text)].map((ch) => ch.charCodeAt(0) - 32).filter((v) => v >= 0 && v < 95)];
  const check = codes.reduce((sum, v, i) => sum + v * (i || 1), 0) % 103;
  return [...codes, check, 106].flatMap((v) => [...C128[v]].map(Number));
}

/** A barcode as an SVG string, `height` in modules; it stretches to the width it is given. */
export function barcodeSvg(text, height = 40) {
  const widths = code128(text);
  const quiet = 10;
  let x = quiet;
  const bars = [];
  widths.forEach((w, i) => { if (i % 2 === 0) bars.push(`M${x} 0h${w}v${height}h-${w}z`); x += w; });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${x + quiet} ${height}" preserveAspectRatio="none" role="img" aria-label="Barcode ${text}"><path d="${bars.join("")}" fill="#000"/></svg>`;
}

/** A QR code as an SVG string (crisp at any print size). */
export async function qrSvg(text) {
  return QRCode.toString(String(text), { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#000000", light: "#0000" } });
}

/* ---------------- the thank-you card ---------------- */

// a care line for the piece, from words in its name, category or type (first match wins)
const CARE = [
  [/cashmere|merino|wool|knit|sweater|cardigan|jumper/i, "Hand wash cold and dry it flat, never hanging, so it keeps its shape."],
  [/silk|satin/i, "Hand wash cold or dry clean, and iron on the reverse at low heat."],
  [/denim|jean/i, "Wash inside out in cold water and skip the dryer: the colour stays deep for longer."],
  [/linen/i, "Wash cool and let it dry in the shade. The soft creases are part of its charm."],
  [/leather|suede/i, "Keep it away from rain and direct heat, and store it on a wide hanger."],
  [/coat|jacket|blazer|overcoat/i, "Hang it on a wide hanger and brush it after wearing; dry clean only when needed."],
  [/shoe|sneaker|trainer|boot/i, "Wipe clean with a damp cloth and let them air dry, away from direct heat."],
  [/watch|earbud|headphone|charger|phone|tech|speaker|gadget/i, "Keep the box and this card: they make any warranty claim quick and easy."],
  [/shirt|tee|t-shirt|polo|top|dress|kurta/i, "Wash cold, inside out, and dry in the shade to keep the colour bright."],
];
const DEFAULT_CARE = "Wash cold, inside out, and skip the dryer: your piece will look new for longer.";

/** 1 -> "1st", 2 -> "2nd", 11 -> "11th", 23 -> "23rd" */
const ordinal = (n) => {
  const teen = n % 100 >= 11 && n % 100 <= 13;
  return `${n}${teen ? "th" : ({ 1: "st", 2: "nd", 3: "rd" }[n % 10] || "th")}`;
};

/**
 * Everything printed for these orders: the order, its items, our ref and, for the card, the wording,
 * points, care tip, codes and QR targets. Makes refs (and next-order codes) the first time.
 */
export async function printData(ids, { cards = true } = {}) {
  const settings = await getSettings();
  const { labels, crm, store } = settings;
  const list = [...new Set((ids || []).map(Number).filter(Boolean))].slice(0, 200);
  if (!list.length) return { settings, orders: [] };
  await ensureRefs(list);

  const [orders, items, people, swaps] = await Promise.all([
    query(
      `SELECT o.*, c.token AS contact_token, c.email_opt_in, c.whatsapp_opt_in, c.points AS balance, x.number AS exchange_for
       FROM orders o LEFT JOIN contacts c ON c.id = o.contact_id LEFT JOIN orders x ON x.id = o.exchange_of
       WHERE o.id = ANY($1::int[])`, [list]),
    query(
      `SELECT i.*, p.product_type, p.fit_note, cat.name AS category
       FROM order_items i LEFT JOIN products p ON p.id = i.product_id LEFT JOIN categories cat ON cat.id = p.category_id
       WHERE i.order_id = ANY($1::int[]) ORDER BY i.id`, [list]),
    query(
      `SELECT o.id AS order_id, s.good, s.spent, s.first_at, s.last_at,
              (SELECT count(*)::int FROM orders p WHERE p.contact_id = o.contact_id AND p.id <= o.id AND p.status NOT IN ('cancelled')) AS nth
       FROM orders o LEFT JOIN LATERAL (
         SELECT count(*) FILTER (WHERE status NOT IN ('cancelled', 'returned'))::int AS good,
                COALESCE(sum(total) FILTER (WHERE status NOT IN ('cancelled', 'returned')), 0)::int AS spent,
                min(created_at) AS first_at, max(created_at) AS last_at
         FROM orders WHERE contact_id = o.contact_id) s ON true
       WHERE o.id = ANY($1::int[])`, [list]),
    // a swap at the door: the rider also brings the old piece back (see lib/cases.js)
    query(
      `SELECT c.exchange_order_id AS order_id, c.number, string_agg(ci.name || ' (' || ci.size || ') x' || ci.qty, ', ' ORDER BY ci.id) AS pieces
       FROM cases c JOIN case_items ci ON ci.case_id = c.id
       WHERE c.exchange_order_id = ANY($1::int[]) AND c.pickup_method = 'swap' GROUP BY c.id`, [list]),
  ]);

  const out = [];
  for (const id of list) {
    const o = orders.find((r) => r.id === id);
    if (!o) continue;
    const lines = items.filter((i) => i.order_id === id);
    const h = people.find((p) => p.order_id === id) || {};
    const swap = swaps.find((x) => x.order_id === id) || null;
    out.push({ ...o, items: lines, swap, pieces: lines.reduce((s, i) => s + i.qty, 0), card: labels.card && cards ? await card(o, lines, h, settings) : null });
  }
  return { settings, orders: out };
}

async function card(o, lines, h, settings) {
  const { labels, crm, store } = settings;
  const first = o.customer_name.trim().split(/\s+/)[0] || "there";
  const walkIn = o.phone === "0";
  const nth = Math.max(1, h.nth || 1);
  const vip = o.contact_id && profile({ good: h.good || 0, spent: h.spent || 0, first_at: h.first_at, last_at: h.last_at }, crm).isVip;
  const main = [...lines].sort((a, b) => b.unit_price * b.qty - a.unit_price * a.qty)[0];
  const piece = main ? main.name : "your order";

  // the greeting, from who they are to the shop
  let kind, title, body;
  if (o.exchange_of) {
    kind = "exchange"; title = `Here is your new size, ${first}.`;
    body = `Thank you for your patience while we sorted the exchange. We hope ${piece} fits just right this time.`;
  } else if (vip && nth > 1) {
    kind = "vip"; title = `${first}, you make ${store.name} what it is.`;
    body = `This is your ${ordinal(nth)} order with us. Customers like you are the reason we keep going; thank you for choosing ${piece}.`;
  } else if (nth > 1) {
    kind = "repeat"; title = `Welcome back, ${first}.`;
    body = `Your ${ordinal(nth)} order with us, and it means a lot every time. We hope ${piece} becomes a favourite.`;
  } else {
    kind = "first"; title = `Welcome to ${store.name}, ${first}.`;
    body = `Thank you for trusting us with your first order. We packed ${piece} with care, and we hope it is the start of something good.`;
  }

  // points this order earns once delivered, and how far that takes them
  let points = null;
  if (o.contact_id && crm.points_per_100 > 0 && o.total >= 100 && !o.exchange_of) {
    const earn = Math.floor((o.total / 100) * crm.points_per_100);
    // the balance once this order is delivered (already counted if it was delivered before printing)
    const after = (o.balance || 0) + (o.points_awarded ? 0 : earn);
    const goal = crm.reward_points > 0 && crm.reward_value > 0 ? crm.reward_points : 0;
    points = { earn, after, goal, left: goal ? Math.max(0, goal - after) : 0, reward: goal ? money(crm.reward_value, store.currency) : "" };
  }

  // a care line for the piece that matters most in the parcel
  const words = main ? `${main.name} ${main.category || ""} ${main.product_type || ""}` : "";
  const care = labels.care ? (CARE.find(([re]) => re.test(words))?.[1] || DEFAULT_CARE) : "";

  // the one-time code for their next order, made once per order
  let code = null;
  if (labels.next_code_value > 0 && o.contact_id && !walkIn) {
    if (!o.card_code) {
      const made = `${labels.next_code_prefix || "NEXT"}-${randomPart(5)}`;
      const percent = labels.next_code_type !== "fixed";
      await query(
        `INSERT INTO coupons (code, type, value, max_uses, ends_at, contact_id, note)
         VALUES ($1, $2, $3, 1, CASE WHEN $4::int > 0 THEN now() + make_interval(days => $4::int) END, $5, $6)`,
        [made, percent ? "percent" : "fixed", labels.next_code_value, labels.next_code_days || 0, o.contact_id, `Thank-you card in ${o.number}`]);
      const [saved] = await query("UPDATE orders SET card_code = COALESCE(card_code, $2) WHERE id = $1 RETURNING card_code", [o.id, made]);
      o.card_code = saved.card_code;
    }
    const percent = labels.next_code_type !== "fixed";
    code = {
      code: o.card_code,
      value: percent ? `${labels.next_code_value}% off` : `${money(labels.next_code_value, store.currency)} off`,
      days: labels.next_code_days || 0,
    };
  }

  // QR codes: updates (their own subscribe link) and rating this order
  const subscribed = o.email_opt_in || o.whatsapp_opt_in;
  const updatesUrl = o.contact_token ? `${siteUrl()}/updates/${o.contact_token}` : `${siteUrl()}/products`;
  const qrs = [];
  if (labels.qr_updates) qrs.push({ key: "updates", label: subscribed ? "New drops & sales" : "Get first dibs", sub: subscribed ? "You are on the list. Scan to see what is new." : "New arrivals and sales, before anyone else.", svg: await qrSvg(updatesUrl), url: updatesUrl });
  if (labels.qr_feedback && !walkIn) {
    const url = `${siteUrl()}/feedback/${o.token}`;
    qrs.push({ key: "feedback", label: "Rate your order", sub: "Takes ten seconds. Tell us how we did.", svg: await qrSvg(url), url });
  }

  return { kind, title, body, note: labels.card_message || "", sign: labels.card_sign || `With love, ${/^the\s/i.test(store.name) ? "" : "the "}${store.name} team`, points, care, code, qrs, fit: main?.fit_note || "" };
}

/* ---------------- the courier's bulk-booking file ---------------- */

// quote every cell; prefix formula-looking text so spreadsheets never run it (numbers stay numbers)
const csvCell = (v) => {
  if (typeof v === "number") return String(v);
  let s = String(v ?? "");
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
};

/** 923001234567 -> 03001234567, the way couriers' forms expect it. */
export const localPhone = (phone, cc) => {
  const p = String(phone || "");
  if (!p || p === "0") return "";
  return cc && p.startsWith(cc) ? `0${p.slice(cc.length)}` : `+${p}`;
};

/** One row per parcel, in the columns courier portals ask for when you upload a booking sheet. */
export async function courierCsv(ids) {
  const { settings, orders } = await printData(ids, { cards: false });
  const { labels, store } = settings;
  const head = ["Order reference", "Order number", "Consignee name", "Consignee phone", "Consignee address", "Destination city", "Pieces", "Weight (kg)", "COD amount", "Product description", "Special instructions", "Shipper name", "Shipper phone", "Return address"];
  const rows = orders.map((o) => [
    o.ref, o.number, o.customer_name, localPhone(o.phone, store.country_code),
    o.address.replace(/\s+/g, " "), o.city, o.pieces, labels.weight_kg || "", o.payment_method === "cod" && o.channel !== "store" ? o.total : 0,
    o.items.map((i) => `${i.name} (${i.size}) x${i.qty}`).join("; "),
    [o.swap ? `EXCHANGE: collect the old piece from the customer: ${o.swap.pieces}` : "", labels.caution].filter(Boolean).join(". "),
    store.name, localPhone(String(store.phone || store.whatsapp || "").replace(/\D/g, ""), store.country_code), (labels.return_address || store.address || "").replace(/\s+/g, " "),
  ]);
  return "﻿" + [head, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
