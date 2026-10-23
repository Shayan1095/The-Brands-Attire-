import "server-only";
import crypto from "node:crypto";
import { query, tx } from "./db";
import { getSettings, siteUrl } from "./settings";
import { notify, sendSoon } from "./notify";
import { getOrder, createManualOrder, notifyBackInStock } from "./orders";
import { revokePoints } from "./crm";
import { CASE_TYPES, CASE_REASONS, CASE_STATUS, RESOLUTIONS, variantLabel, money } from "./format";

/*
  Returns, exchanges and complaints ("cases", numbered RMA-1001...).

    requested -> approved -> in_transit -> received -> resolved
             \-> rejected            (a complaint can be resolved straight from requested)

  Customers ask from their order page; staff can also open one for any order (the customer phoned) and may
  accept it outside the rules. The customer never posts anything: once approved, staff book a pickup with
  their own rider or a contracted courier (bookPickup). An exchange can be swapped at the door: the
  replacement order is created at booking (so the new size is held) and, when it is marked delivered, the
  old piece goes back in stock and the case closes by itself (onSwapOrderStatus). Otherwise staff mark the
  piece collected, each item back on the shelf or written off, and settle: a replacement order (with the
  exchange fee when it was the customer's choice), a refund record or a store-credit code.
*/

export const OPEN = ["requested", "approved", "in_transit", "received"];
const fault = (reason) => Boolean(CASE_REASONS[reason]?.[1]);

/**
 * What the customer may ask for on this order, worked out from the return settings.
 * Returns { window, open, until, types: { exchange, return, complaint }, items: [...] } where each item has the
 * quantity still free to send back (not already in a request) and the other sizes it could be swapped for.
 */
export async function caseOptions(order, settings) {
  const r = settings.returns;
  const delivered = order.delivered_at ? new Date(order.delivered_at) : null;
  const until = delivered ? new Date(delivered.getTime() + r.window_days * 864e5) : null;
  const inWindow = order.status === "delivered" && until && until > new Date();

  const [taken, variants] = await Promise.all([
    query(
      `SELECT ci.order_item_id, sum(ci.qty)::int AS qty FROM case_items ci JOIN cases c ON c.id = ci.case_id
       WHERE c.order_id = $1 AND c.status <> 'rejected' AND c.type <> 'complaint' GROUP BY ci.order_item_id`, [order.id]),
    query(
      `SELECT v.id, v.product_id, v.size, v.color, GREATEST(v.stock - v.reserved, 0) AS stock
       FROM variants v JOIN products p ON p.id = v.product_id
       WHERE p.status = 'active' AND v.product_id = ANY($1::int[]) ORDER BY v.sort_order, v.id`,
      [order.items.map((i) => i.product_id).filter(Boolean)]),
  ]);
  const items = order.items.map((i) => ({
    id: i.id, name: i.name, size: i.size, image: i.image_url, price: i.unit_price, qty: i.qty,
    free: Math.max(0, i.qty - (taken.find((t) => t.order_item_id === i.id)?.qty || 0)),
    sale: Boolean(i.was_price && i.was_price > i.unit_price),
    swaps: variants.filter((v) => v.product_id === i.product_id && v.id !== i.variant_id && v.stock > 0).map((v) => ({ id: v.id, label: variantLabel(v) })),
  }));
  return {
    window: r.window_days, until: until?.toISOString() || null, open: Boolean(inWindow),
    rules: { exchanges: r.exchanges, refunds: r.refunds, sale_items: r.sale_items },
    // a fault (wrong, faulty...) is always accepted inside the window, whatever the other rules say
    types: {
      exchange: Boolean(inWindow),
      return: Boolean(inWindow),
      complaint: ["shipped", "delivered", "returned"].includes(order.status),
    },
    items,
  };
}

