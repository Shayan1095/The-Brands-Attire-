import "server-only";
import { query } from "./db";
import { getSettings, siteUrl } from "./settings";
import { notify } from "./notify";
import { stockInsights } from "./insights";
import { money } from "./format";
import { runTriage, runWriter, runCatalogue, runCoach, applyDescription } from "./agents-writers";
import { runMerch, runFeedback, cleanShowcase, startClearout } from "./agents-merch";

/*
  Agents: small workers that watch the shop and either tell the owner something or suggest an action.

    briefing   a morning summary: yesterday's sales, what needs doing today, what to watch
    guard      scores every new order for cash-on-delivery risk and says when to call first
    restock    warns before a size sells out, and which sold-out sizes customers are waiting for
    triage, writer, catalogue   see lib/agents-writers.js
    merch, feedback             see lib/agents-merch.js

  Every decision is made by plain rules over the shop's own data (orders, stock, returns, ratings), so they
  cost nothing and need no AI key. A connected AI model (lib/ai.js) may only reword their messages.
  Anything that needs a decision becomes a suggestion (agent_tasks) in Admin -> Agents, approved or
  dismissed there; the optional Auto switches (off by default) let a few clear-cut ones happen by themselves.
  Every run is logged (agent_runs).

  When they run:
    - the daily scheduled job and every dashboard visit call runAgents(), which runs each agent at most
      every few hours (the briefing once a day, from the owner's chosen hour)
    - the guard also runs the moment an order is placed (onOrderPlaced)
    - "Run now" in Admin -> Agents runs one straight away
*/

export const AGENTS = {
  briefing: { label: "Daily briefing", every: 0 },
  guard: { label: "Order guard", every: 2 },
  restock: { label: "Restock", every: 6 },
  triage: { label: "Returns triage", every: 1 },
  writer: { label: "Marketing writer", every: 24 },
  catalogue: { label: "Catalogue checker", every: 24 },
  merch: { label: "Merchandiser", every: 24 },
  feedback: { label: "Feedback analyst", every: 24 },
  coach: { label: "Chat coach", every: 24 },
};

const OPEN_ORDER = ["pending", "confirmed", "packed"];

/** Today's date and hour in the store's timezone. */
function storeClock(tz, d = new Date()) {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(d);
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", hourCycle: "h23" }).format(d));
  return { day, hour };
}

async function logRun(agent, trigger, ok, summary) {
  await query("INSERT INTO agent_runs (agent, trigger, ok, summary) VALUES ($1,$2,$3,$4)", [agent, trigger, ok, String(summary).slice(0, 4000)]);
}

/** Adds a suggestion unless the same one was already made (`dedupe`). Returns true when it is new. */
async function suggest(task) {
  const [row] = await query(
    `INSERT INTO agent_tasks (agent, kind, title, detail, severity, ref_type, ref_id, dedupe, data)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb) ON CONFLICT (dedupe) DO NOTHING RETURNING id`,
    [task.agent, task.kind, task.title, task.detail || "", task.severity || "info", task.refType || null, task.refId || null, task.dedupe, JSON.stringify(task.data || {})]
  );
  return Boolean(row);
}

/* ================= order guard ================= */

/**
 * How risky an order is for cash on delivery, 0-100, with the reasons in plain words.
 * Past refusals and cancellations weigh most; a good delivery history lowers the score.
 */
