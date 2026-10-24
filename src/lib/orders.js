import "server-only";
import crypto from "node:crypto";
import { query, tx } from "./db";
import { getSettings, siteUrl } from "./settings";
import { getActiveSales, applyPricing } from "./catalog";
import { upsertContact } from "./contacts";
import { notify, orderVars, processQueue, drainQueue, sendSoon, EVENTS, changeUntil } from "./notify";
import { awardPoints, revokePoints, runRetention } from "./crm";
import { normalizePhone, isEmail, variantLabel, CHANNELS, ORDER_STATUS, CANCEL_REASONS } from "./format";

/*
  Stock model
    variants.stock     what is physically on hand
    variants.reserved  promised to orders the customer has not confirmed yet
    available          stock - reserved  (what the shop will sell)

  An unconfirmed order only RESERVES its items. Confirming it DEDUCTS them from stock and
  releases the reservation. Cancelling releases (or, after deduction, puts the items back).
  orders.stock_deducted records which of the two states an order is in.
*/

/**
 * Prices a cart on the server. The browser only sends variant ids and quantities;
 * names, prices, stock, discounts and shipping are always worked out here.
 */
/**
 * Prices a cart. `who` = { phone, email } of the person ordering: a personal code (store credit, a reward, the
 * code on a thank-you card) only works for the customer it was made for. `maxQty` caps pieces per size (shop
 * checkout only; staff orders are not capped).
 */
export async function quoteCart(items, couponCode, { who = null, maxQty = 0 } = {}) {
  const settings = await getSettings();
  const wanted = new Map();
  for (const it of items || []) {
    const id = Number(it.variantId);
    const qty = Math.min(50, Math.max(1, Math.floor(Number(it.qty) || 1)));
    if (id) wanted.set(id, (wanted.get(id) || 0) + qty);
  }
  const empty = { lines: [], subtotal: 0, discount: 0, shipping: 0, total: 0, issues: [], coupon: null };
  if (!wanted.size) return empty;

  const [rows, sales] = await Promise.all([
    query(
      `SELECT v.id AS variant_id, v.size, v.color, GREATEST(v.stock - v.reserved, 0) AS stock,
              p.id, p.name, p.slug, p.price, p.compare_at_price, p.category_id, p.status, p.low_stock_threshold,
              (SELECT thumb_url FROM product_images i WHERE i.product_id = p.id ORDER BY i.sort_order, i.id LIMIT 1) AS image
       FROM variants v JOIN products p ON p.id = v.product_id WHERE v.id = ANY($1::int[])`,
      [[...wanted.keys()]]
    ),
    getActiveSales(),
  ]);

  const lines = [];
  const issues = [];
  for (const [variantId, qty] of wanted) {
    const r = rows.find((x) => x.variant_id === variantId);
    if (!r || r.status !== "active") { issues.push({ variantId, message: "An item in your bag is no longer available." }); continue; }
    applyPricing(r, sales);
    const size = variantLabel(r);
    if (maxQty > 0 && qty > maxQty) issues.push({ variantId, message: `You can order up to ${maxQty} of ${r.name} (${size}) at a time. For more, message us on WhatsApp.` });
    else if (r.stock < qty) {
      issues.push({ variantId, message: r.stock ? `Only ${r.stock} left of ${r.name} (${size}).` : `${r.name} (${size}) just sold out.` });
    }
    lines.push({
      variantId, productId: r.id, slug: r.slug, name: r.name, size, image: r.image,
      price: r.final_price, was: r.original_price, qty, stock: r.stock, threshold: r.low_stock_threshold,
    });
  }

  const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0);
  let discount = 0;
  let coupon = null;
  const code = String(couponCode || "").trim().toUpperCase();
  if (code) {
    const [c] = await query("SELECT * FROM coupons WHERE code = $1", [code]);
    if (!c || !c.is_active || (c.ends_at && c.ends_at < new Date()) || (c.max_uses !== null && c.used_count >= c.max_uses)) {
      coupon = { code, error: "This code is not valid." };
    } else if (c.contact_id && who && !(await ownsCode(c.contact_id, who, settings))) {
      // a personal code: only for the phone number or email it was made for
      coupon = { code, error: "This code is personal and belongs to another customer. Use the phone number or email it was sent to." };
    } else if (subtotal < c.min_subtotal) {
      coupon = { code, error: `This code needs a minimum order of ${settings.store.currency} ${c.min_subtotal.toLocaleString("en-US")}.` };
    } else {
      discount = c.type === "percent" ? Math.round((subtotal * c.value) / 100) : Math.min(c.value, subtotal);
      coupon = { code, id: c.id, label: c.type === "percent" ? `${c.value}% off` : "Discount" };
    }
  }

  const { fee, free_over } = settings.shipping;
  const shipping = free_over > 0 && subtotal - discount >= free_over ? 0 : Number(fee) || 0;
  return { lines, subtotal, discount, shipping, total: subtotal - discount + shipping, issues, coupon };
}

/** Is the person ordering ({ phone, email }) the customer this personal code was made for? */
async function ownsCode(contactId, who, settings) {
  const [c] = await query("SELECT phone, email FROM contacts WHERE id = $1", [contactId]);
  if (!c) return false;
  const phone = who.phone ? normalizePhone(who.phone, settings.store.country_code) : "";
  const email = String(who.email || "").trim().toLowerCase();
  return Boolean((phone && c.phone && phone === c.phone) || (email && c.email && email === c.email.toLowerCase()));
}

export async function getOrder(where, value) {
  const col = { id: "id", token: "token", number: "number", ref: "ref" }[where];
  const [order] = await query(`SELECT * FROM orders WHERE ${col} = $1`, [value]);
  if (!order) return null;
  order.items = await query("SELECT * FROM order_items WHERE order_id = $1 ORDER BY id", [order.id]);
  return order;
}

const logEvent = (q, orderId, { adminId = null, actor = "system", type, note = "" }) =>
  q("INSERT INTO order_events (order_id, admin_id, actor, type, note) VALUES ($1,$2,$3,$4,$5)", [orderId, adminId, actor, type, note]);

/** Queue the customer message for an event, if there is one for it. */
async function sendOrderMessage(event, order) {
  if (!EVENTS[event]) return;
  const settings = await getSettings();
  await notify(event, {
    email: order.email, phone: order.phone, contactId: order.contact_id, orderId: order.id,
    vars: orderVars(order, order.items, settings),
  });
}