/** Is this request inside the rules? Returns an error sentence, or "" when it is. */
function ruleBreak({ type, reason, picked, options }) {
  if (type === "complaint") return options.types.complaint ? "" : "A problem can be reported once the order has been sent.";
  if (!options.open) return `Returns and exchanges are accepted within ${options.window} days of delivery.`;
  if (!fault(reason)) {
    if (type === "exchange" && !options.rules.exchanges) return "Exchanges are only accepted for faulty or wrong items.";
    if (type === "return" && !options.rules.refunds) return "Refunds are only given for faulty or wrong items. You can ask for an exchange instead.";
    if (!options.rules.sale_items && picked.some((p) => p.item.sale)) return "Sale items are final unless they are faulty or wrong.";
  }
  return "";
}

/**
 * Opens a request. `input` = { type, reason, details, items: [{ orderItemId, qty, wantVariantId }] }.
 * `admin` set = staff opened it for the customer and may go outside the rules (it is then marked as such).
 */
export async function openCase(order, input, { admin = null, source = "customer" } = {}) {
  const settings = await getSettings();
  const type = CASE_TYPES[input?.type] ? input.type : null;
  const reason = CASE_REASONS[input?.reason] ? input.reason : null;
  if (!type || !reason) return { error: "Choose what you would like and why." };
  const details = String(input.details || "").trim().slice(0, 1500);
  const options = await caseOptions(order, settings);

  const picked = [];
  for (const it of Array.isArray(input.items) ? input.items.slice(0, 50) : []) {
    const item = options.items.find((i) => i.id === Number(it.orderItemId));
    const qty = Math.floor(Number(it.qty) || 0);
    if (!item || qty < 1) continue;
    if (type !== "complaint" && qty > item.free) return { error: `${item.name} (${item.size}) is already in another request.` };
    const want = type === "exchange" ? item.swaps.find((s) => s.id === Number(it.wantVariantId)) : null;
    if (type === "exchange" && !want) return { error: `Choose the size you want instead of ${item.name} (${item.size}).` };
    picked.push({ item, qty, want });
  }
  if (type !== "complaint" && !picked.length) return { error: "Choose at least one item." };
  if (type === "complaint" && !details && !picked.length) return { error: "Tell us what went wrong." };

  const broken = ruleBreak({ type, reason, picked, options });
  if (broken && !admin) return { error: broken };

  const c = await tx(async (q) => {
    const [row] = await q(
      `INSERT INTO cases (order_id, contact_id, type, reason, details, source, eligible, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [order.id, order.contact_id, type, reason, details, admin ? "staff" : source, !broken, admin?.id || null]
    );
    const number = `RMA-${1000 + row.id}`;
    await q("UPDATE cases SET number = $2 WHERE id = $1", [row.id, number]);
    for (const p of picked) {
      const oi = order.items.find((i) => i.id === p.item.id);
      await q(
        `INSERT INTO case_items (case_id, order_item_id, product_id, variant_id, name, size, unit_price, qty, want_variant_id, want_size)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [row.id, oi.id, oi.product_id, oi.variant_id, oi.name, oi.size, oi.unit_price, p.qty, p.want?.id || null, p.want?.label || ""]
      );
    }
    await logCase(q, row.id, admin, `${admin ? "Opened by staff" : source === "feedback" ? "Raised from a low feedback rating" : "Requested by the customer"}${broken ? ` outside the rules (${broken})` : ""}`);
    return { id: row.id, number };
  });

  const vars = await caseVars(c.id);
  await notify("case_opened", { email: order.email, phone: order.phone === "0" ? null : order.phone, contactId: order.contact_id, orderId: order.id, vars });
  await notify("owner_new_case", { vars });
  sendSoon(10);
  // the returns triage agent looks at it straight away (see lib/agents-writers.js)
  await import("./agents-writers").then((m) => m.onCaseOpened(c.id)).catch((e) => console.error("[triage]", e));
  return { ok: true, ...c };
}

const logCase = (q, caseId, admin, note) =>
  q("INSERT INTO case_events (case_id, admin_id, actor, note) VALUES ($1,$2,$3,$4)", [caseId, admin?.id || null, admin?.name || (admin ? "Staff" : "customer"), note]);