export async function scoreOrder(orderId, settings) {
  const a = settings.agents;
  const [o] = await query(
    `SELECT o.id, o.number, o.phone, o.customer_name, o.address, o.city, o.total, o.channel, o.status, o.contact_id, c.is_flagged
     FROM orders o LEFT JOIN contacts c ON c.id = o.contact_id WHERE o.id = $1`, [orderId]);
  if (!o || o.phone === "0" || o.channel === "store") return null;

  const [[h], [dup]] = await Promise.all([
    query(
      `SELECT count(*) FILTER (WHERE status = 'delivered')::int AS delivered,
              count(*) FILTER (WHERE status = 'returned')::int AS refused,
              count(*) FILTER (WHERE status = 'cancelled')::int AS cancelled,
              count(*) FILTER (WHERE created_at > now() - interval '24 hours')::int AS today
       FROM orders WHERE phone = $1 AND id <> $2`, [o.phone, o.id]),
    query(
      `SELECT count(*)::int AS n FROM orders o2 WHERE o2.phone = $1 AND o2.id <> $2 AND o2.status = ANY($3::text[])
         AND EXISTS (SELECT 1 FROM order_items a JOIN order_items b ON a.variant_id = b.variant_id WHERE a.order_id = $2 AND b.order_id = o2.id)`,
      [o.phone, o.id, OPEN_ORDER]),
  ]);

  let score = 0;
  const reasons = [];
  const add = (points, why) => { score += points; reasons.push(why); };
  if (h.refused) add(Math.min(50, h.refused * 30), `${h.refused} earlier ${h.refused === 1 ? "parcel was" : "parcels were"} refused or sent back`);
  if (h.cancelled) add(Math.min(30, h.cancelled * 12), `${h.cancelled} earlier ${h.cancelled === 1 ? "order" : "orders"} cancelled`);
  if (o.is_flagged) add(40, "This customer is flagged by your team");
  if (dup.n) add(20, "Another open order from this number has the same piece");
  if (h.today >= 2) add(15, `${h.today} other orders from this number in the last 24 hours`);
  if (!h.delivered && o.total >= a.guard_high_value) add(15, `First order and a high value (${money(o.total, settings.store.currency)})`);
  const address = String(o.address || "").trim();
  if (address.length < 15 || !/\d/.test(address)) add(15, "The address is very short or has no house or street number");
  const name = String(o.customer_name || "").trim();
  if (name.length < 3 || /\d/.test(name)) add(10, "The name does not look like a real name");
  if (h.delivered) { score -= Math.min(30, h.delivered * 15); reasons.push(`${h.delivered} earlier ${h.delivered === 1 ? "order" : "orders"} delivered and paid`); }
  score = Math.max(0, Math.min(100, score));

  await query("UPDATE orders SET risk_score = $2, risk_reasons = $3::jsonb WHERE id = $1", [o.id, score, JSON.stringify(reasons)]);
  // the number's whole history with the shop, so the owner sees it at a glance
  return { order: o, score, reasons, history: { delivered: h.delivered, refused: h.refused, cancelled: h.cancelled } };
}

/** Scores one order and, when it is risky, suggests what to do. */
async function guardOrder(orderId, settings) {
  const a = settings.agents;
  const r = await scoreOrder(orderId, settings);
  if (!r || r.score < a.guard_call || !OPEN_ORDER.includes(r.order.status)) return false;
  const high = r.score >= a.guard_advance;
  return suggest({
    agent: "guard", kind: "check_order", refType: "order", refId: r.order.id, dedupe: `guard:order:${r.order.id}`,
    severity: high ? "bad" : "warn",
    title: `${r.order.number}: ${high ? "ask for an advance, or decline" : "call before confirming"}`,
    detail: r.reasons.filter((x) => !x.includes("delivered and paid")).join(". ") + ".",
    data: { score: r.score, reasons: r.reasons, customer: r.order.customer_name, total: r.order.total, city: r.order.city, history: r.history, status: r.order.status },
  });
}

/** Called right after an order is placed (any channel). Never slows or breaks the order if it fails. */
export async function onOrderPlaced(orderId) {
  try {
    const settings = await getSettings();
    if (!settings.agents.guard) return;
    await guardOrder(orderId, settings);
  } catch (err) {
    console.error("[guard]", err);
  }
}