/** Take the items of an order out of physical stock (and release their reservation if they had one). */
async function deductStock(q, order, wasReserved, adminId) {
  const items = await q("SELECT variant_id, qty FROM order_items WHERE order_id = $1 AND variant_id IS NOT NULL", [order.id]);
  for (const it of items) {
    await q(
      `UPDATE variants SET stock = GREATEST(stock - $2, 0), reserved = GREATEST(reserved - $3, 0) WHERE id = $1`,
      [it.variant_id, it.qty, wasReserved ? it.qty : 0]
    );
    await q(
      "INSERT INTO stock_movements (variant_id, delta, qty, type, reason, order_id, admin_id) VALUES ($1,$2,$3,'sale',$4,$5,$6)",
      [it.variant_id, -it.qty, it.qty, `Order ${order.number}`, order.id, adminId]
    );
  }
  await q("UPDATE orders SET stock_deducted = true WHERE id = $1", [order.id]);
}

/**
 * Creates an order from any channel. Used by the shop checkout and by staff entering
 * WhatsApp / Instagram / phone / walk-in orders.
 *   status "pending"   -> items reserved, customer is asked to confirm
 *   status "confirmed" -> items deducted now (staff already confirmed with the customer)
 *   status "delivered" -> paid and handed over on the spot (store sale)
 */
async function createOrder({ customer, quote, channel = "website", status = "pending", admin = null, assignedTo = null, exchangeOf = null, optIn = false }) {
  const { name, phone, email, address, city, notes } = customer;
  // an anonymous walk-in sale (no phone, no email) does not create a customer record
  const contact = phone === "0" && !email ? null : await upsertContact({ name, email, phone: phone === "0" ? null : phone, city, source: channel === "website" ? "order" : channel, emailOptIn: Boolean(optIn && email), whatsappOptIn: Boolean(optIn) });
  const deductNow = status !== "pending";

  let order;
  try {
    order = await tx(async (q) => {
      for (const l of quote.lines) {
        // the WHERE clause makes overselling impossible, whichever channel sells the last piece
        const [ok] = await q(
          deductNow
            ? "UPDATE variants SET stock = stock - $2 WHERE id = $1 AND stock - reserved >= $2 RETURNING stock - reserved AS available"
            : "UPDATE variants SET reserved = reserved + $2 WHERE id = $1 AND stock - reserved >= $2 RETURNING stock - reserved AS available",
          [l.variantId, l.qty]
        );
        if (!ok) throw Object.assign(new Error(`${l.name} (${l.size}) just sold out.`), { userFacing: true });
        l.left = ok.available;
      }
      const [o] = await q(
        `INSERT INTO orders (token, contact_id, customer_name, email, phone, address, city, notes, subtotal, discount, shipping, total, coupon_code,
                             channel, status, created_by, assigned_to, exchange_of, stock_deducted, confirmed_by,
                             confirmed_at, delivered_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
                 CASE WHEN $15::text <> 'pending' THEN now() END, CASE WHEN $15::text = 'delivered' THEN now() END) RETURNING id`,
        [crypto.randomBytes(18).toString("base64url"), contact?.id || null, name, email, phone, address, city, notes,
         quote.subtotal, quote.discount, quote.shipping, quote.total, quote.coupon?.id ? quote.coupon.code : null,
         channel, status, admin?.id || null, assignedTo, exchangeOf, deductNow, deductNow ? "staff" : null]
      );
      const number = `TBA-${1000 + o.id}`;
      await q("UPDATE orders SET number = $2 WHERE id = $1", [o.id, number]);
      for (const l of quote.lines) {
        await q(
          // was_price: the price before a sale, so "sale items are final" can be applied to returns later
          "INSERT INTO order_items (order_id, product_id, variant_id, name, size, image_url, unit_price, qty, was_price) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
          [o.id, l.productId, l.variantId, l.name, l.size, l.image, l.price, l.qty, l.was || null]
        );
        if (deductNow) {
          await q(
            "INSERT INTO stock_movements (variant_id, delta, qty, type, reason, order_id, admin_id) VALUES ($1,$2,$3,'sale',$4,$5,$6)",
            [l.variantId, -l.qty, l.qty, `Order ${number}`, o.id, admin?.id || null]
          );
        }
      }
      if (quote.coupon?.id) {
        // a one-time code can only be used once, even by two orders placed at the same moment
        const [used] = await q("UPDATE coupons SET used_count = used_count + 1 WHERE id = $1 AND (max_uses IS NULL OR used_count < max_uses) RETURNING id", [quote.coupon.id]);
        if (!used) throw Object.assign(new Error("This code was just used. Remove it to place your order."), { userFacing: true });
      }
      await logEvent(q, o.id, {
        adminId: admin?.id, actor: admin?.name || "customer", type: "created",
        note: `Order created via ${CHANNELS[channel] || channel}${status !== "pending" ? ` as ${ORDER_STATUS[status].label.toLowerCase()}` : ""}`,
      });
      return o;
    });
  } catch (err) {
    if (err.userFacing) return { error: err.message };
    throw err;
  }

  // the order is saved at this point: a message that fails to queue must never make it look like checkout failed
  // (the customer would order again and get a duplicate)
  const full = await getOrder("id", order.id);
  const quietly = (label, job) => job().catch((e) => console.error(`[orders] ${label} message failed`, { orderId: full.id, message: e?.message }));
  if (status === "pending") await quietly("order placed", () => sendOrderMessage("order_placed", full));
  else if (status === "confirmed") await quietly("order confirmed", () => sendOrderMessage("order_confirmed", full));
  if (channel === "website") await quietly("owner new order", () => sendOrderMessage("owner_new_order", full));
  // the order guard looks at every new order straight away (see lib/agents.js)
  await import("./agents").then((m) => m.onOrderPlaced(full.id)).catch((e) => console.error("[guard]", e));
  for (const l of quote.lines) {
    if (l.left <= l.threshold) {
      await quietly("low stock", () => notify("owner_low_stock", { vars: { product: l.name, size: l.size, stock: l.left, admin_url: `${siteUrl()}/admin/inventory` } }));
    }
  }
  sendSoon(10);
  // our own tracking number, from the moment the order is confirmed (see lib/labels.js)
  if (status !== "pending") await import("./labels").then((m) => m.ensureRefs([full.id])).catch((e) => console.error("[ref]", e));
  return { id: full.id, token: full.token, number: full.number };
}

/** Validates the name / phone / address part of an order. `relaxed` is for walk-in sales with no delivery. */
async function readCustomer(input, relaxed = false) {
  const settings = await getSettings();
  const customer = {
    name: String(input.name || "").trim() || (relaxed ? "Walk-in customer" : ""),
    phone: normalizePhone(input.phone, settings.store.country_code),
    email: String(input.email || "").trim().toLowerCase() || null,
    address: String(input.address || "").trim() || (relaxed ? "Collected in store" : ""),
    city: String(input.city || "").trim() || (relaxed ? "-" : ""),
    notes: String(input.notes || "").trim().slice(0, 500),
  };
  if (customer.name.length < 2) return { error: "Please enter the customer's full name." };
  if (relaxed && !customer.phone) customer.phone = "0";
  else if (customer.phone.length < 11 || customer.phone.length > 15) return { error: "Please enter a valid phone / WhatsApp number." };
  if (customer.email && !isEmail(customer.email)) return { error: "Please enter a valid email address, or leave it empty." };
  if (customer.address.length < 8 && !relaxed) return { error: "Please enter the complete delivery address." };
  if (customer.city.length < 2 && !relaxed) return { error: "Please enter the city." };
  return { customer };
}

