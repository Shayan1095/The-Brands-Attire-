import "server-only";
import crypto from "node:crypto";
import { query } from "./db";
import { getSettings, siteUrl } from "./settings";
import { notify } from "./notify";
import { money, fmtDate } from "./format";

/*
  Customer retention.

  Everything here is worked out from the orders table, so there is nothing to keep in sync:
    segment   which group a customer is in right now (VIP, repeat, new, at risk, lost, subscriber)
    value     what they have spent, and a careful estimate of the next 12 months
    points    loyalty points earned on delivered orders; enough points become a reward code

  Marketing messages (come-back reminders, reward codes, targeted campaigns) only ever go to
  people who opted in. Feedback requests are about the customer's own order.
*/

const DAY = 86400000;

// "good" orders are the ones that were not cancelled or returned
const STATS = `
  SELECT c.*, COALESCE(s.orders, 0) AS orders, COALESCE(s.good, 0) AS good, COALESCE(s.spent, 0) AS spent,
         COALESCE(s.failed, 0) AS failed, s.first_at, s.last_at
  FROM contacts c LEFT JOIN (
    SELECT contact_id, count(*)::int AS orders,
           count(*) FILTER (WHERE status NOT IN ('cancelled', 'returned'))::int AS good,
           COALESCE(sum(total) FILTER (WHERE status NOT IN ('cancelled', 'returned')), 0)::int AS spent,
           count(*) FILTER (WHERE status IN ('cancelled', 'returned'))::int AS failed,
           min(created_at) FILTER (WHERE status NOT IN ('cancelled', 'returned')) AS first_at,
           max(created_at) FILTER (WHERE status NOT IN ('cancelled', 'returned')) AS last_at
    FROM orders WHERE contact_id IS NOT NULL GROUP BY contact_id
  ) s ON s.contact_id = c.id`;

// how likely each group is to order again in the coming year (deliberately cautious)
const RETURN_CHANCE = { vip: 0.75, repeat: 0.6, new: 0.3, risk: 0.2, lost: 0.05, lead: 0 };

/** Adds segment, VIP flag and value estimates to a contact row that carries the STATS columns. */
export function profile(row, crm, now = Date.now()) {
  const idle = row.last_at ? Math.floor((now - new Date(row.last_at).getTime()) / DAY) : null;
  const isVip = row.good > 0 && (row.spent >= crm.vip_spend || row.good >= crm.vip_orders);
  const segment =
    !row.good ? "lead"
    : idle > crm.winback_days * 2 ? "lost"
    : idle > crm.winback_days ? "risk"
    : isVip ? "vip"
    : row.good >= 2 ? "repeat"
    : "new";

  // orders per year, measured over at least six months so one recent order does not look like a habit
  const months = row.first_at ? Math.max(6, (now - new Date(row.first_at).getTime()) / (DAY * 30)) : 6;
  const perYear = Math.min(12, (row.good / months) * 12);
  const average = row.good ? Math.round(row.spent / row.good) : 0;
  const next12 = Math.round(average * perYear * RETURN_CHANCE[segment]);

  return { ...row, idle, isVip, segment, average, next12, lifetime: row.spent + next12 };
}

/** Every contact with their stats, newest and most valuable first. */
export async function listCustomers({ limit = 3000 } = {}) {
  const [rows, { crm }] = await Promise.all([query(`${STATS} ORDER BY spent DESC, c.id DESC LIMIT $1`, [limit]), getSettings()]);
  return rows.map((r) => profile(r, crm));
}

export async function getCustomer(id) {
  const [[row], { crm }] = await Promise.all([query(`${STATS} WHERE c.id = $1`, [id]), getSettings()]);
  return row ? profile(row, crm) : null;
}

/* ---------------- campaign audiences ---------------- */

/**
 * Who a campaign goes to. `audience` is "" (every subscriber), "segment:vip", or "category:12"
 * (people who bought from that category before, so a new collection in it is likely to interest them).
 * Returns the ids of matching contacts; opt-in is applied later, when messages are written.
 */
export async function audienceIds(audience) {
  const [kind, value] = String(audience || "").split(":");
  if (kind === "segment") return (await listCustomers()).filter((c) => c.segment === value || (value === "vip" && c.isVip)).map((c) => c.id);
  if (kind === "category") {
    const rows = await query(
      `SELECT DISTINCT o.contact_id AS id FROM orders o JOIN order_items i ON i.order_id = o.id JOIN products p ON p.id = i.product_id
       WHERE o.contact_id IS NOT NULL AND o.status NOT IN ('cancelled', 'returned') AND p.category_id = $1`,
      [Number(value) || 0]
    );
    return rows.map((r) => r.id);
  }
  return null; // everyone
}