async function runGuard(settings) {
  // orders not scored yet (placed before the guard was switched on), and tidy up suggestions for orders that moved on
  const todo = await query("SELECT id FROM orders WHERE risk_score IS NULL AND status = ANY($1::text[]) ORDER BY id DESC LIMIT 60", [OPEN_ORDER]);
  let flagged = 0;
  for (const o of todo) if (await guardOrder(o.id, settings)) flagged++;
  const closed = await query(
    `UPDATE agent_tasks t SET status = 'done', note = 'The order moved on', decided_at = now()
     FROM orders o WHERE t.agent = 'guard' AND t.status = 'open' AND t.ref_id = o.id AND o.status <> ALL($1::text[]) RETURNING t.id`,
    [OPEN_ORDER]);
  const [{ open }] = await query("SELECT count(*)::int AS open FROM agent_tasks WHERE agent = 'guard' AND status = 'open'");
  return `Checked ${todo.length} new ${todo.length === 1 ? "order" : "orders"}: ${flagged} need a closer look. ${open} open, ${closed.length} closed because the order moved on.`;
}

/* ================= restock ================= */

// one suggestion per product per week, so a product that keeps selling is raised again next week
const weekKey = (d = new Date()) => {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const week = Math.ceil(((t - new Date(Date.UTC(t.getUTCFullYear(), 0, 1))) / 864e5 + 1) / 7);
  return `${t.getUTCFullYear()}-W${week}`;
};

async function runRestock(settings) {
  const ins = await stockInsights();
  const horizon = ins.lead + Math.max(1, Number(settings.agents.restock_days) || 7);
  const waiting = await query(
    `SELECT a.variant_id, count(*)::int AS n FROM stock_alerts a JOIN variants v ON v.id = a.variant_id
     WHERE a.notified_at IS NULL AND v.stock - v.reserved <= 0 GROUP BY a.variant_id`);
  const waitOf = new Map(waiting.map((w) => [w.variant_id, w.n]));

  // sizes that will run out soon, or are gone while people wait for them
  const rows = ins.restock.filter((v) => (v.daysLeft !== null && v.daysLeft <= horizon) || waitOf.get(v.id));
  for (const [id, n] of waitOf) {
    if (!rows.some((r) => r.id === id)) {
      const [v] = await query(
        `SELECT v.id, v.size, v.color, v.product_id, p.name, p.status FROM variants v JOIN products p ON p.id = v.product_id WHERE v.id = $1`, [id]);
      if (v && v.status === "active") rows.push({ id, productId: v.product_id, name: v.name, label: v.color ? `${v.size} · ${v.color}` : v.size, available: 0, perWeek: 0, daysLeft: 0, suggest: Math.max(n, 2) });
    }
  }

  const byProduct = new Map();
  for (const v of rows) byProduct.set(v.productId, [...(byProduct.get(v.productId) || []), v]);
  // what running out would cost: the sales a size would miss until new stock arrives (supplier lead time),
  // from how fast it sells, at the product's price. Customers waiting for a sold-out size count at least once each.
  const prices = new Map((await query("SELECT id, price FROM products WHERE id = ANY($1::int[])", [[...byProduct.keys()]])).map((p) => [p.id, p.price]));
  const lost = (s) => {
    const perDay = (Number(s.perWeek) || 0) / 7;
    const short = s.available === 0 ? ins.lead : Math.max(0, ins.lead - (s.daysLeft ?? ins.lead));
    return Math.max(Math.ceil(perDay * short), s.available === 0 ? waitOf.get(s.id) || 0 : 0);
  };
  const fmt = (n) => money(n, settings.store.currency);
  let made = 0;
  const week = weekKey();
  for (const [productId, sizes] of byProduct) {
    const urgent = sizes.some((s) => s.available === 0 || (s.daysLeft !== null && s.daysLeft <= Math.max(ins.lead, 3)) || waitOf.get(s.id));
    const soonest = sizes.reduce((m, s) => Math.min(m, s.daysLeft ?? 999), 999);
    const lines = sizes.map((s) => {
      const w = waitOf.get(s.id);
      const state = s.available === 0 ? "sold out" : `${s.available} left, ~${s.daysLeft} ${s.daysLeft === 1 ? "day" : "days"} at ${s.perWeek}/week`;
      return `${s.label}: ${state}${w ? `, ${w} ${w === 1 ? "customer" : "customers"} waiting` : ""}${s.suggest ? `. Order about ${s.suggest}` : ""}`;
    });
    const name = sizes[0].name;
    const atRisk = sizes.reduce((sum, s) => sum + lost(s), 0) * (prices.get(productId) || 0);
    const title = (sizes.some((s) => s.available === 0)
      ? `${name}: ${sizes.filter((s) => s.available === 0).map((s) => s.label).join(", ")} sold out${sizes.some((s) => waitOf.get(s.id)) ? ", customers waiting" : ""}`
      : `${name}: ${sizes.map((s) => s.label).join(", ")} ${sizes.length === 1 ? "runs" : "run"} out in ~${soonest} ${soonest === 1 ? "day" : "days"}`)
      + (atRisk > 0 ? ` · about ${fmt(atRisk)} in sales at risk` : "");
    if (await suggest({
      agent: "restock", kind: "reorder", refType: "product", refId: productId, dedupe: `restock:${productId}:${week}`,
      severity: urgent ? "bad" : "warn", title,
      detail: lines.join(". ") + "." + (atRisk > 0 ? ` If it is not reordered today, about ${fmt(atRisk)} of sales could be missed before new stock arrives (${ins.lead} days).` : ""),
      data: { sizes: sizes.map((s) => ({ label: s.label, available: s.available, daysLeft: s.daysLeft, perWeek: s.perWeek, order: s.suggest, waiting: waitOf.get(s.id) || 0 })), lead: ins.lead, atRisk },
    })) made++;
  }
  // last week's suggestions close themselves: no longer needed, or replaced by this week's (fresher numbers)
  const stale = await query(
    `UPDATE agent_tasks SET status = 'done', decided_at = now(),
       note = CASE WHEN ref_id = ANY($1::int[]) THEN 'Replaced by this week''s check' ELSE 'No longer needed' END
     WHERE agent = 'restock' AND status = 'open' AND (NOT (ref_id = ANY($1::int[])) OR dedupe NOT LIKE '%:' || $2) RETURNING id`,
    [[...byProduct.keys()], week]);
  return `${byProduct.size} ${byProduct.size === 1 ? "product needs" : "products need"} restocking within ${horizon} days (${made} new). ${stale.length} older suggestions closed.`;
}