/** One case with its items, events and order. */
export async function getCase(id) {
  const [c] = await query(
    `SELECT c.*, o.number AS order_number, o.token AS order_token, o.customer_name, o.phone, o.email, o.address, o.city,
            o.delivered_at, o.channel, x.number AS exchange_number, a.name AS staff
     FROM cases c JOIN orders o ON o.id = c.order_id
     LEFT JOIN orders x ON x.id = c.exchange_order_id LEFT JOIN admins a ON a.id = c.assigned_to
     WHERE c.id = $1`, [id]);
  if (!c) return null;
  [c.items, c.events] = await Promise.all([
    query(
      `SELECT ci.*, (SELECT thumb_url FROM product_images i WHERE i.product_id = ci.product_id ORDER BY i.sort_order, i.id LIMIT 1) AS image,
              GREATEST(w.stock - w.reserved, 0) AS want_stock
       FROM case_items ci LEFT JOIN variants w ON w.id = ci.want_variant_id WHERE ci.case_id = $1 ORDER BY ci.id`, [id]),
    query("SELECT * FROM case_events WHERE case_id = $1 ORDER BY id DESC", [id]),
  ]);
  return c;
}

/** Message variables for a case. */
async function caseVars(id, extra = {}) {
  const c = await getCase(id);
  const settings = await getSettings();
  return {
    name: c.customer_name.split(" ")[0], customer: c.customer_name, case_number: c.number, order_number: c.order_number,
    type: CASE_TYPES[c.type].toLowerCase(), reason: CASE_REASONS[c.reason][0], details: c.details,
    order_url: `${siteUrl()}/order/${c.order_token}`, admin_url: `${siteUrl()}/admin/returns/${c.id}`,
    instructions: settings.returns.instructions, note: c.staff_note, ...extra,
  };
}

async function tell(event, id, extra) {
  const c = await getCase(id);
  await notify(event, {
    email: c.email, phone: c.phone === "0" ? null : c.phone, contactId: c.contact_id, orderId: c.order_id,
    vars: await caseVars(id, extra),
  });
  sendSoon(10);
}

/**
 * Moves a case on, only from the states given in `from` (two people clicking at once cannot both win).
 * `set` adds column updates written with placeholders from $4 on, filled from `params`.
 */
async function move(id, from, to, admin, note, set = "", params = []) {
  return tx(async (q) => {
    const [row] = await q(`UPDATE cases SET status = $3 ${set} WHERE id = $1 AND status = ANY($2::text[]) RETURNING id`, [id, from, to, ...params]);
    if (!row) return null;
    await logCase(q, id, admin, note);
    return row;
  });
}

export async function decideCase(id, approve, note, admin) {
  const text = String(note || "").trim().slice(0, 600);
  await query("UPDATE cases SET staff_note = $2 WHERE id = $1 AND status = 'requested'", [id, text]);
  const ok = await move(id, ["requested"], approve ? "approved" : "rejected", admin,
    `${approve ? "Approved" : "Declined"}${text ? `: ${text}` : ""}`, ", decided_at = now()");
  if (!ok) return { error: "This request was already decided." };
  await tell(approve ? "case_approved" : "case_rejected", id);
  return { ok: true };
}

/**
 * The rider brought the piece back (a plain collection): each item goes back on the shelf or is written off.
 * `conditions` = { [case item id]: "restock" | "damaged" }.
 */
export async function receiveCase(id, conditions, admin) {
  const c = await getCase(id);
  if (!c || !["approved", "in_transit"].includes(c.status)) return { error: "This request is not waiting for a parcel." };
  const restocked = [];
  const done = await tx(async (q) => {
    const [row] = await q("UPDATE cases SET status = 'received', received_at = now() WHERE id = $1 AND status = ANY($2::text[]) RETURNING id", [id, ["approved", "in_transit"]]);
    if (!row) return false;
    for (const it of c.items) {
      const damaged = conditions?.[it.id] === "damaged";
      await q("UPDATE case_items SET condition = $2 WHERE id = $1", [it.id, damaged ? "damaged" : "restock"]);
      if (!it.variant_id) continue;
      if (!damaged) { await q("UPDATE variants SET stock = stock + $2 WHERE id = $1", [it.variant_id, it.qty]); restocked.push(it.variant_id); }
      await q(
        "INSERT INTO stock_movements (variant_id, delta, qty, type, reason, order_id, admin_id) VALUES ($1,$2,$3,$4,$5,$6,$7)",
        [it.variant_id, damaged ? 0 : it.qty, it.qty, damaged ? "damaged" : "return", `${damaged ? "Returned damaged" : "Returned"} ${c.number}`, c.order_id, admin?.id || null]
      );
    }
    const back = c.items.filter((i) => conditions?.[i.id] !== "damaged").length;
    await logCase(q, id, admin, `Collected: ${back} back in stock, ${c.items.length - back} written off`);
    return true;
  });
  if (!done) return { error: "This request is not waiting for a parcel." };
  if (restocked.length) await notifyBackInStock(restocked);
  await tell("case_received", id);
  return { ok: true };
}