/** How many subscribers each audience would reach, for the campaign form. */
export async function audienceOptions() {
  const [customers, categories, buyers] = await Promise.all([
    listCustomers(),
    query("SELECT id, name FROM categories WHERE is_active ORDER BY sort_order, id"),
    query(
      `SELECT DISTINCT p.category_id, o.contact_id FROM orders o JOIN order_items i ON i.order_id = o.id JOIN products p ON p.id = i.product_id
       WHERE o.contact_id IS NOT NULL AND o.status NOT IN ('cancelled', 'returned') AND p.category_id IS NOT NULL`
    ),
  ]);
  const count = (list) => ({
    email: list.filter((c) => c.email_opt_in && c.email).length,
    whatsapp: list.filter((c) => c.whatsapp_opt_in && c.phone).length,
  });
  const byId = new Map(customers.map((c) => [c.id, c]));
  const options = [{ value: "", label: "Everyone who subscribed", ...count(customers) }];
  for (const [key, label] of [["vip", "VIP customers"], ["repeat", "Repeat customers"], ["new", "New customers (one order)"], ["risk", "At risk: win them back"], ["lost", "Lost customers"], ["lead", "Subscribers who never ordered"]]) {
    options.push({ value: `segment:${key}`, label, group: "By buying behaviour", ...count(customers.filter((c) => c.segment === key || (key === "vip" && c.isVip))) });
  }
  for (const cat of categories) {
    const list = buyers.filter((b) => b.category_id === cat.id).map((b) => byId.get(b.contact_id)).filter(Boolean);
    options.push({ value: `category:${cat.id}`, label: `Bought ${cat.name} before`, group: "Likely buyers of a new collection", ...count(list) });
  }
  return options;
}

/* ---------------- loyalty points ---------------- */

async function addPoints(contactId, points, reason, orderId = null) {
  if (!contactId || !points) return;
  await query("INSERT INTO loyalty_ledger (contact_id, order_id, points, reason) VALUES ($1,$2,$3,$4)", [contactId, orderId, points, reason]);
  await query("UPDATE contacts SET points = GREATEST(points + $2, 0) WHERE id = $1", [contactId, points]);
}

/** Points for a delivered order. Safe to call twice: an order is only ever awarded once. */
export async function awardPoints(orderId) {
  const { crm, store } = await getSettings();
  if (!(crm.points_per_100 > 0)) return;
  const [o] = await query(
    `UPDATE orders SET points_awarded = floor(total / 100.0 * $2)::int
     WHERE id = $1 AND status = 'delivered' AND points_awarded = 0 AND contact_id IS NOT NULL AND total >= 100
     RETURNING contact_id, number, points_awarded`,
    [orderId, crm.points_per_100]
  );
  if (!o?.points_awarded) return;
  await addPoints(o.contact_id, o.points_awarded, `Order ${o.number} delivered`, orderId);
  await issueReward(o.contact_id, { crm, store });
}

/** Takes points back when an order (or part of it) is returned. `amount` = money refunded; empty = the whole order. */
export async function revokePoints(orderId, amount = null, why = "returned") {
  const [o] = await query("SELECT contact_id, number, total, points_awarded FROM orders WHERE id = $1", [orderId]);
  if (!o?.points_awarded || !o.contact_id) return;
  const points = amount == null ? o.points_awarded : Math.min(o.points_awarded, Math.round((o.points_awarded * amount) / Math.max(1, o.total)));
  if (!points) return;
  await query("UPDATE orders SET points_awarded = points_awarded - $2 WHERE id = $1", [orderId, points]);
  await addPoints(o.contact_id, -points, `Order ${o.number} ${why}`, orderId);
}