/** Shop checkout. Returns { token } or { error }. */
export async function placeOrder(input) {
  const { customer, error } = await readCustomer(input);
  if (error) return { error: error.replace("the customer's", "your").replace("the complete", "your complete").replace("the city", "your city") };
  const settings = await getSettings();
  const quote = await quoteCart(input.items, input.coupon, { who: { phone: customer.phone, email: customer.email }, maxQty: Number(settings.orders.max_qty) || 0 });
  if (!quote.lines.length) return { error: "Your bag is empty." };
  if (quote.issues.length) return { error: quote.issues[0].message };
  if (quote.coupon?.error) return { error: quote.coupon.error };
  // unconfirmed orders hold stock: one number cannot keep piling them up (fake orders that block real buyers)
  const maxPending = Number(settings.orders.max_pending) || 0;
  if (maxPending > 0) {
    const [{ n }] = await query("SELECT count(*)::int AS n FROM orders WHERE phone = $1 AND status = 'pending' AND channel = 'website'", [customer.phone]);
    if (n >= maxPending) return { error: `You already have ${n} orders waiting for your confirmation. Please confirm or cancel them from their links first, or message us on WhatsApp.` };
  }
  const res = await createOrder({ customer, quote, channel: "website", status: "pending", optIn: input.optIn });
  if (res.error) return res;
  if (input.accountId && res.id) {
    // placed while signed in: it shows in the account; the account remembers the delivery details for next time
    await query("UPDATE orders SET account_id = $1 WHERE id = $2", [input.accountId, res.id]);
    await query("UPDATE contacts SET address = CASE WHEN address = '' THEN $2 ELSE address END, city = CASE WHEN city = '' THEN $3 ELSE city END, cart = '[]'::jsonb, cart_at = NULL WHERE id = $1",
      [input.accountId, customer.address, customer.city]);
  }
  // the checkout was finished, so there is nothing left to remind them about
  if (res.token) await query("DELETE FROM checkouts WHERE phone = $1", [customer.phone]);
  return res;
}

/**
 * An order typed in by staff. `input.mode`:
 *   "link"      -> pending; the customer gets the confirmation link
 *   "confirmed" -> the customer already said yes (chat or call)
 *   "handed"    -> walk-in sale, paid and taken away
 * Discount and delivery fee are whatever staff agreed with the customer.
 */
export async function createManualOrder(input, admin) {
  const channel = CHANNELS[input.channel] ? input.channel : "other";
  const handed = input.mode === "handed";
  const { customer, error } = await readCustomer(input, handed);
  if (error) return { error };

  const quote = await quoteCart(input.items, "");
  if (!quote.lines.length) return { error: "Add at least one item." };
  if (quote.issues.length) return { error: quote.issues[0].message };
  quote.discount = Math.min(quote.subtotal, Math.max(0, Math.floor(Number(input.discount) || 0)));
  quote.shipping = handed ? 0 : Math.max(0, Math.floor(Number(input.shipping ?? quote.shipping) || 0));
  quote.total = quote.subtotal - quote.discount + quote.shipping;

  return createOrder({
    customer, quote, channel, admin,
    status: handed ? "delivered" : input.mode === "confirmed" ? "confirmed" : "pending",
    assignedTo: Number(input.assignedTo) || admin.id,
    exchangeOf: Number(input.exchangeOf) || null,
  });
}

const STAMP = { confirmed: "confirmed_at", packed: "packed_at", shipped: "shipped_at", delivered: "delivered_at", returned: "returned_at", cancelled: "cancelled_at" };

/**
 * The single place an order changes status. `from` limits which current statuses may be
 * changed, so two people clicking at once cannot both win.
 * `returns` (for status "returned") maps order item id -> "restock" | "damaged".
 */
export async function setOrderStatus(id, status, { from, by = "admin", admin = null, reason = "", courier, tracking, silent = false, returns = {} } = {}) {
  const stamp = STAMP[status];
  if (!stamp) return { error: "Unknown status." };
  const allowed = from || Object.keys(ORDER_STATUS).filter((s) => s !== status);

  const changed = await tx(async (q) => {
    const [o] = await q(
      `UPDATE orders SET status = $2, ${stamp} = now(),
         confirmed_by = CASE WHEN $2::text = 'confirmed' THEN $4 ELSE confirmed_by END,
         cancel_reason = CASE WHEN $2::text IN ('cancelled', 'returned') THEN $5 ELSE cancel_reason END,
         courier = COALESCE($6, courier), tracking_number = COALESCE($7, tracking_number)
       WHERE id = $1 AND status = ANY($3::text[]) RETURNING id, number, stock_deducted`,
      [id, status, allowed, by, reason, courier ?? null, tracking ?? null]
    );
    if (!o) return null;
    const items = await q("SELECT id, variant_id, qty, name, size FROM order_items WHERE order_id = $1 AND variant_id IS NOT NULL", [o.id]);

    if (status === "cancelled") {
      for (const it of items) {
        if (o.stock_deducted) {
          await q("UPDATE variants SET stock = stock + $2 WHERE id = $1", [it.variant_id, it.qty]);
          await q("INSERT INTO stock_movements (variant_id, delta, qty, type, reason, order_id, admin_id) VALUES ($1,$2,$2,'cancel',$3,$4,$5)",
            [it.variant_id, it.qty, `Cancelled ${o.number}`, o.id, admin?.id || null]);
        } else {
          await q("UPDATE variants SET reserved = GREATEST(reserved - $2, 0) WHERE id = $1", [it.variant_id, it.qty]);
        }
      }
      await q("UPDATE orders SET stock_deducted = false WHERE id = $1", [o.id]);
    } else if (status === "returned") {
      for (const it of items) {
        const damaged = returns[it.id] === "damaged";
        if (!damaged) await q("UPDATE variants SET stock = stock + $2 WHERE id = $1", [it.variant_id, it.qty]);
        await q("INSERT INTO stock_movements (variant_id, delta, qty, type, reason, order_id, admin_id) VALUES ($1,$2,$3,$4,$5,$6,$7)",
          [it.variant_id, damaged ? 0 : it.qty, it.qty, damaged ? "damaged" : "return", `${damaged ? "Returned damaged" : "Returned"} ${o.number}`, o.id, admin?.id || null]);
      }
    } else if (!o.stock_deducted) {
      // first move past "pending": the reservation becomes a real deduction
      await deductStock(q, o, true, admin?.id || null);
    }

    await logEvent(q, o.id, {
      adminId: admin?.id, actor: admin?.name || by, type: "status",
      note: `Marked ${ORDER_STATUS[status].label.toLowerCase()}${reason ? `: ${reason}` : ""}${status === "shipped" && courier ? ` via ${courier}` : ""}`,
    });
    return o;
  });
  if (!changed) return { error: "This order can no longer be changed that way." };

  if (["confirmed", "packed", "shipped"].includes(status)) await import("./labels").then((m) => m.ensureRefs([Number(id)])).catch((e) => console.error("[ref]", e));
  // loyalty: points are earned on delivery and taken back when the parcel comes back (see lib/crm.js)
  if (status === "delivered") await awardPoints(id).catch((e) => console.error("[points]", e));
  if (status === "returned") await revokePoints(id).catch((e) => console.error("[points]", e));
  if (status === "returned") await notifyBackInStock((await query("SELECT variant_id FROM order_items WHERE order_id = $1 AND variant_id IS NOT NULL", [id])).map((r) => r.variant_id));
  // an exchange swapped at the door: delivering the new size also brings the old piece back (see lib/cases.js)
  await import("./cases").then((m) => m.onSwapOrderStatus(Number(id), status)).catch((e) => console.error("[swap]", e));
  if (!silent) {
    await sendOrderMessage(`order_${status}`, await getOrder("id", id));
    sendSoon(10);
  }
  return { ok: true };
}