/* ================= daily briefing ================= */

/** The morning summary as plain text (for email) and as sections (for the panel). */
export async function buildBriefing(settings) {
  const tz = settings.store.timezone;
  const fmt = (n) => money(n, settings.store.currency);
  const [[y], [w], [c], tasks, [fb]] = await Promise.all([
    query(
      `SELECT count(*)::int AS orders, COALESCE(sum(total), 0)::int AS sales FROM orders
       WHERE status <> 'cancelled' AND (created_at AT TIME ZONE $1)::date = (now() AT TIME ZONE $1)::date - 1`, [tz]),
    query(
      `SELECT count(*)::int AS orders, COALESCE(sum(total), 0)::int AS sales FROM orders
       WHERE status <> 'cancelled' AND (created_at AT TIME ZONE $1)::date = (now() AT TIME ZONE $1)::date - 8`, [tz]),
    query(`SELECT
        (SELECT count(*)::int FROM orders WHERE status = 'pending') AS pending,
        (SELECT count(*)::int FROM orders WHERE status = 'confirmed') AS to_pack,
        (SELECT count(*)::int FROM orders WHERE status = 'packed') AS to_ship,
        (SELECT count(*)::int FROM orders WHERE status = 'shipped' AND shipped_at < now() - make_interval(days => $1::int)) AS late,
        (SELECT count(*)::int FROM cases WHERE status = 'requested') AS cases_new,
        (SELECT count(*)::int FROM cases WHERE status = 'received') AS cases_settle,
        (SELECT count(*)::int FROM cases WHERE status = 'approved') AS cases_pickup,
        (SELECT count(*)::int FROM conversations WHERE status = 'human' AND unread > 0) AS chats,
        (SELECT count(*)::int FROM messages WHERE status = 'manual') AS whatsapp`, [settings.orders.deliver_days]),
    query("SELECT agent, title, severity FROM agent_tasks WHERE status = 'open' ORDER BY CASE severity WHEN 'bad' THEN 0 WHEN 'warn' THEN 1 ELSE 2 END, id DESC LIMIT 20"),
    query(`SELECT count(*)::int AS n, COALESCE(round(avg(rating), 1), 0)::float AS avg FROM feedback WHERE created_at > now() - interval '1 day'`),
  ]);
  // money at risk today: orders not confirmed yet, sales the Restock agent expects to miss, returns not settled
  const [risk] = await query(`SELECT
      (SELECT count(*)::int FROM orders WHERE status = 'pending') AS pending_n,
      (SELECT COALESCE(sum(total), 0)::int FROM orders WHERE status = 'pending') AS pending,
      (SELECT COALESCE(sum((data->>'atRisk')::int), 0)::int FROM agent_tasks WHERE agent = 'restock' AND status = 'open') AS stock,
      (SELECT count(*)::int FROM cases WHERE status IN ('requested', 'approved', 'received') AND type <> 'complaint') AS cases_n,
      (SELECT COALESCE(sum(ci.unit_price * ci.qty), 0)::int FROM cases c JOIN case_items ci ON ci.case_id = c.id
        WHERE c.status IN ('requested', 'approved', 'received') AND c.type <> 'complaint') AS cases`);
  const riskParts = [
    risk.pending && `${risk.pending_n} unconfirmed ${risk.pending_n === 1 ? "order" : "orders"} ${fmt(risk.pending)}`,
    risk.stock && `low stock on sellers ${fmt(risk.stock)}`,
    risk.cases && `${risk.cases_n} ${risk.cases_n === 1 ? "return" : "returns"} in progress ${fmt(risk.cases)}`,
  ].filter(Boolean);
  const atRisk = riskParts.length ? { total: risk.pending + risk.stock + risk.cases, line: `${fmt(risk.pending + risk.stock + risk.cases)} (${riskParts.join(", ")})` } : null;

  const day = new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "long", day: "numeric", month: "short" }).format(new Date());
  const yesterday = y.orders
    ? `${y.orders} ${y.orders === 1 ? "order" : "orders"}, ${fmt(y.sales)}${w.orders || w.sales ? ` (same day last week: ${w.orders}, ${fmt(w.sales)})` : ""}`
    : "No orders yesterday.";

  // most urgent first; only lines with something in them
  const todo = [
    [c.cases_settle, (n) => `${n} collected ${n === 1 ? "return" : "returns"} to settle`],
    [c.cases_pickup, (n) => `${n} approved ${n === 1 ? "return needs" : "returns need"} a pickup arranged`],
    [c.to_pack, (n) => `${n} confirmed ${n === 1 ? "order" : "orders"} to pack`],
    [c.to_ship, (n) => `${n} packed ${n === 1 ? "order" : "orders"} to hand to the courier`],
    [c.pending, (n) => `${n} ${n === 1 ? "order" : "orders"} waiting for the customer to confirm`],
    [c.cases_new, (n) => `${n} return or exchange ${n === 1 ? "request" : "requests"} to review`],
    [c.chats, (n) => `${n} customer ${n === 1 ? "chat" : "chats"} waiting for a person`],
    [c.whatsapp, (n) => `${n} WhatsApp ${n === 1 ? "message" : "messages"} waiting to be sent`],
    [c.late, (n) => `${n} ${n === 1 ? "parcel" : "parcels"} with the courier for over ${settings.orders.deliver_days} days`],
  ].filter(([n]) => n > 0).map(([n, say]) => say(n));
  const watch = tasks.slice(0, 5).map((t) => t.title);
  if (fb.n) watch.push(`${fb.n} new ${fb.n === 1 ? "rating" : "ratings"}, average ${fb.avg} of 5`);

  const text = [
    `Good morning! Here is ${settings.store.name} for ${day}.`,
    "",
    `Yesterday: ${yesterday}`,
    "",
    atRisk ? `Money at risk today: ${atRisk.line}` : "",
    atRisk ? "" : null,
    todo.length ? "Today:\n" + todo.map((t) => `• ${t}`).join("\n") : "Today: nothing is waiting on you.",
    watch.length ? "\nAgents suggest:\n" + watch.map((t) => `• ${t}`).join("\n") : "",
    "",
    `Open the panel: ${siteUrl()}/admin/agents`,
  ].filter((l) => l !== null).filter((l, i, all) => l !== "" || all[i - 1] !== "").join("\n");

  return { day, yesterday, todo, watch, text, openTasks: tasks.length, atRisk };
}