/**
 * Settles a case. `how` = exchange | refund | credit | none.
 *   exchange: a free replacement order for the sizes asked for, sent like any confirmed order
 *   refund:   records the amount, how it was paid and a reference
 *   credit:   makes a one-time code for the customer worth the amount
 */
export async function resolveCase(id, { how, amount, method, reference, note }, admin) {
  const c = await getCase(id);
  if (!c || !["requested", "approved", "in_transit", "received"].includes(c.status)) return { error: "This request is already closed." };
  if (!RESOLUTIONS[how]) return { error: "Choose how to settle it." };
  if (c.type !== "complaint" && c.status === "requested") return { error: "Approve the request first." };
  if (c.status === "in_transit" && c.pickup_method === "swap") return { error: "The swap is out with the rider: it closes by itself when its order is marked delivered. Cancel that order first to settle another way." };
  const settings = await getSettings();
  const value = Math.max(0, Math.floor(Number(amount) || 0));
  const text = String(note || "").trim().slice(0, 600);
  const m = String(method || "").trim().slice(0, 60), ref = String(reference || "").trim().slice(0, 80);
  if (how === "exchange" && !c.items.some((i) => i.want_variant_id)) return { error: "This request has no sizes to send instead. Settle it another way." };
  if ((how === "refund" || how === "credit") && !value) return { error: `Enter the ${how === "credit" ? "credit" : "refund"} amount.` };
  if (how === "refund" && !m) return { error: "Say how the refund was paid (bank transfer, JazzCash...)." };

  // claim it first, so two people settling at once cannot both create a replacement or a code;
  // if anything below fails, it goes back to where it was
  const [claimed] = await query("UPDATE cases SET status = 'resolved' WHERE id = $1 AND status = $2 RETURNING id", [id, c.status]);
  if (!claimed) return { error: "Someone else just changed this request. Reload the page." };
  const undo = () => query("UPDATE cases SET status = $2 WHERE id = $1", [id, c.status]);

  // extra column updates for this way of settling
  const cols = { resolution: how };
  let summary = RESOLUTIONS[how];
  try {
    if (how === "exchange") {
      const res = await makeReplacement(c, admin, settings, `Exchange for ${c.order_number} (${c.number}). The old piece was already collected.`);
      if (res.error) { await undo(); return { error: `The replacement could not be created: ${res.error}` }; }
      cols.exchange_order_id = Number(res.id);
      summary = `Replacement order ${res.number} created`;
    } else if (how === "refund") {
      Object.assign(cols, { refund_amount: value, refund_status: "paid", refund_method: m, refund_ref: ref });
      summary = `Refunded ${money(value, settings.store.currency)} by ${m}${ref ? ` (${ref})` : ""}`;
    } else if (how === "credit") {
      const code = `CREDIT-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
      await query(
        "INSERT INTO coupons (code, type, value, max_uses, ends_at, contact_id, note) VALUES ($1, 'fixed', $2, 1, now() + interval '180 days', $3, $4)",
        [code, value, c.contact_id, `Store credit for ${c.number}`]
      );
      Object.assign(cols, { credit_code: code, refund_amount: value });
      summary = `Store credit ${code} worth ${money(value, settings.store.currency)}, valid 180 days`;
    }
  } catch (err) {
    await undo();
    throw err;
  }

  const finalNote = [summary, text].filter(Boolean).join(". ");
  const keys = Object.keys(cols);
  await tx(async (q) => {
    // column names come from the fixed list above; values are passed as parameters
    await q(
      `UPDATE cases SET staff_note = $2, resolved_at = now()${how === "refund" ? ", refunded_at = now()" : ""}${keys.map((k, i) => `, ${k} = $${i + 3}`).join("")} WHERE id = $1`,
      [id, finalNote, ...keys.map((k) => cols[k])]
    );
    await logCase(q, id, admin, `Settled: ${finalNote}`);
  });
  // money given back on a return also takes back the loyalty points it earned (goodwill on a complaint does not)
  if (c.type === "return" && (how === "refund" || how === "credit")) {
    await revokePoints(c.order_id, value, how === "refund" ? "refunded" : "returned for store credit").catch((e) => console.error("[points]", e));
  }
  await tell("case_resolved", id);
  return { ok: true };
}

/* ---------------- pickups: the brand collects, the customer never posts anything ---------------- */

/** The delivery fee for an exchange: free when the fault was ours, otherwise the setting (0 = always free). */
export function exchangeFee(c, settings) {
  return !fault(c.reason) && Number(settings.returns.exchange_fee) > 0 ? Number(settings.returns.exchange_fee) : 0;
}

/**
 * The replacement order for an exchange: the sizes asked for, nothing to pay for the piece itself (only the
 * exchange fee, if any, collected on delivery), confirmed straight away so the stock is taken (held) now.
 */
async function makeReplacement(c, admin, settings, notes) {
  const lines = c.items.filter((i) => i.want_variant_id);
  if (!lines.length) return { error: "This request has no sizes to send instead." };
  const fee = exchangeFee(c, settings);
  return createManualOrder({
    channel: c.channel === "website" ? "other" : c.channel, mode: "confirmed",
    name: c.customer_name, phone: c.phone === "0" ? "" : `+${c.phone}`, email: c.email || "", address: c.address, city: c.city,
    notes: notes.slice(0, 500), items: lines.map((i) => ({ variantId: i.want_variant_id, qty: i.qty })),
    discount: 1e9, shipping: fee, exchangeOf: c.order_id, assignedTo: c.assigned_to || admin?.id,
  }, admin);
}

const pieces = (items, key = "size") => items.map((i) => `${i.name} (${i[key]})${i.qty > 1 ? ` × ${i.qty}` : ""}`).join(", ");

/**
 * Books the pickup for an approved request.
 *   method "swap"    (exchanges) a replacement order is created now: the rider delivers the new size and collects
 *                    the old piece in the same visit. When that order is marked delivered, the old piece is taken
 *                    back into stock and the exchange closes by itself (onSwapOrderStatus).
 *   method "collect" the rider only collects; staff mark it collected, then settle (refund, credit or replacement).
 *   by "rider" | "courier", carrier = the rider's or courier company's name, ref = a booking number, date = when.
 */
export async function bookPickup(id, { method, by, carrier, ref, date, note }, admin) {
  const settings = await getSettings();
  const c = await getCase(id);
  if (!c || !["approved", "in_transit"].includes(c.status)) return { error: "Approve the request first." };
  if (c.status === "in_transit" && c.pickup_method === "swap") return { error: "The swap is already on its way." };
  const swap = method === "swap";
  if (swap && c.type !== "exchange") return { error: "Only an exchange can be swapped at the door." };
  const who = by === "courier" ? "courier" : "rider";
  // a swap travels as a normal order, so its courier is chosen when that order is dispatched; a plain collection
  // says who goes now (the usual collector from Settings when left empty)
  const name = swap ? "" : String(carrier || settings.returns.carrier || (who === "rider" ? "Our rider" : "our courier")).trim().slice(0, 60);
  const booking = String(ref || "").trim().slice(0, 80);
  const day = /^\d{4}-\d{2}-\d{2}$/.test(String(date || "")) ? date : null;
  const extra = String(note || "").trim().slice(0, 200);

  let swapOrder = null;
  if (swap) {
    const back = pieces(c.items);
    const res = await makeReplacement(c, admin, settings,
      `EXCHANGE ${c.number}: deliver the new size and COLLECT the old piece: ${back}. Check it is unworn with tags.${extra ? ` ${extra}` : ""}`);
    if (res.error) return { error: `The swap order could not be created: ${res.error}` };
    swapOrder = res;
  }
  await tx(async (q) => {
    await q(
      `UPDATE cases SET status = 'in_transit', pickup_method = $2, pickup_by = $3, return_courier = $4, return_tracking = $5, pickup_date = $6,
         exchange_order_id = COALESCE($7, exchange_order_id), resolution = CASE WHEN $2 = 'swap' THEN 'exchange' ELSE resolution END
       WHERE id = $1`,
      [c.id, swap ? "swap" : "collect", swap ? "" : who, name, booking, day, swapOrder ? Number(swapOrder.id) : null]
    );
    await logCase(q, c.id, admin, swap
      ? `Swap booked: order ${swapOrder.number} delivers the new size and collects the old piece${day ? ` on ${day}` : ""}. The courier is chosen when it is dispatched`
      : `Pickup booked with ${name}${booking ? ` (${booking})` : ""}${day ? ` on ${day}` : ""}`);
  });

  const when = day ? new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" }).format(new Date(`${day}T12:00:00`)) : "in the next few days";
  const fee = swap ? exchangeFee(c, settings) : 0;
  const how = swap
    ? `Our delivery partner will bring your new size (${pieces(c.items, "want_size")}) and collect ${pieces(c.items)} at the same time.${fee ? ` Please keep ${money(fee, settings.store.currency)} ready for the exchange delivery.` : " There is nothing to pay."}`
    : `${name} will come to collect ${pieces(c.items)}${booking ? ` (booking ${booking})` : ""}.`;
  await tell("case_pickup", c.id, { when, how });
  return { ok: true, order: swapOrder };
}

/**
 * Called whenever an order changes status. If it is the swap order of an exchange:
 *   delivered            the old piece came back with the rider: back into stock, and the exchange is closed
 *   cancelled / returned the swap did not happen: the request goes back to "arrange pickup"
 */
export async function onSwapOrderStatus(orderId, status) {
  if (!["shipped", "delivered", "cancelled", "returned"].includes(status)) return;
  const [row] = await query("SELECT id FROM cases WHERE exchange_order_id = $1 AND pickup_method = 'swap' AND status = 'in_transit'", [orderId]);
  if (!row) return;
  if (status === "shipped") {
    // the courier was chosen at dispatch: the request shows who is bringing it (the customer got the dispatch message)
    const [o] = await query("SELECT courier, tracking_number, ref FROM orders WHERE id = $1", [orderId]);
    await query("UPDATE cases SET return_courier = $2, return_tracking = $3 WHERE id = $1", [row.id, o.courier || "", o.tracking_number || o.ref || ""]);
    await logCase(query, row.id, { id: null, name: "System" }, `Swap dispatched${o.courier ? ` with ${o.courier}` : ""}${o.tracking_number || o.ref ? ` (${o.tracking_number || o.ref})` : ""}`);
    return;
  }
  const c = await getCase(row.id);
  const system = { id: null, name: "System" };
  if (status === "delivered") {
    const restocked = [];
    await tx(async (q) => {
      for (const it of c.items) {
        await q("UPDATE case_items SET condition = 'restock' WHERE id = $1", [it.id]);
        if (!it.variant_id) continue;
        await q("UPDATE variants SET stock = stock + $2 WHERE id = $1", [it.variant_id, it.qty]);
        await q(
          "INSERT INTO stock_movements (variant_id, delta, qty, type, reason, order_id) VALUES ($1,$2,$2,'return',$3,$4)",
          [it.variant_id, it.qty, `Collected on the swap for ${c.number}`, c.order_id]
        );
        restocked.push(it.variant_id);
      }
      await q(
        `UPDATE cases SET status = 'resolved', received_at = now(), resolved_at = now(),
           staff_note = $2 WHERE id = $1`,
        [c.id, `Your new size was delivered and the old piece collected. Enjoy it!`]
      );
      await logCase(q, c.id, system, `Swap delivered (${c.exchange_number}): old piece collected and back in stock. Exchange closed. If it came back damaged, write it off on this page.`);
    });
    if (restocked.length) await notifyBackInStock(restocked);
    await tell("case_resolved", c.id);
  } else {
    await tx(async (q) => {
      await q("UPDATE cases SET status = 'approved', pickup_method = '', exchange_order_id = NULL WHERE id = $1", [c.id]);
      await logCase(q, c.id, system, `The swap order ${c.exchange_number} was ${status === "cancelled" ? "cancelled" : "refused at the door"}. Arrange the pickup again.`);
    });
  }
}

/** A piece taken back into stock turned out damaged: take it out again and log it as written off. */
export async function markDamaged(caseItemId, admin) {
  const [it] = await query(
    `SELECT ci.*, c.number, c.order_id, c.id AS case_id FROM case_items ci JOIN cases c ON c.id = ci.case_id
     WHERE ci.id = $1 AND ci.condition = 'restock' AND c.status IN ('received', 'resolved')`, [caseItemId]);
  if (!it) return { error: "That piece is not marked as back in stock." };
  await tx(async (q) => {
    await q("UPDATE case_items SET condition = 'damaged' WHERE id = $1", [it.id]);
    if (it.variant_id) {
      await q("UPDATE variants SET stock = GREATEST(stock - $2, 0) WHERE id = $1", [it.variant_id, it.qty]);
      await q(
        "INSERT INTO stock_movements (variant_id, delta, qty, type, reason, order_id, admin_id) VALUES ($1,$2,$3,'damaged',$4,$5,$6)",
        [it.variant_id, -it.qty, it.qty, `Came back damaged ${it.number}`, it.order_id, admin?.id || null]
      );
    }
    await logCase(q, it.case_id, admin, `${it.name} (${it.size}) came back damaged: written off`);
  });
  return { ok: true };
}

/** Gives the request to a staff member, who is told by email. */
export async function assignCase(id, staffId, admin) {
  const [staff] = staffId ? await query("SELECT id, name, email FROM admins WHERE id = $1 AND is_active", [staffId]) : [null];
  const [c] = await query("UPDATE cases SET assigned_to = $2 WHERE id = $1 RETURNING id, number, type", [id, staff?.id || null]);
  if (!c) return { error: "Request not found." };
  await logCase(query, c.id, admin, staff ? `Assigned to ${staff.name || staff.email}` : "Unassigned");
  if (staff && staff.id !== admin?.id) {
    const full = await getCase(c.id);
    await notify("staff_case_assigned", {
      email: staff.email,
      vars: { staff: staff.name || "there", case_number: c.number, type: CASE_TYPES[c.type].toLowerCase(), customer: full.customer_name, by: admin?.name || "the owner", admin_url: `${siteUrl()}/admin/returns/${c.id}` },
    });
    sendSoon(5);
  }
  return { ok: true };
}

// the staff labels say what the team must do next; the customer sees where their request is
const CUSTOMER_STATUS = { requested: "Waiting for review", approved: "Approved", in_transit: "Pickup booked", received: "Collected", resolved: "Done", rejected: "Declined" };

/** For the order page: this order's requests, newest first, without staff-only details. */
export async function casesForOrder(orderId) {
  const rows = await query(
    `SELECT c.id, c.number, c.type, c.reason, c.status, c.staff_note, c.return_courier, c.return_tracking, c.pickup_method, c.pickup_date::text AS pickup_date,
            c.created_at, c.credit_code, x.token AS exchange_token, x.number AS exchange_number, x.total AS exchange_total
     FROM cases c LEFT JOIN orders x ON x.id = c.exchange_order_id WHERE c.order_id = $1 ORDER BY c.id DESC`, [orderId]);
  const items = rows.length ? await query("SELECT case_id, name, size, qty, want_size FROM case_items WHERE case_id = ANY($1::int[]) ORDER BY id", [rows.map((r) => r.id)]) : [];
  return rows.map((r) => ({
    ...r, created_at: r.created_at.toISOString(), items: items.filter((i) => i.case_id === r.id),
    status_label: CUSTOMER_STATUS[r.status] || CASE_STATUS[r.status].label,
  }));
}

export { getOrder };