/** Customer actions from their order link - only possible while the order is still pending. */
export async function customerConfirm(token) {
  const order = await getOrder("token", token);
  if (!order) return { error: "Order not found." };
  return setOrderStatus(order.id, "confirmed", { from: ["pending"], by: "customer" });
}

export async function customerCancel(token, { code = "", text = "" } = {}) {
  const order = await getOrder("token", token);
  if (!order) return { error: "Order not found." };
  const settings = await getSettings();
  // after confirming, cancelling is still possible inside the change window (Settings -> Orders), until it is packed
  const inWindow = Boolean(changeUntil(order, settings));
  const why = CANCEL_REASONS[code] ? `${CANCEL_REASONS[code]}${text && code === "other" ? `: ${String(text).slice(0, 160)}` : ""}` : "";
  const res = await setOrderStatus(order.id, "cancelled", {
    from: inWindow ? ["pending", "confirmed"] : ["pending"], by: "customer",
    reason: (order.status === "pending" ? "Cancelled by you before confirmation." : "Cancelled by you after confirming, within the change window.") + (why ? ` Reason: ${why}.` : ""),
  });
  if (res.error) return { error: "This order can no longer be cancelled from here: the change window has ended or it is being packed. Please message us on WhatsApp." };
  // the reason is kept for the Feedback analyst's weekly "why orders were cancelled" report
  if (CANCEL_REASONS[code]) await query("UPDATE orders SET cancel_code = $2 WHERE id = $1", [order.id, code]);
  return res;
}

/** Order guard: asks the customer of a risky, unconfirmed order to confirm it (WhatsApp / email) before it is packed. */
export async function askToConfirm(orderId) {
  const order = await getOrder("id", orderId);
  if (!order || order.status !== "pending") return { error: "Only an order waiting for confirmation can be asked to confirm." };
  await sendOrderMessage("confirm_reminder", order);
  sendSoon(5);
  return { ok: true };
}

/**
 * The assistant keeps an order the customer found too expensive: takes `percent` off it (once per order, only
 * when the owner switched the offer on in Admin -> Assistant, and never on top of another discount).
 */
export async function keepWithDiscount(token, percent) {
  const pct = Math.min(50, Math.max(0, Math.round(Number(percent) || 0)));
  if (!pct) return { error: "No offer is set up." };
  const order = await getOrder("token", token);
  if (!order) return { error: "Order not found." };
  const settings = await getSettings();
  if (!(order.status === "pending" || (order.status === "confirmed" && changeUntil(order, settings)))) return { error: "This order can no longer be changed." };
  if (order.discount > 0 || order.saved_by) return { error: "This order already has a discount." };
  const off = Math.round((order.subtotal * pct) / 100);
  const [done] = await query(
    `UPDATE orders SET discount = $2, total = subtotal - $2 + shipping, saved_by = 'discount'
     WHERE id = $1 AND discount = 0 AND saved_by IS NULL AND status IN ('pending', 'confirmed') RETURNING total`,
    [order.id, off]
  );
  if (!done) return { error: "This order already has a discount." };
  await tx(async (q) => logEvent(q, order.id, { actor: "assistant", type: "note", note: `Kept by the assistant: ${pct}% off (${off}) instead of cancelling (too expensive)` }));
  // the customer gets the updated summary with the new total
  const updated = await getOrder("id", order.id);
  await notify("order_changed", { email: updated.email, phone: updated.phone === "0" ? null : updated.phone, contactId: updated.contact_id, orderId: updated.id, vars: orderVars(updated, updated.items, settings) })
    .catch((e) => console.error("[orders] keep-discount message failed", e?.message));
  sendSoon(5);
  return { ok: true, off, total: done.total };
}

/**
 * The customer changes a confirmed order inside the change window: another size of the same piece, a different
 * quantity, removing a piece, or the delivery details. `input` = { items: [{ id, variantId, qty }], address, city, notes }.
 * Stock moves straight away (the old size goes back, the new one is taken); prices stay as they were agreed.
 */