async function runBriefing(settings, { force = false } = {}) {
  const { day, hour } = storeClock(settings.store.timezone);
  if (!force) {
    if (hour < settings.agents.briefing_hour) return null; // not time yet today
    const [done] = await query("SELECT 1 FROM agent_runs WHERE agent = 'briefing' AND ok AND (created_at AT TIME ZONE $1)::date = $2::date", [settings.store.timezone, day]);
    if (done) return null; // already written today
  }
  const b = await buildBriefing(settings);
  if (settings.agents.briefing_email) {
    await notify("owner_briefing", { vars: { date: b.day, briefing: b.text, admin_url: `${siteUrl()}/admin/agents` } });
  }
  return b.text;
}

/* ================= running them ================= */

const RUNNERS = { briefing: runBriefing, guard: runGuard, restock: runRestock, triage: runTriage, writer: runWriter, catalogue: runCatalogue, merch: runMerch, feedback: runFeedback, coach: runCoach };

/**
 * Runs the agents that are switched on and due. `only` = one agent, `force` = ignore the timing
 * (the "Run now" button). Returns { agent: summary } for what ran.
 */
export async function runAgents({ trigger = "schedule", only = null, force = false } = {}) {
  const settings = await getSettings();
  const out = {};
  for (const [key, meta] of Object.entries(AGENTS)) {
    if (only && key !== only) continue;
    if (!settings.agents[key] && !(force && only)) continue;
    if (!force && meta.every) {
      const [recent] = await query("SELECT 1 FROM agent_runs WHERE agent = $1 AND ok AND created_at > now() - make_interval(hours => $2::int)", [key, meta.every]);
      if (recent) continue;
    }
    try {
      const summary = await RUNNERS[key](settings, { force });
      if (summary === null) continue;
      await logRun(key, trigger, true, summary);
      out[key] = summary;
    } catch (err) {
      console.error(`[agent ${key}]`, err);
      await logRun(key, trigger, false, err.message || "Failed").catch(() => {});
      out[key] = `failed: ${err.message}`;
    }
  }
  return out;
}