/** A code only this customer was given. Used for loyalty rewards and for store credit after a return. */
export async function personalCode(contactId, { prefix, value, days, note }) {
  const code = `${prefix}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
  await query(
    `INSERT INTO coupons (code, type, value, max_uses, ends_at, contact_id, note)
     VALUES ($1, 'fixed', $2, 1, CASE WHEN $3::int > 0 THEN now() + make_interval(days => $3::int) END, $4, $5)`,
    [code, value, days || 0, contactId, note]
  );
  return code;
}

/** Turns points into a reward code once the customer has enough. `force` = staff pressed the button. */
export async function issueReward(contactId, { crm, store } = {}) {
  if (!crm) ({ crm, store } = await getSettings());
  if (!(crm.reward_points > 0) || !(crm.reward_value > 0)) return { error: "Rewards are switched off in Settings." };
  const [c] = await query("UPDATE contacts SET points = points - $2 WHERE id = $1 AND points >= $2 RETURNING *", [contactId, crm.reward_points]);
  if (!c) return { error: `A reward needs ${crm.reward_points} points.` };
  await query("INSERT INTO loyalty_ledger (contact_id, points, reason) VALUES ($1,$2,$3)", [contactId, -crm.reward_points, "Turned into a reward code"]);
  const code = await personalCode(contactId, { prefix: "THANKS", value: crm.reward_value, days: crm.reward_days, note: "Loyalty reward" });
  // telling them about it is marketing, so only subscribed customers are messaged; the code also shows on their order page
  if (c.email_opt_in || c.whatsapp_opt_in) {
    await notify("loyalty_reward", {
      email: c.email_opt_in ? c.email : null, phone: c.whatsapp_opt_in ? c.phone : null, contactId: c.id,
      vars: {
        name: c.name.split(" ")[0] || "there", code, value: money(crm.reward_value, store.currency),
        expires: crm.reward_days > 0 ? fmtDate(Date.now() + crm.reward_days * DAY, store.timezone, false) : "no end date",
        unsubscribe_url: `${siteUrl()}/unsubscribe/${c.token}`,
      },
    });
  }
  return { ok: true, code };
}

/** Staff correction: add or remove points with a reason. */
export async function adjustPoints(contactId, points, reason, admin) {
  await addPoints(contactId, points, `${reason || "Adjusted"} (${admin.name || "staff"})`);
}

/** Points and unused personal codes, for the customer's own order page. */
export async function loyaltyFor(contactId) {
  if (!contactId) return null;
  const [[c], codes, { crm }] = await Promise.all([
    query("SELECT points FROM contacts WHERE id = $1", [contactId]),
    query("SELECT code, value, ends_at, note FROM coupons WHERE contact_id = $1 AND is_active AND used_count < COALESCE(max_uses, 1) AND (ends_at IS NULL OR ends_at > now()) ORDER BY id DESC LIMIT 3", [contactId]),
    getSettings(),
  ]);
  if (!c || !(crm.points_per_100 > 0)) return codes.length ? { points: 0, codes, crm } : null;
  return { points: c.points, codes, crm };
}

/* ---------------- automatic follow-ups ---------------- */

/** Feedback requests and come-back reminders. Called by the scheduled job. */
export async function runRetention() {
  const { crm } = await getSettings();
  const out = { feedback_requests: 0, repeat_reminders: 0 };
  const url = siteUrl();

  if (crm.feedback_days > 0) {
    const due = await query(
      `UPDATE orders SET feedback_sent_at = now()
       WHERE id IN (SELECT id FROM orders WHERE status = 'delivered' AND feedback_sent_at IS NULL AND phone <> '0' AND channel <> 'store'
                    AND delivered_at < now() - make_interval(days => $1::int) AND delivered_at > now() - interval '30 days'
                    AND NOT EXISTS (SELECT 1 FROM feedback f WHERE f.order_id = orders.id) ORDER BY id LIMIT 50)
       RETURNING id, number, token, customer_name, email, phone, contact_id`,
      [crm.feedback_days]
    );
    for (const o of due) {
      await notify("feedback_request", {
        email: o.email, phone: o.phone, contactId: o.contact_id, orderId: o.id,
        vars: { name: o.customer_name.split(" ")[0], order_number: o.number, url: `${url}/feedback/${o.token}` },
      });
      out.feedback_requests++;
    }
  }

  if (crm.reorder_days > 0) {
    // subscribed customers whose last order was a while ago and who have not been reminded since
    const due = await query(
      `SELECT c.id, c.name, c.email, c.phone, c.token, c.email_opt_in, c.whatsapp_opt_in, s.last_at
       FROM contacts c JOIN (
         SELECT contact_id, max(created_at) AS last_at FROM orders WHERE status NOT IN ('cancelled', 'returned') AND contact_id IS NOT NULL GROUP BY contact_id
       ) s ON s.contact_id = c.id
       WHERE (c.email_opt_in OR c.whatsapp_opt_in)
         AND s.last_at < now() - make_interval(days => $1::int) AND s.last_at > now() - make_interval(days => $1::int + 30)
         AND (c.reorder_reminded_at IS NULL OR c.reorder_reminded_at < s.last_at)
       ORDER BY s.last_at LIMIT 50`,
      [crm.reorder_days]
    );
    for (const c of due) {
      // newest in-stock pieces from the categories they bought from, leaving out what they already own
      const picks = await query(
        `SELECT p.name, p.slug FROM products p
         WHERE p.status = 'active'
           AND p.category_id IN (SELECT p2.category_id FROM orders o JOIN order_items i ON i.order_id = o.id JOIN products p2 ON p2.id = i.product_id WHERE o.contact_id = $1)
           AND p.id NOT IN (SELECT i.product_id FROM orders o JOIN order_items i ON i.order_id = o.id WHERE o.contact_id = $1 AND i.product_id IS NOT NULL)
           AND EXISTS (SELECT 1 FROM variants v WHERE v.product_id = p.id AND v.stock - v.reserved > 0)
         ORDER BY p.published_at DESC NULLS LAST, p.id DESC LIMIT 3`,
        [c.id]
      );
      await query("UPDATE contacts SET reorder_reminded_at = now() WHERE id = $1", [c.id]);
      if (!picks.length) continue;
      await notify("repeat_reminder", {
        email: c.email_opt_in ? c.email : null, phone: c.whatsapp_opt_in ? c.phone : null, contactId: c.id,
        vars: {
          name: c.name.split(" ")[0] || "there",
          picks: picks.map((p) => `• ${p.name}: ${url}/products/${p.slug}`).join("\n") + "\n",
          url: `${url}/products`, unsubscribe_url: `${url}/unsubscribe/${c.token}`,
        },
      });
      out.repeat_reminders++;
    }
  }
  return out;
}