export async function customerChange(token, input, { allowPending = false, savedBy = null } = {}) {
  const order = await getOrder("token", token);
  if (!order) return { error: "Order not found." };
  const settings = await getSettings();
  // the chat may also swap a size on an order not confirmed yet (its pieces are only reserved)
  const pendingOk = allowPending && order.status === "pending";
  if (!pendingOk && !changeUntil(order, settings)) return { error: "This order can no longer be changed here: the change window has ended or it is being packed. Please message us on WhatsApp." };
  const held = order.stock_deducted; // true: the pieces were taken from stock; false: only reserved
  const maxQty = Number(settings.orders.max_qty) || 0;

  const wanted = new Map((Array.isArray(input?.items) ? input.items : []).map((i) => [Number(i.id), { variantId: Number(i.variantId), qty: Math.max(0, Math.floor(Number(i.qty) || 0)) }]));
  const plan = [];
  for (const it of order.items) {
    const w = wanted.get(it.id) || { variantId: it.variant_id, qty: it.qty };
    if (maxQty > 0 && w.qty > maxQty) return { error: `You can order up to ${maxQty} of ${it.name} at a time.` };
    plan.push({ it, variantId: w.variantId || it.variant_id, qty: w.qty });
  }
  if (!plan.some((p) => p.qty > 0)) return { error: "To remove everything, cancel the order instead." };

  // delivery details: optional, checked like at checkout
  const address = input?.address != null ? String(input.address).trim().slice(0, 300) : order.address;
  const city = input?.city != null ? String(input.city).trim().slice(0, 80) : order.city;
  const notes = input?.notes != null ? String(input.notes).trim().slice(0, 500) : order.notes;
  if (address.length < 8) return { error: "Please enter your complete delivery address." };
  if (city.length < 2) return { error: "Please enter your city." };

  const changes = [];
  try {
    await tx(async (q) => {
      // the order may have been packed (or cancelled) a moment ago: only a still-confirmed order is changed
      const [still] = await q("SELECT id FROM orders WHERE id = $1 AND status = ANY($2::text[]) FOR UPDATE", [order.id, pendingOk ? ["pending"] : ["confirmed"]]);
      if (!still) throw Object.assign(new Error("This order is already being packed, so it can no longer be changed."), { userFacing: true });
      for (const { it, variantId, qty } of plan) {
        const sameSize = variantId === it.variant_id;
        if (sameSize && qty === it.qty) continue;
        let size = it.size;
        if (!sameSize) {
          const [v] = await q("SELECT v.id, v.size, v.color, v.product_id, p.status FROM variants v JOIN products p ON p.id = v.product_id WHERE v.id = $1", [variantId]);
          if (!v || v.product_id !== it.product_id || v.status !== "active") throw Object.assign(new Error(`That size of ${it.name} is not available.`), { userFacing: true });
          size = variantLabel(v);
        }
        // give back what was taken, then take what is wanted now (only if it is there)
        if (held) {
          if (it.variant_id) await q("UPDATE variants SET stock = stock + $2 WHERE id = $1", [it.variant_id, it.qty]);
          if (qty > 0) {
            const [ok] = await q("UPDATE variants SET stock = stock - $2 WHERE id = $1 AND stock - reserved >= $2 RETURNING id", [variantId, qty]);
            if (!ok) throw Object.assign(new Error(`Only fewer than ${qty} of ${it.name} (${size}) are left. Choose fewer or another size.`), { userFacing: true });
          }
          const reason = `Customer changed ${order.number}`;
          if (it.variant_id) await q("INSERT INTO stock_movements (variant_id, delta, qty, type, reason, order_id) VALUES ($1,$2,$2,'cancel',$3,$4)", [it.variant_id, it.qty, reason, order.id]);
          if (qty > 0) await q("INSERT INTO stock_movements (variant_id, delta, qty, type, reason, order_id) VALUES ($1,$2,$3,'sale',$4,$5)", [variantId, -qty, qty, reason, order.id]);
        } else {
          // not confirmed yet: move the reservation, nothing leaves stock
          if (it.variant_id) await q("UPDATE variants SET reserved = GREATEST(reserved - $2, 0) WHERE id = $1", [it.variant_id, it.qty]);
          if (qty > 0) {
            const [ok] = await q("UPDATE variants SET reserved = reserved + $2 WHERE id = $1 AND stock - reserved >= $2 RETURNING id", [variantId, qty]);
            if (!ok) throw Object.assign(new Error(`Only fewer than ${qty} of ${it.name} (${size}) are left. Choose fewer or another size.`), { userFacing: true });
          }
        }
        if (qty === 0) {
          await q("DELETE FROM order_items WHERE id = $1", [it.id]);
          changes.push(`removed ${it.name} (${it.size})`);
        } else {
          await q("UPDATE order_items SET variant_id = $2, size = $3, qty = $4 WHERE id = $1", [it.id, variantId, size, qty]);
          changes.push(sameSize ? `${it.name} (${it.size}): ${it.qty} -> ${qty}` : `${it.name}: size ${it.size} -> ${size}${qty !== it.qty ? `, ${it.qty} -> ${qty}` : ""}`);
        }
      }
      if (address !== order.address || city !== order.city) changes.push("new delivery address");
      if (notes !== order.notes) changes.push("new note");
      if (!changes.length) return;

      // totals again: the agreed prices, the code's discount, delivery as the shop charges it today
      const items = await q("SELECT unit_price, qty FROM order_items WHERE order_id = $1", [order.id]);
      const subtotal = items.reduce((s, i) => s + i.unit_price * i.qty, 0);
      let discount = Math.min(order.discount, subtotal);
      if (order.coupon_code) {
        const [c] = await q("SELECT type, value FROM coupons WHERE code = $1", [order.coupon_code]);
        if (c?.type === "percent") discount = Math.round((subtotal * c.value) / 100);
      }
      const { fee, free_over } = settings.shipping;
      const shipping = order.exchange_of ? order.shipping : free_over > 0 && subtotal - discount >= free_over ? 0 : Number(fee) || 0;
      await q(
        "UPDATE orders SET subtotal = $2, discount = $3, shipping = $4, total = $5, address = $6, city = $7, notes = $8 WHERE id = $1",
        [order.id, subtotal, discount, shipping, subtotal - discount + shipping, address, city, notes]
      );
      await logEvent(q, order.id, { actor: "customer", type: "note", note: `Changed by the customer${savedBy ? " (in the chat, instead of cancelling)" : ""}: ${changes.join("; ")}` });
      if (savedBy) await q("UPDATE orders SET saved_by = COALESCE(saved_by, $2) WHERE id = $1", [order.id, savedBy]);
    });
  } catch (err) {
    if (err.userFacing) return { error: err.message };
    throw err;
  }
  if (!changes.length) return { ok: true, unchanged: true };

  const updated = await getOrder("id", order.id);
  const vars = orderVars(updated, updated.items, settings);
  await notify("order_changed", { email: updated.email, phone: updated.phone === "0" ? null : updated.phone, contactId: updated.contact_id, orderId: updated.id, vars });
  await notify("owner_order_changed", { vars: { ...vars, change: changes.map((c) => `• ${c}`).join("\n") } });
  sendSoon(10);
  return { ok: true, changes };
}

/**
 * The customer adds a piece to their order in the chat, before it is packed (unconfirmed, or confirmed inside the
 * change window). Today's price (with any sale); the stock is taken (or reserved, if unconfirmed) at once; delivery
 * and the code's discount are worked out again. Returns { ok, total } or { error }.
 */