/**
 * Approve (done) or dismiss a suggestion. Approving also carries it out where there is something to do:
 *   guard     notes the check on the order
 *   triage    approves or declines the return request with the (edited) message
 *   catalogue saves the (edited) description on the product
 *   writer    opens the drafted campaign in Campaigns (nothing is sent until the owner presses Send there)
 * `payload` carries the edits: { message, decision } for triage, { description } for catalogue.
 */
export async function decideTask(id, approve, admin, note = "", payload = {}) {
  // claim it first: if two people press at the same moment, only one carries it out
  const [t] = await query(
    `UPDATE agent_tasks SET status = $2, decided_by = $3, note = $4, decided_at = now() WHERE id = $1 AND status = 'open' RETURNING *`,
    [id, approve ? "done" : "dismissed", admin.id, String(note || "").slice(0, 300)]
  );
  if (!t) return { error: "This suggestion was already handled." };
  if (!approve) return { ok: true };
  try {
    const res = await carryOut(t, admin, note, payload);
    if (res.error) {
      await query("UPDATE agent_tasks SET status = 'open', decided_by = NULL, note = '', decided_at = NULL WHERE id = $1", [id]);
      return res;
    }
    if (res.note && res.note !== note) await query("UPDATE agent_tasks SET note = $2 WHERE id = $1", [id, String(res.note).slice(0, 300)]);
    return res.redirect ? { ok: true, redirect: res.redirect } : { ok: true };
  } catch (err) {
    await query("UPDATE agent_tasks SET status = 'open', decided_by = NULL, note = '', decided_at = NULL WHERE id = $1", [id]);
    throw err;
  }
}

