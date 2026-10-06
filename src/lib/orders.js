import "server-only";
import crypto from "node:crypto";
import { query, tx } from "./db";
import { getSettings, siteUrl } from "./settings";
import { getActiveSales, applyPricing } from "./catalog";
import { upsertContact } from "./contacts";
import { notify, orderVars, processQueue, EVENTS } from "./notify";
import { normalizePhone, isEmail, variantLabel, CHANNELS, ORDER_STATUS } from "./format";

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
export async function quoteCart(items, couponCode) {
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
    if (r.stock < qty) {
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

export async function getOrder(where, value) {
  const col = { id: "id", token: "token", number: "number" }[where];
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
          "INSERT INTO order_items (order_id, product_id, variant_id, name, size, image_url, unit_price, qty) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
          [o.id, l.productId, l.variantId, l.name, l.size, l.image, l.price, l.qty]
        );
        if (deductNow) {
          await q(
            "INSERT INTO stock_movements (variant_id, delta, qty, type, reason, order_id, admin_id) VALUES ($1,$2,$3,'sale',$4,$5,$6)",
            [l.variantId, -l.qty, l.qty, `Order ${number}`, o.id, admin?.id || null]
          );
        }
      }
      if (quote.coupon?.id) await q("UPDATE coupons SET used_count = used_count + 1 WHERE id = $1", [quote.coupon.id]);
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

  const full = await getOrder("id", order.id);
  if (status === "pending") await sendOrderMessage("order_placed", full);
  else if (status === "confirmed") await sendOrderMessage("order_confirmed", full);
  if (channel === "website") await sendOrderMessage("owner_new_order", full);
  for (const l of quote.lines) {
    if (l.left <= l.threshold) {
      await notify("owner_low_stock", { vars: { product: l.name, size: l.size, stock: l.left, admin_url: `${siteUrl()}/admin/inventory` } });
    }
  }
  await processQueue(10).catch((e) => console.error("[notify]", e));
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
  const quote = await quoteCart(input.items, input.coupon);
  if (!quote.lines.length) return { error: "Your bag is empty." };
  if (quote.issues.length) return { error: quote.issues[0].message };
  if (quote.coupon?.error) return { error: quote.coupon.error };
  const res = await createOrder({ customer, quote, channel: "website", status: "pending", optIn: input.optIn });
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

  if (status === "returned") await notifyBackInStock((await query("SELECT variant_id FROM order_items WHERE order_id = $1 AND variant_id IS NOT NULL", [id])).map((r) => r.variant_id));
  if (!silent) {
    await sendOrderMessage(`order_${status}`, await getOrder("id", id));
    await processQueue(10).catch((e) => console.error("[notify]", e));
  }
  return { ok: true };
}

/** Customer actions from their order link - only possible while the order is still pending. */
export async function customerConfirm(token) {
  const order = await getOrder("token", token);
  if (!order) return { error: "Order not found." };
  return setOrderStatus(order.id, "confirmed", { from: ["pending"], by: "customer" });
}

export async function customerCancel(token) {
  const order = await getOrder("token", token);
  if (!order) return { error: "Order not found." };
  const res = await setOrderStatus(order.id, "cancelled", { from: ["pending"], by: "customer", reason: "Cancelled by you before confirmation." });
  return res.error ? { error: "A confirmed order can no longer be cancelled. Please contact us." } : res;
}

/** Hand an order to a staff member (or to nobody) and tell them by email. */
export async function assignOrder(orderId, staffId, admin) {
  const [staff] = staffId ? await query("SELECT id, name, email FROM admins WHERE id = $1 AND is_active", [staffId]) : [null];
  const [order] = await query("UPDATE orders SET assigned_to = $2 WHERE id = $1 RETURNING id, number, customer_name, total", [orderId, staff?.id || null]);
  if (!order) return { error: "Order not found." };
  await logEvent(query, order.id, { adminId: admin.id, actor: admin.name, type: "assigned", note: staff ? `Assigned to ${staff.name || staff.email}` : "Unassigned" });
  if (staff && staff.id !== admin.id) {
    await notify("staff_assigned", { email: staff.email, orderId: order.id, vars: { name: staff.name || "there", order_number: order.number, customer: order.customer_name, by: admin.name || "the owner", admin_url: `${siteUrl()}/admin/orders/${order.id}` } });
    await processQueue(5).catch(() => {});
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
  const { orders } = await getSettings();
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
      (SELECT count(*)::int FROM messages WHERE status = 'manual') AS whatsapp`,
    [Math.max(1, orders.reminder_hours || 12), orders.pack_hours, orders.deliver_days, admin.id, orders.duplicate_hours]
  );
  const list = [
    { key: "chats", perm: "support", n: c.chats, label: "customer chats waiting for a person", href: "/admin/inbox", tone: "bad" },
    { key: "mine", perm: "orders", n: c.mine, label: "open orders assigned to you", href: "/admin/orders?mine=1", tone: "info" },
    { key: "duplicates", perm: "orders", n: c.duplicates, label: "possible duplicate orders", href: "/admin/orders?flag=duplicates", tone: "bad" },
    { key: "undispatched", perm: "orders", n: c.undispatched, label: `confirmed over ${orders.pack_hours}h ago, not dispatched`, href: "/admin/orders?flag=undispatched", tone: "bad" },
    { key: "unconfirmed", perm: "orders", n: c.unconfirmed, label: "orders the customer has not confirmed", href: "/admin/orders?status=pending", tone: "warn" },
    { key: "undelivered", perm: "orders", n: c.undelivered, label: `dispatched over ${orders.deliver_days} days ago, not delivered`, href: "/admin/orders?flag=undelivered", tone: "warn" },
    { key: "unassigned", perm: "orders", n: c.unassigned, label: "open orders with nobody assigned", href: "/admin/orders?flag=unassigned", tone: "warn" },
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
export async function runAutomations() {
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

  // unfinished checkouts: one reminder, only for people who agreed, and only for items that can still be bought
  const cartHours = settings.assistant.cart_hours;
  out.cart_reminders = 0;
  if (cartHours > 0) {
    const carts = await query(
      `UPDATE checkouts c SET reminded_at = now()
       WHERE c.reminded_at IS NULL AND c.updated_at < now() - make_interval(hours => $1::int) AND c.updated_at > now() - interval '7 days'
         AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.phone = c.phone AND o.created_at > c.created_at)
       RETURNING *`,
      [cartHours]
    );
    for (const c of carts) {
      const ids = c.items.map((i) => i.variantId);
      const live = await query("SELECT v.id, v.stock - v.reserved AS available FROM variants v JOIN products p ON p.id = v.product_id WHERE p.status = 'active' AND v.id = ANY($1::int[])", [ids]);
      const lines = c.items.filter((i) => (live.find((v) => v.id === i.variantId)?.available || 0) >= i.qty);
      if (!lines.length) continue;
      await notify("cart_reminder", {
        email: c.email, phone: c.phone,
        vars: { name: c.name.split(" ")[0] || "there", items: lines.map((i) => `• ${i.name} (${i.size}) × ${i.qty}`).join("\n") + "\n", url: `${siteUrl()}/checkout` },
      });
      out.cart_reminders++;
    }
  }

  return { ...out, ...(await processQueue(40)) };
}