export async function addToOrder(token, { variantId, qty = 1 }) {
  const order = await getOrder("token", token);
  if (!order) return { error: "Order not found." };
  const settings = await getSettings();
  if (!(order.status === "pending" || (order.status === "confirmed" && changeUntil(order, settings)))) {
    return { error: "This order is already being packed, so nothing can be added to it now." };
  }
  const n = Math.max(1, Math.min(Number(settings.orders.max_qty) || 20, Math.floor(Number(qty) || 1)));
  const quote = await quoteCart([{ variantId, qty: n }], "");
  const line = quote.lines[0];
  if (!line) return { error: "That piece is not available any more." };
  if (line.stock < n) return { error: line.stock ? `Only ${line.stock} of ${line.name} (${line.size}) left.` : `${line.name} (${line.size}) just sold out.` };
  if (order.items.some((i) => i.variant_id === line.variantId)) return { error: `${line.name} (${line.size}) is already in this order: change its quantity instead.` };
  let total = 0;
  try {
    await tx(async (q) => {
      const [still] = await q("SELECT id, stock_deducted FROM orders WHERE id = $1 AND status = ANY($2::text[]) FOR UPDATE", [order.id, ["pending", "confirmed"]]);
      if (!still) throw Object.assign(new Error("This order is already being packed, so nothing can be added to it now."), { userFacing: true });
      const [ok] = await q(
        still.stock_deducted
          ? "UPDATE variants SET stock = stock - $2 WHERE id = $1 AND stock - reserved >= $2 RETURNING id"
          : "UPDATE variants SET reserved = reserved + $2 WHERE id = $1 AND stock - reserved >= $2 RETURNING id",
        [line.variantId, n]);
      if (!ok) throw Object.assign(new Error(`${line.name} (${line.size}) just sold out.`), { userFacing: true });
      if (still.stock_deducted) {
        await q("INSERT INTO stock_movements (variant_id, delta, qty, type, reason, order_id) VALUES ($1,$2,$3,'sale',$4,$5)", [line.variantId, -n, n, `Customer added to ${order.number}`, order.id]);
      }
      await q(
        "INSERT INTO order_items (order_id, product_id, variant_id, name, size, image_url, unit_price, qty, was_price) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
        [order.id, line.productId, line.variantId, line.name, line.size, line.image, line.price, n, line.was || null]);
      const items = await q("SELECT unit_price, qty FROM order_items WHERE order_id = $1", [order.id]);
      const subtotal = items.reduce((sum, i) => sum + i.unit_price * i.qty, 0);
      let discount = Math.min(order.discount, subtotal);
      if (order.coupon_code) {
        const [c] = await q("SELECT type, value FROM coupons WHERE code = $1", [order.coupon_code]);
        if (c?.type === "percent") discount = Math.round((subtotal * c.value) / 100);
      }
      const { fee, free_over } = settings.shipping;
      const shipping = order.exchange_of ? order.shipping : free_over > 0 && subtotal - discount >= free_over ? 0 : Number(fee) || 0;
      total = subtotal - discount + shipping;
      await q("UPDATE orders SET subtotal = $2, discount = $3, shipping = $4, total = $5 WHERE id = $1", [order.id, subtotal, discount, shipping, total]);
      await logEvent(q, order.id, { actor: "customer", type: "note", note: `Added by the customer in the chat: ${line.name} (${line.size}) × ${n}` });
    });
  } catch (err) {
    if (err.userFacing) return { error: err.message };
    throw err;
  }
  const updated = await getOrder("id", order.id);
  const vars = orderVars(updated, updated.items, settings);
  await notify("order_changed", { email: updated.email, phone: updated.phone === "0" ? null : updated.phone, contactId: updated.contact_id, orderId: updated.id, vars }).catch(() => {});
  await notify("owner_order_changed", { vars: { ...vars, change: `• added ${line.name} (${line.size}) × ${n}` } }).catch(() => {});
  sendSoon(10);
  return { ok: true, total, name: line.name, size: line.size, price: line.price };
}

/** Hand an order to a staff member (or to nobody) and tell them by email. */
export async function assignOrder(orderId, staffId, admin) {
  const [staff] = staffId ? await query("SELECT id, name, email FROM admins WHERE id = $1 AND is_active", [staffId]) : [null];
  const [order] = await query("UPDATE orders SET assigned_to = $2 WHERE id = $1 RETURNING id, number, customer_name, total", [orderId, staff?.id || null]);
  if (!order) return { error: "Order not found." };
  await logEvent(query, order.id, { adminId: admin.id, actor: admin.name, type: "assigned", note: staff ? `Assigned to ${staff.name || staff.email}` : "Unassigned" });
  if (staff && staff.id !== admin.id) {
    await notify("staff_assigned", { email: staff.email, orderId: order.id, vars: { name: staff.name || "there", order_number: order.number, customer: order.customer_name, by: admin.name || "the owner", admin_url: `${siteUrl()}/admin/orders/${order.id}` } });
    sendSoon(5);
  }
  return { ok: true };
}

export async function addOrderNote(orderId, note, admin) {
  if (!note.trim()) return;
  await logEvent(query, orderId, { adminId: admin.id, actor: admin.name, type: "note", note: note.trim().slice(0, 500) });
}

/**
 * Other open orders from the same phone that contain at least one of the same items and were
 * placed close together - usually the same person ordering twice (website + WhatsApp, double tap...).
 * Pass an order id, or { phone, variantIds } to check before saving a new one.
 */
export async function findDuplicates(target) {
  const { orders } = await getSettings();
  if (typeof target === "number") {
    return query(
      `SELECT o2.id, o2.number, o2.status, o2.channel, o2.created_at, o2.total
       FROM orders o JOIN orders o2 ON o2.phone = o.phone AND o2.id <> o.id
       WHERE o.id = $1 AND o.phone <> '0' AND o2.status IN ('pending', 'confirmed', 'packed')
         AND abs(extract(epoch FROM o2.created_at - o.created_at)) < $2::int * 3600
         AND EXISTS (SELECT 1 FROM order_items a JOIN order_items b ON a.variant_id = b.variant_id WHERE a.order_id = o.id AND b.order_id = o2.id)
       ORDER BY o2.id`,
      [target, orders.duplicate_hours]
    );
  }
  if (!target.phone || target.phone === "0" || !target.variantIds?.length) return [];
  return query(
    `SELECT o.id, o.number, o.status, o.channel, o.created_at, o.total FROM orders o
     WHERE o.phone = $1 AND o.status IN ('pending', 'confirmed', 'packed') AND o.created_at > now() - make_interval(hours => $3::int)
       AND EXISTS (SELECT 1 FROM order_items i WHERE i.order_id = o.id AND i.variant_id = ANY($2::int[]))
     ORDER BY o.id`,
    [target.phone, target.variantIds, orders.duplicate_hours]
  );
}

/** Tell people who asked to be notified once a size is available again. */
export async function notifyBackInStock(variantIds) {
  if (!variantIds.length) return;
  const alerts = await query(
    `SELECT a.id, a.email, a.phone, v.size, v.color, p.name, p.slug
     FROM stock_alerts a JOIN variants v ON v.id = a.variant_id JOIN products p ON p.id = v.product_id
     WHERE a.notified_at IS NULL AND v.stock - v.reserved > 0 AND p.status = 'active' AND a.variant_id = ANY($1::int[])`,
    [variantIds]
  );
  for (const a of alerts) {
    await notify("back_in_stock", { email: a.email, phone: a.phone, vars: { product: a.name, size: variantLabel(a), url: `${siteUrl()}/products/${a.slug}` } });
  }
  if (alerts.length) await query("UPDATE stock_alerts SET notified_at = now() WHERE id = ANY($1::int[])", [alerts.map((a) => a.id)]);
}