/** What approving a suggestion does. Returns { error } or { note, redirect }. */
async function carryOut(t, admin, note, payload) {
  if (t.agent === "triage" && ["approve", "decline"].includes(payload.decision)) {
    const { decideCase } = await import("./cases");
    const res = await decideCase(t.ref_id, payload.decision === "approve", String(payload.message || t.data?.draft || "").slice(0, 600), admin);
    if (res.error) return res;
    note = note || (payload.decision === "approve" ? "Request approved" : "Request declined");
  }
  if (t.agent === "catalogue" && payload.description) {
    const res = await applyDescription(t.ref_id, payload.description);
    if (res.error) return res;
    note = note || "Description saved";
  }
  if (t.kind === "clearout") {
    const keep = Array.isArray(payload.products) && payload.products.length ? payload.products : (t.data?.products || []).map((p) => p.id);
    const res = await startClearout(keep, payload.percent ?? t.data?.percent, payload.days ?? t.data?.days);
    if (res.error) return res;
    note = note || `${res.name} started: ${res.percent}% off for ${res.days} days`;
  }
  if (t.kind === "showcase_clean") {
    // only what is still sold out or hidden now: a piece back in stock since the suggestion stays
    const res = await cleanShowcase(t.data?.remove);
    note = note || (res.removed ? `${res.removed} removed from the Showcase` : "Nothing to remove any more: they are back in stock");
  }
  if (t.kind === "fit_note" && t.ref_id) {
    const text = String(payload.message || t.data?.note || "").trim().slice(0, 200);
    if (!text) return { error: "Write the fit tip first." };
    await query("UPDATE products SET fit_note = $2 WHERE id = $1", [t.ref_id, text]);
    note = note || "Fit tip published";
  }
  if (t.agent === "guard" && t.ref_id) {
    const { addOrderNote, askToConfirm } = await import("./orders");
    if (payload.action === "ask_confirm") {
      const res = await askToConfirm(t.ref_id);
      if (res.error) return res;
      note = note || "Asked the customer to confirm";
    }
    await addOrderNote(t.ref_id, `Order guard (risk ${t.data?.score ?? "?"}/100): ${payload.action === "ask_confirm" ? "asked the customer to confirm" : "checked"}${note && payload.action !== "ask_confirm" ? `: ${note}` : ""}`, admin).catch(() => {});
  }
  if (t.kind === "serial_returner") {
    // flagged, never blocked: the Order guard then suggests a call before this customer's next order is confirmed
    const why = `Flagged by the Returns triage agent: ${t.title}${note ? ` (${note})` : ""}`;
    const [c] = await query(
      `UPDATE contacts SET is_flagged = true, notes = trim(both E'\n' from notes || E'\n' || $2) WHERE id = $1 RETURNING id`,
      [t.ref_id || 0, why]
    );
    note = note || (c ? "Customer flagged" : "No customer record to flag");
  }
  if (t.kind === "faq_suggest") {
    const answer = String(payload.message || "").trim().slice(0, 2000);
    if (answer.length < 5) return { error: "Write the answer first." };
    const question = String(payload.question || t.data?.question || "").trim().slice(0, 300);
    const keywords = String(payload.keywords ?? t.data?.keywords ?? "").trim().slice(0, 300);
    await query("INSERT INTO faqs (question, answer, keywords) VALUES ($1, $2, $3)", [question, answer, keywords]);
    note = note || "Saved as an answer: the assistant uses it from now on";
  }
  if (t.agent === "writer") return { note, redirect: `/admin/campaigns?draft=${t.id}` };
  return { note };
}