/**
 * What needs someone's attention right now, for the bell in the admin top bar.
 * Worked out fresh on every page load, so there is nothing to keep in sync.
 */
export async function getAlerts(admin) {
  const { orders, returns } = await getSettings();
  const [c] = await query(
    `SELECT
      (SELECT count(*)::int FROM orders WHERE status = 'pending' AND channel <> 'store' AND created_at < now() - make_interval(hours => $1::int)) AS unconfirmed,
      (SELECT count(*)::int FROM orders WHERE status IN ('confirmed', 'packed') AND COALESCE(packed_at, confirmed_at) < now() - make_interval(hours => $2::int)) AS undispatched,
      (SELECT count(*)::int FROM orders WHERE status = 'shipped' AND shipped_at < now() - make_interval(days => $3::int)) AS undelivered,
      (SELECT count(*)::int FROM orders WHERE assigned_to = $4 AND status IN ('pending', 'confirmed', 'packed')) AS mine,
      (SELECT count(*)::int FROM orders WHERE assigned_to IS NULL AND status IN ('pending', 'confirmed', 'packed')) AS unassigned,
      (SELECT count(DISTINCT o.id)::int FROM orders o JOIN orders o2 ON o2.phone = o.phone AND o2.id <> o.id AND o2.status IN ('pending', 'confirmed', 'packed')
        WHERE o.status IN ('pending', 'confirmed', 'packed') AND o.phone <> '0'
          AND abs(extract(epoch FROM o2.created_at - o.created_at)) < $5::int * 3600
          AND EXISTS (SELECT 1 FROM order_items a JOIN order_items b ON a.variant_id = b.variant_id WHERE a.order_id = o.id AND b.order_id = o2.id)) AS duplicates,
      (SELECT count(*)::int FROM variants v JOIN products p ON p.id = v.product_id WHERE p.status = 'active' AND v.stock - v.reserved <= p.low_stock_threshold) AS low,
      (SELECT count(*)::int FROM contact_messages WHERE NOT is_read) AS inbox,
      (SELECT count(*)::int FROM conversations WHERE status = 'human' AND unread > 0) AS chats,
      (SELECT count(*)::int FROM messages WHERE status = 'manual') AS whatsapp,
      (SELECT count(*)::int FROM agent_tasks WHERE status = 'open' AND severity = 'bad') AS agents_bad,
      (SELECT count(*)::int FROM cases WHERE status = 'requested') AS cases_new,
      (SELECT count(*)::int FROM cases WHERE status = 'received') AS cases_settle,
      (SELECT count(*)::int FROM cases WHERE status = 'approved' AND type <> 'complaint') AS cases_pickup,
      (SELECT count(*)::int FROM cases WHERE type = 'complaint' AND status = ANY(ARRAY['requested','approved']) AND created_at < now() - make_interval(hours => $6::int)) AS complaints_late`,
    [Math.max(1, orders.reminder_hours || 12), orders.pack_hours, orders.deliver_days, admin.id, orders.duplicate_hours, Math.max(1, returns.complaint_hours || 48)]
  );
  const list = [
    { key: "chats", perm: "support", n: c.chats, label: "customer chats waiting for a person", href: "/admin/inbox", tone: "bad" },
    { key: "mine", perm: "orders", n: c.mine, label: "open orders assigned to you", href: "/admin/orders?mine=1", tone: "info" },
    { key: "duplicates", perm: "orders", n: c.duplicates, label: "possible duplicate orders", href: "/admin/orders?flag=duplicates", tone: "bad" },
    { key: "undispatched", perm: "orders", n: c.undispatched, label: `confirmed over ${orders.pack_hours}h ago, not dispatched`, href: "/admin/orders?flag=undispatched", tone: "bad" },
    { key: "unconfirmed", perm: "orders", n: c.unconfirmed, label: "orders the customer has not confirmed", href: "/admin/orders?status=pending", tone: "warn" },
    { key: "undelivered", perm: "orders", n: c.undelivered, label: `dispatched over ${orders.deliver_days} days ago, not delivered`, href: "/admin/orders?flag=undelivered", tone: "warn" },
    { key: "unassigned", perm: "orders", n: c.unassigned, label: "open orders with nobody assigned", href: "/admin/orders?flag=unassigned", tone: "warn" },
    { key: "agents_bad", perm: "agents", n: c.agents_bad, label: "urgent agent suggestions (risky orders, sold-out sizes)", href: "/admin/agents", tone: "bad" },
    { key: "complaints_late", perm: "returns", n: c.complaints_late, label: `complaints open over ${returns.complaint_hours}h`, href: "/admin/returns?type=complaint", tone: "bad" },
    { key: "cases_new", perm: "returns", n: c.cases_new, label: "return, exchange or complaint requests to review", href: "/admin/returns", tone: "warn" },
    { key: "cases_pickup", perm: "returns", n: c.cases_pickup, label: "approved returns waiting for a pickup to be arranged", href: "/admin/returns?view=pickup", tone: "warn" },
    { key: "cases_settle", perm: "returns", n: c.cases_settle, label: "collected returns to settle", href: "/admin/returns?view=settle", tone: "warn" },
    { key: "low", perm: "inventory", n: c.low, label: "sizes low or sold out", href: "/admin/inventory", tone: "warn" },
    { key: "whatsapp", perm: "marketing", n: c.whatsapp, label: "WhatsApp messages waiting to be sent", href: "/admin/messages", tone: "info" },
    { key: "inbox", perm: "marketing", n: c.inbox, label: "unread customer messages", href: "/admin/messages?tab=inbox", tone: "info" },
  ];
  return list.filter((a) => a.n > 0);
}

/**
 * Housekeeping that should happen without anyone clicking:
 * confirmation reminders, releasing stale orders (and their reserved stock), sending queued messages.
 * Called by the daily cron and whenever someone opens the dashboard.
 */
export async function runAutomations({ budgetMs = 50_000 } = {}) {
  // the platform stops a run after a minute: work in small batches and leave the rest for the next run
  const deadline = Date.now() + budgetMs;
  const settings = await getSettings();
  const { reminder_hours, auto_cancel_hours } = settings.orders;
  const out = { reminders: 0, cancelled: 0 };

  await query("UPDATE messages SET status = 'queued' WHERE status = 'sending' AND created_at < now() - interval '10 minutes'");

  if (auto_cancel_hours > 0) {
    const stale = await query("SELECT id FROM orders WHERE status = 'pending' AND created_at < now() - make_interval(hours => $1::int)", [auto_cancel_hours]);
    for (const o of stale) {
      const res = await setOrderStatus(o.id, "cancelled", { from: ["pending"], by: "system", reason: `It was not confirmed within ${auto_cancel_hours} hours.` });
      if (res.ok) out.cancelled++;
    }
  }

  if (reminder_hours > 0) {
    const due = await query(
      `UPDATE orders SET reminder_sent_at = now()
       WHERE status = 'pending' AND reminder_sent_at IS NULL AND created_at < now() - make_interval(hours => $1::int) RETURNING id`,
      [reminder_hours]
    );
    for (const o of due) {
      await sendOrderMessage("confirm_reminder", await getOrder("id", o.id));
      out.reminders++;
    }
  }

  // unfinished bags: reminders only for people who agreed, and only for pieces that can still be bought.
  //   1. the first reminder, after cart_hours, with an optional one-time code (Admin -> Assistant: cart_discount)
  //   2. a last one a day later (cart_second), only if they still have not ordered
  //   3. signed-in customers who agreed: their bag kept on the account, even if they never reached checkout
  const cartHours = settings.assistant.cart_hours;
  out.cart_reminders = 0;
  if (cartHours > 0) {
    const { personalCode } = await import("./crm");
    const pct = Math.min(50, Number(settings.assistant.cart_discount) || 0);
    const codeHours = Math.max(1, Number(settings.assistant.cart_code_hours) || 48);
    const url = `${siteUrl()}/checkout`;
    const inStock = async (items) => {
      const ids = items.map((i) => Number(i.variantId)).filter(Boolean);
      if (!ids.length) return [];
      const live = await query(
        `SELECT v.id, v.size, v.color, p.name, v.stock - v.reserved AS available FROM variants v JOIN products p ON p.id = v.product_id
         WHERE p.status = 'active' AND v.id = ANY($1::int[])`, [ids]);
      return items.map((i) => ({ i, v: live.find((x) => x.id === Number(i.variantId)) })).filter(({ i, v }) => v && v.available >= (i.qty || 1))
        .map(({ i, v }) => ({ name: i.name || v.name, size: i.size || variantLabel(v), qty: i.qty || 1 }));
    };
    const itemsText = (lines) => lines.map((l) => `• ${l.name} (${l.size}) × ${l.qty}`).join("\n") + "\n";
    const offer = async (contactId, existing, last = false) => {
      if (!pct || !contactId) return { code: existing || null, line: "" };
      const code = existing || (await personalCode(contactId, { prefix: "BAG", value: pct, hours: codeHours, note: "Bag reminder", type: "percent" }));
      return { code, line: last ? `Your ${pct}% code ${code} still works, but not for long.\n` : `Finish it in the next ${codeHours} hours and take ${pct}% off with code ${code}.\n` };
    };

    // claims up to 50 rows at a time while there is time left; each batch is handled before the next is claimed
    const batches = async (claim, handle) => {
      while (Date.now() < deadline - 8000) {
        const rows = await claim();
        if (!rows.length) return;
        for (const row of rows) await handle(row);
      }
      out.cart_more = true; // some left for the next run
    };

    await batches(() => query(
      `UPDATE checkouts SET reminded_at = now() WHERE id IN (
         SELECT c.id FROM checkouts c
         WHERE c.reminded_at IS NULL AND c.updated_at < now() - make_interval(hours => $1::int) AND c.updated_at > now() - interval '7 days'
           AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.phone = c.phone AND o.created_at > c.created_at)
         ORDER BY c.id LIMIT 50 FOR UPDATE SKIP LOCKED)
       RETURNING *`,
      [cartHours]
    ), async (c) => {
      const lines = await inStock(c.items);
      if (!lines.length) return;
      const contact = await upsertContact({ name: c.name, email: c.email, phone: c.phone, source: "checkout" });
      const o = await offer(contact?.id);
      if (o.code) await query("UPDATE checkouts SET code = $2 WHERE id = $1", [c.id, o.code]);
      await notify("cart_reminder", { email: c.email, phone: c.phone, contactId: contact?.id, vars: { name: c.name.split(" ")[0] || "there", items: itemsText(lines), offer: o.line, url } });
      out.cart_reminders++;
    });

    if (settings.assistant.cart_second) {
      await batches(() => query(
        `UPDATE checkouts SET reminded2_at = now() WHERE id IN (
           SELECT c.id FROM checkouts c
           WHERE c.reminded_at < now() - interval '24 hours' AND c.reminded2_at IS NULL AND c.updated_at > now() - interval '7 days'
             AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.phone = c.phone AND o.created_at > c.created_at)
           ORDER BY c.id LIMIT 50 FOR UPDATE SKIP LOCKED)
         RETURNING *`
      ), async (c) => {
        const lines = await inStock(c.items);
        if (!lines.length) return;
        const [contact] = await query("SELECT id FROM contacts WHERE phone = $1 ORDER BY id LIMIT 1", [c.phone]);
        const [valid] = c.code ? await query("SELECT 1 FROM coupons WHERE code = $1 AND used_count = 0 AND (ends_at IS NULL OR ends_at > now())", [c.code]) : [];
        const o = valid ? await offer(contact?.id, c.code, true) : { line: "" };
        await notify("cart_reminder_last", { email: c.email, phone: c.phone, contactId: contact?.id, vars: { name: c.name.split(" ")[0] || "there", items: itemsText(lines), offer: o.line, url } });
        out.cart_reminders++;
      });
    }

    // signed-in customers who agreed to reminders, with a bag on their account (and no checkout reminder already)
    await batches(() => query(
      `UPDATE contacts SET cart_reminded_at = now() WHERE id IN (
         SELECT c.id FROM contacts c
         WHERE c.password_hash IS NOT NULL AND c.remind_ok AND jsonb_array_length(c.cart) > 0
           AND c.cart_at < now() - make_interval(hours => $1::int) AND c.cart_at > now() - interval '7 days'
           AND (c.cart_reminded_at IS NULL OR c.cart_reminded_at < c.cart_at)
           AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.phone = c.phone AND o.created_at > c.cart_at)
           AND NOT EXISTS (SELECT 1 FROM checkouts k WHERE k.phone = c.phone AND k.reminded_at > now() - interval '7 days')
         ORDER BY c.id LIMIT 50 FOR UPDATE SKIP LOCKED)
       RETURNING *`,
      [cartHours]
    ), async (c) => {
      const lines = await inStock(c.cart);
      if (!lines.length) return;
      const o = await offer(c.id);
      await notify("cart_reminder", {
        email: c.email_opt_in ? c.email : null, phone: c.whatsapp_opt_in ? c.phone : null, contactId: c.id,
        vars: { name: (c.name || "").split(" ")[0] || "there", items: itemsText(lines), offer: o.line, url },
      });
      out.cart_reminders++;
    });
  }

  // the agents: morning briefing, order guard, restock warnings (each runs only when due)
  out.agents = await import("./agents").then((m) => m.runAgents()).catch((e) => { console.error("[agents]", e); return {}; });

  // loyalty follow-ups: feedback requests after delivery and come-back reminders for subscribers
  Object.assign(out, await runRetention().catch((e) => { console.error("[retention]", e); return {}; }));

  return { ...out, ...(await drainQueue(deadline)) };
}
