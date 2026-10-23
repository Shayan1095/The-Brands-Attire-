import "server-only";
import { query } from "./db";
import { siteUrl } from "./settings";
import { aiWrite, voice } from "./ai";
import { money, CASE_TYPES, CASE_REASONS } from "./format";

/*
  Phase 2 agents. Each one decides with plain rules and writes its own wording; when an AI model is
  connected (see lib/ai.js) it only rewrites the wording, never the decision. No AI key is needed.

    triage     a new return / exchange / complaint: suggests approving it, a closer look, or a reply, with the message
    writer     spots campaign moments (new pieces, a sale that started, customers drifting away) and drafts one
    catalogue  finds products with missing photos, thin descriptions or odd prices, and drafts a description

  Suggestions go into agent_tasks like the Phase 1 agents (see lib/agents.js, which runs these too).
*/

export async function suggest(task) {
  const [row] = await query(
    `INSERT INTO agent_tasks (agent, kind, title, detail, severity, ref_type, ref_id, dedupe, data, status, note, decided_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11, CASE WHEN $10 = 'open' THEN NULL ELSE now() END)
     ON CONFLICT (dedupe) DO NOTHING RETURNING id`,
    [task.agent, task.kind, task.title, task.detail || "", task.severity || "info", task.refType || null, task.refId || null, task.dedupe,
     JSON.stringify(task.data || {}), task.status || "open", task.note || ""]
  );
  return Boolean(row);
}

/** AI polish for a message, falling back to the built-in one. */
async function polish(settings, draft, facts, maxTokens = 300) {
  const better = await aiWrite({
    system: voice(settings),
    prompt: `Rewrite this message to the customer so it reads naturally and warmly. Rules: keep every fact; add nothing that is not in the message (no payment, delivery, timing, refund, discount or policy details, no next steps); keep it under 60 words; plain text.\n\nFacts: ${facts}\n\nMessage:\n${draft}`,
    maxTokens,
  });
  return better || draft;
}

/* ================= returns triage ================= */

const TRIAGE_ADMIN = { id: null, name: "Returns triage agent" };

/** Looks at one request waiting for review and suggests what to do (or does it, in Auto for clear cases). */
export async function triageCase(caseId, settings) {
  const { getCase, decideCase } = await import("./cases");
  const c = await getCase(caseId);
  if (!c || c.status !== "requested") return false;
  const [[hist], [refused]] = await Promise.all([
    query(`SELECT count(*)::int AS n FROM cases WHERE id <> $1 AND (contact_id = $2 OR order_id IN (SELECT id FROM orders WHERE phone = $3 AND phone <> '0'))
           AND created_at > now() - interval '180 days'`, [c.id, c.contact_id, c.phone]),
    query("SELECT count(*)::int AS n FROM orders WHERE phone = $1 AND phone <> '0' AND status = 'returned'", [c.phone]),
  ]);
  const fault = Boolean(CASE_REASONS[c.reason]?.[1]);
  const short = c.items.filter((i) => i.want_variant_id && i.want_stock < i.qty);
  const reasons = [];
  let verdict;
  if (c.type === "complaint") {
    verdict = "reply";
    reasons.push(fault ? "The customer reports a fault on our side" : `Complaint about: ${CASE_REASONS[c.reason]?.[0].toLowerCase()}`);
  } else if (!c.eligible) {
    // customers cannot ask outside the rules (the order page refuses it), so a staff member opened this on
    // purpose (goodwill, a phone call): suggest checking with them, never declining their decision
    const why = c.events.map((e) => /outside the rules \((.+)\)/.exec(e.note)?.[1]).find(Boolean);
    verdict = "review";
    reasons.push(`Opened by ${c.events.at(-1)?.actor && c.events.at(-1).actor !== "customer" ? c.events.at(-1).actor : "staff"} outside your rules${why ? ` (${why.replace(/\.$/, "")})` : ""}: check it was meant as a goodwill exception`);
  } else if (short.length) {
    verdict = "review";
    reasons.push(`${short.map((i) => i.want_size).join(", ")} ${short.length === 1 ? "is" : "are"} not in stock any more: offer another size or store credit`);
  } else {
    verdict = "approve";
    reasons.push(fault ? "A fault on our side, inside the window: always accepted" : "Inside your rules");
    if (c.type === "exchange" && c.items.every((i) => i.want_variant_id)) reasons.push("The sizes asked for are in stock");
  }
  if (hist.n >= 2) { reasons.push(`${hist.n} other requests from this customer in 6 months`); if (verdict === "approve") verdict = "review"; }
  if (refused.n) reasons.push(`${refused.n} refused ${refused.n === 1 ? "parcel" : "parcels"} before`);

  const first = c.customer_name.split(" ")[0];
  const type = CASE_TYPES[c.type].toLowerCase();
  const window = settings.returns.window_days;
  const builtIn = {
    approve: `Hi ${first}, thank you for letting us know. Your ${type} is approved.`,
    decline: `Hi ${first}, we are sorry, but we cannot accept this ${type}. If you think we got this wrong, just reply and we will look again.`,
    review: `Hi ${first}, thank you for your request. We are checking it and will get back to you shortly.`,
    reply: `Hi ${first}, we are really sorry about this. Thank you for telling us. We are looking into it now and will put it right.`,
  }[verdict];
  const draft = await polish(settings, builtIn, `${type} request ${c.number}, reason: ${CASE_REASONS[c.reason]?.[0]}, decision: ${verdict}`);
  // whichever way the owner decides, the customer gets the matching wording (the suggested one is polished)
  const drafts = {
    approve: verdict === "approve" ? draft : `Hi ${first}, thank you for your patience. Your ${type} is approved.`,
    decline: verdict === "decline" ? draft : `Hi ${first}, we are sorry, but we cannot accept this ${type}. If you think we got this wrong, just reply and we will look again.`,
  };
  const title = {
    approve: `${c.number}: approve the ${type}`,
    decline: `${c.number}: decline, outside your rules`,
    review: `${c.number}: needs a closer look`,
    reply: `${c.number}: reply to the complaint`,
  }[verdict];

  // Auto: clear in-rule requests are approved without waiting (only when the owner switched it on)
  const auto = settings.agents.triage_auto && verdict === "approve" && c.type !== "complaint";
  if (auto) {
    const res = await decideCase(c.id, true, drafts.approve, TRIAGE_ADMIN);
    if (res.error) return false;
  }
  return suggest({
    agent: "triage", kind: "triage_case", refType: "case", refId: c.id, dedupe: `triage:case:${c.id}`,
    severity: verdict === "decline" || verdict === "reply" ? "warn" : verdict === "review" ? "warn" : "info",
    title, detail: reasons.join(". ") + ".",
    data: { verdict, reasons, draft, drafts, number: c.number, customer: c.customer_name, type: c.type },
    status: auto ? "done" : "open", note: auto ? "Approved automatically (Auto mode)" : "",
  });
}

/**
 * Customers who send back far more than they keep: 3 or more returns / exchanges in 6 months, from no more than
 * twice as many orders. Suggested for flagging, never blocked: a flag makes the Order guard ask for a call first.
 */
async function findSerialReturners() {
  const rows = await query(
    `SELECT o.phone, max(o.customer_name) AS name, max(o.contact_id) AS contact_id, count(DISTINCT c.id)::int AS cases,
            (SELECT count(*)::int FROM orders o2 WHERE o2.phone = o.phone AND o2.status IN ('delivered', 'returned')) AS orders
     FROM cases c JOIN orders o ON o.id = c.order_id
     WHERE c.created_at > now() - interval '180 days' AND c.type IN ('return', 'exchange') AND o.phone <> '0'
       AND NOT EXISTS (SELECT 1 FROM contacts x WHERE x.id = o.contact_id AND x.is_flagged)
     GROUP BY o.phone HAVING count(DISTINCT c.id) >= 3`);
  let made = 0;
  for (const r of rows.filter((r) => r.orders > 0 && r.cases / r.orders >= 0.5)) {
    if (await suggest({
      agent: "triage", kind: "serial_returner", refType: "customer", refId: r.contact_id, dedupe: `triage:serial:${r.phone}:${monthKey()}`, severity: "warn",
      title: `${r.name}: ${r.cases} returns or exchanges from ${r.orders} delivered ${r.orders === 1 ? "order" : "orders"}`,
      detail: "Sends back much more than most customers. Nothing is blocked: flagging them makes the Order guard suggest a call before their next order is confirmed.",
      data: { phone: r.phone, cases: r.cases, orders: r.orders },
    })) made++;
  }
  return made;
}

export async function runTriage(settings) {
  const serial = await findSerialReturners();
  const waiting = await query(
    `SELECT c.id FROM cases c WHERE c.status = 'requested'
       AND NOT EXISTS (SELECT 1 FROM agent_tasks t WHERE t.dedupe = 'triage:case:' || c.id) ORDER BY c.id LIMIT 20`);
  let made = 0;
  for (const c of waiting) if (await triageCase(c.id, settings)) made++;
  // suggestions for requests someone already decided close themselves
  const closed = await query(
    `UPDATE agent_tasks t SET status = 'done', note = 'Decided on the request page', decided_at = now()
     FROM cases c WHERE t.agent = 'triage' AND t.status = 'open' AND t.ref_id = c.id AND c.status <> 'requested' RETURNING t.id`);
  return `${waiting.length} new ${waiting.length === 1 ? "request" : "requests"} looked at, ${made} suggestions made, ${closed.length} closed because they were decided.${serial ? ` ${serial} ${serial === 1 ? "customer returns" : "customers return"} far more than they keep.` : ""}`;
}

/** Called when a request is opened. Never breaks the request if it fails. */
export async function onCaseOpened(caseId) {
  try {
    const { getSettings } = await import("./settings");
    const settings = await getSettings();
    if (settings.agents.triage) await triageCase(caseId, settings);
  } catch (err) {
    console.error("[triage]", err);
  }
}

/* ================= marketing writer ================= */

const monthKey = () => new Date().toISOString().slice(0, 7);
const weekOf = () => { const d = new Date(); const start = new Date(Date.UTC(d.getUTCFullYear(), 0, 1)); return `${d.getUTCFullYear()}-${Math.ceil(((d - start) / 864e5 + start.getUTCDay() + 1) / 7)}`; };

async function draftCampaign(settings, { kind, facts, subject, body }) {
  const better = await aiWrite({
    system: voice(settings),
    prompt: `Write a short marketing message (${kind}) for WhatsApp and email. First line: an email subject under 60 characters starting with "Subject:". ` +
      `Then a blank line and the message, under 90 words, starting with "Hi {{name}}," and ending with the link {{url}}. Use only these facts:\n${facts}`,
    maxTokens: 350,
  });
  if (better) {
    const m = better.match(/^Subject:\s*(.+)\n+([\s\S]+)$/i);
    if (m) return { subject: m[1].trim().slice(0, 140), body: m[2].trim() };
  }
  return { subject, body };
}

/* ---- personal moments, sent by themselves to subscribed customers (switch them off in Settings -> Loyalty) ---- */

const SUBSCRIBED = "(c.email_opt_in OR c.whatsapp_opt_in)";
const contactOf = (c) => ({ email: c.email_opt_in ? c.email : null, phone: c.whatsapp_opt_in ? c.phone : null, contactId: c.id });

/** "You bought X, Y goes with it", birthday wishes and first-order anniversaries. Returns what was sent. */
async function sendMoments(settings) {
  const { notify } = await import("./notify");
  const { listProducts } = await import("./catalog");
  const url = siteUrl();
  const { crm, store } = settings;
  const out = { cross: 0, birthdays: 0, anniversaries: 0 };
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: store.timezone, month: "2-digit", day: "2-digit" }).format(new Date()); // MM-DD
  const year = Number(new Intl.DateTimeFormat("en-CA", { timeZone: store.timezone, year: "numeric" }).format(new Date()));

  if (crm.cross_sell_days > 0) {
    const due = await query(
      `UPDATE orders SET cross_sell_sent_at = now() WHERE id IN (
         SELECT o.id FROM orders o JOIN contacts c ON c.id = o.contact_id
         WHERE o.status = 'delivered' AND o.cross_sell_sent_at IS NULL AND o.channel <> 'store' AND ${SUBSCRIBED}
           AND o.delivered_at < now() - make_interval(days => $1::int) AND o.delivered_at > now() - make_interval(days => $1::int + 14)
         ORDER BY o.id LIMIT 30)
       RETURNING id, contact_id`, [crm.cross_sell_days]);
    if (due.length) {
      const live = (await listProducts()).filter((p) => p.total_stock > 0);
      for (const d of due) {
        const [c] = await query("SELECT * FROM contacts c WHERE id = $1", [d.contact_id]);
        const items = await query("SELECT product_id, name FROM order_items WHERE order_id = $1", [d.id]);
        const owned = new Set((await query("SELECT DISTINCT i.product_id FROM order_items i JOIN orders o ON o.id = i.order_id WHERE o.contact_id = $1", [c.id])).map((r) => r.product_id));
        const bought = live.find((p) => items.some((i) => i.product_id === p.id)) || null;
        const type = (bought?.product_type || "").toLowerCase();
        const pick = live
          .filter((p) => !owned.has(p.id) && (type ? (p.product_type || "").toLowerCase() !== type : true))
          .sort((a, b) => Number(b.category_id === bought?.category_id) - Number(a.category_id === bought?.category_id) || Number(b.is_featured) - Number(a.is_featured))[0];
        if (!c || !pick) continue;
        await notify("cross_sell", { ...contactOf(c), vars: { name: c.name.split(" ")[0] || "there", bought: items[0]?.name || "order", pick: pick.name, url: `${url}/products/${pick.slug}`, unsubscribe_url: `${url}/unsubscribe/${c.token}` } });
        out.cross++;
      }
    }
  }

  if (crm.birthdays) {
    const due = await query(
      `UPDATE contacts c SET birthday_sent_year = $2 WHERE c.birthday = $1 AND COALESCE(c.birthday_sent_year, 0) < $2 AND ${SUBSCRIBED} RETURNING c.*`,
      [today, year]);
    for (const c of due) {
      let gift = "";
      if (crm.birthday_value > 0) {
        const { personalCode } = await import("./crm");
        const code = await personalCode(c.id, { prefix: "BDAY", value: crm.birthday_value, days: 14, note: "Birthday gift" });
        gift = `Here is a small gift: use code ${code} for ${money(crm.birthday_value, store.currency)} off anything in the next 14 days.`;
      }
      await notify("birthday_wish", { ...contactOf(c), vars: { name: c.name.split(" ")[0] || "there", gift, url: `${url}/products`, unsubscribe_url: `${url}/unsubscribe/${c.token}` } });
      out.birthdays++;
    }
  }

  if (crm.anniversaries) {
    const due = await query(
      `UPDATE contacts c SET anniversary_sent_year = $2 FROM (
         SELECT contact_id, min(created_at) AS first FROM orders WHERE status NOT IN ('cancelled') AND contact_id IS NOT NULL GROUP BY contact_id
       ) f
       WHERE f.contact_id = c.id AND to_char(f.first AT TIME ZONE $3, 'MM-DD') = $1 AND extract(year FROM f.first AT TIME ZONE $3)::int < $2
         AND COALESCE(c.anniversary_sent_year, 0) < $2 AND ${SUBSCRIBED}
       RETURNING c.*, ($2 - extract(year FROM f.first AT TIME ZONE $3)::int) AS years`,
      [today, year, store.timezone]);
    for (const c of due) {
      const years = Number(c.years);
      await notify("order_anniversary", { ...contactOf(c), vars: { name: c.name.split(" ")[0] || "there", years: `${years} ${years === 1 ? "year" : "years"}`, url: `${url}/products`, unsubscribe_url: `${url}/unsubscribe/${c.token}` } });
      out.anniversaries++;
    }
  }
  if (out.cross || out.birthdays || out.anniversaries) {
    const { sendSoon } = await import("./notify");
    sendSoon(10);
  }
  return out;
}

export async function runWriter(settings) {
  const moments = await sendMoments(settings);
  const sent = [
    moments.cross && `${moments.cross} "goes with what you bought" ${moments.cross === 1 ? "message" : "messages"}`,
    moments.birthdays && `${moments.birthdays} birthday ${moments.birthdays === 1 ? "wish" : "wishes"}`,
    moments.anniversaries && `${moments.anniversaries} anniversary thank-you${moments.anniversaries === 1 ? "" : "s"}`,
  ].filter(Boolean);
  const store = settings.store.name;
  const fmt = (n) => money(n, settings.store.currency);
  const made = [];
  const [recentCampaign] = await query("SELECT 1 FROM campaigns WHERE created_at > now() - interval '3 days' LIMIT 1");

  // 1. new pieces this week that were not announced
  const fresh = await query(
    `SELECT p.id, p.name, p.slug, p.price, p.category_id, c.name AS category FROM products p LEFT JOIN categories c ON c.id = p.category_id
     WHERE p.status = 'active' AND p.published_at > now() - interval '7 days' ORDER BY p.published_at DESC LIMIT 6`);
  if (fresh.length && !recentCampaign) {
    const oneCat = fresh.every((p) => p.category_id && p.category_id === fresh[0].category_id);
    const names = fresh.map((p) => p.name);
    const draft = await draftCampaign(settings, {
      kind: "new arrivals",
      facts: `${store} just added: ${fresh.map((p) => `${p.name} (${fmt(p.price)})`).join(", ")}.`,
      subject: `New in at ${store}: ${names.slice(0, 2).join(" and ")}${names.length > 2 ? " and more" : ""}`,
      body: `Hi {{name}},\n\nJust landed at {{store}}:\n${fresh.map((p) => `• ${p.name} - ${fmt(p.price)}`).join("\n")}\n\nSizes go quickly. See them here: {{url}}`,
    });
    if (await suggest({
      agent: "writer", kind: "campaign_draft", dedupe: `writer:arrivals:${weekOf()}`, severity: "info",
      title: `Announce ${fresh.length} new ${fresh.length === 1 ? "piece" : "pieces"}`,
      detail: oneCat ? `All from ${fresh[0].category}: sent to people who bought from it before.` : "Sent to everyone who subscribed.",
      data: { name: `New in: ${names[0]}${names.length > 1 ? ` + ${names.length - 1}` : ""}`, ...draft, audience: oneCat ? `category:${fresh[0].category_id}` : "" },
    })) made.push("new pieces");
  }

  // 2. a sale that started and was not announced
  const [sale] = await query(
    `SELECT id, name, percent, ends_at FROM sales WHERE is_active AND announced_at IS NULL AND starts_at <= now() AND starts_at > now() - interval '7 days'
       AND (ends_at IS NULL OR ends_at > now() + interval '1 day') ORDER BY starts_at DESC LIMIT 1`);
  if (sale) {
    const ends = sale.ends_at ? new Intl.DateTimeFormat("en-GB", { timeZone: settings.store.timezone, day: "numeric", month: "short" }).format(sale.ends_at) : null;
    const draft = await draftCampaign(settings, {
      kind: "sale announcement",
      facts: `Sale "${sale.name}": ${sale.percent}% off${ends ? `, ends ${ends}` : ""}. Prices on the site already include the discount.`,
      subject: `${sale.name}: ${sale.percent}% off at ${store}`,
      body: `Hi {{name}},\n\n${sale.name} is on: ${sale.percent}% off${ends ? ` until ${ends}` : ""}. The prices on the site already include the discount.\n\nShop the sale: {{url}}`,
    });
    if (await suggest({
      agent: "writer", kind: "campaign_draft", dedupe: `writer:sale:${sale.id}`, severity: "info",
      title: `Announce the sale “${sale.name}”`, detail: "It started without an announcement.",
      data: { name: `Sale: ${sale.name}`, ...draft, audience: "" },
    })) made.push("sale");
  }

  // 3. customers drifting away
  const { listCustomers } = await import("./crm");
  const risk = (await listCustomers()).filter((c) => c.segment === "risk" && (c.email_opt_in || c.whatsapp_opt_in));
  if (risk.length >= 3) {
    const draft = await draftCampaign(settings, {
      kind: "win-back for customers who have not ordered in a while",
      facts: `They have not ordered for over ${settings.crm.winback_days} days. New pieces are in the shop. Delivery is free over ${fmt(settings.shipping.free_over)}.`,
      subject: `We saved you a look at what's new, {{name}}`,
      body: `Hi {{name}},\n\nIt has been a while. A lot has changed at {{store}}: new pieces across every collection, and free delivery over ${fmt(settings.shipping.free_over)}.\n\nTake a look: {{url}}`,
    });
    if (await suggest({
      agent: "writer", kind: "campaign_draft", dedupe: `writer:winback:${monthKey()}`, severity: "info",
      title: `Win back ${risk.length} customers who stopped ordering`, detail: `Sent only to the "At risk" group (subscribed).`,
      data: { name: `Win-back ${monthKey()}`, ...draft, audience: "segment:risk" },
    })) made.push("win-back");
  }
  const sentLine = sent.length ? ` Sent: ${sent.join(", ")}.` : "";
  return (made.length ? `Drafted: ${made.join(", ")}.` : "No campaign moment right now (no new pieces or sales to announce, few customers drifting away).") + sentLine;
}

/* ================= catalogue checker ================= */

function problemsOf(p) {
  const out = [];
  if (p.photos === 0) out.push("No photos");
  else if (p.photos < 2) out.push("Only one photo (two or more sell better)");
  if (p.description.trim().length < 60) out.push(p.description.trim() ? "Very short description" : "No description");
  if (!p.category_id) out.push("Not in any collection");
  if (!p.sizes) out.push("No sizes");
  if (p.compare_at_price && p.compare_at_price <= p.price) out.push("The 'was' price is not higher than the price");
  if (p.price <= 0) out.push("No price");
  if (p.sizes && p.stock === 0 && !p.sold30) out.push("Every size sold out and nothing sold in 30 days: restock or archive it");
  return out;
}

async function draftDescription(settings, p) {
  const facts = [
    `Product: ${p.name}`, p.category && `Collection: ${p.category}`, p.product_type && `Type: ${p.product_type}`,
    p.fabric && `Fabric: ${p.fabric}`, p.care && `Care: ${p.care}`, p.origin && `Made in: ${p.origin}`,
    p.size_list && `Sizes: ${p.size_list}`, `Price: ${money(p.price, settings.store.currency)}`,
  ].filter(Boolean).join("\n");
  const ai = await aiWrite({
    system: voice(settings),
    prompt: `Write a product description for the shop, 2 or 3 sentences, 40-70 words, confident and specific, no prices, no sizes list, no claims not in the facts:\n${facts}`,
    maxTokens: 220,
  });
  if (ai) return ai;
  // built-in: assembled from the product's own fields
  return [
    `The ${p.name}${p.category ? ` from our ${p.category} collection` : ""}, made to be worn often and kept for years.`,
    p.fabric ? `Made from ${p.fabric.replace(/\.$/, "")}.` : "",
    p.care ? `Care: ${p.care.replace(/\.$/, "")}.` : "",
    p.size_list ? `Available in ${p.size_list}.` : "",
  ].filter(Boolean).join(" ");
}

export async function runCatalogue(settings) {
  const rows = await query(
    `SELECT p.id, p.name, p.description, p.category_id, p.price, p.compare_at_price, p.fabric, p.care, p.origin, p.product_type, c.name AS category,
            (SELECT count(*)::int FROM product_images i WHERE i.product_id = p.id) AS photos,
            (SELECT count(*)::int FROM variants v WHERE v.product_id = p.id) AS sizes,
            (SELECT string_agg(v.size, ', ' ORDER BY v.sort_order, v.id) FROM variants v WHERE v.product_id = p.id) AS size_list,
            (SELECT COALESCE(sum(GREATEST(v.stock - v.reserved, 0)), 0)::int FROM variants v WHERE v.product_id = p.id) AS stock,
            (SELECT COALESCE(sum(i.qty), 0)::int FROM order_items i JOIN orders o ON o.id = i.order_id
             WHERE i.product_id = p.id AND o.status <> 'cancelled' AND o.created_at > now() - interval '30 days') AS sold30
     FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE p.status = 'active' ORDER BY p.id`);
  let made = 0, found = 0;
  const stillBad = [];
  // "only one photo" is advice, not a fault: raised once for all of them, so real problems are not buried
  const ONE_PHOTO = "Only one photo (two or more sell better)";
  const onePhoto = rows.filter((p) => problemsOf(p).includes(ONE_PHOTO));
  if (onePhoto.length) {
    if (await suggest({
      agent: "catalogue", kind: "catalogue_fix", dedupe: `catalogue:onephoto:${weekOf()}`, severity: "info",
      title: `${onePhoto.length} ${onePhoto.length === 1 ? "product has" : "products have"} only one photo`,
      detail: "Two or more photos (front, back, a detail or worn) sell better.",
      data: { problems: onePhoto.map((p) => p.name), draft: null },
    })) made++;
  }
  for (const p of rows) {
    const problems = problemsOf(p).filter((x) => x !== ONE_PHOTO);
    if (!problems.length) continue;
    found++;
    stillBad.push(p.id);
    if (made >= 10) continue; // a handful per run keeps the list (and the AI budget) manageable
    const key = `catalogue:${p.id}:${problems.map((x) => x.slice(0, 12)).join("|")}`;
    const [exists] = await query("SELECT 1 FROM agent_tasks WHERE dedupe = $1", [key]);
    if (exists) continue;
    // problems changed since the last check: the older suggestion for this product is replaced
    await query("UPDATE agent_tasks SET status = 'done', note = 'Replaced by a newer check', decided_at = now() WHERE agent = 'catalogue' AND status = 'open' AND ref_id = $1 AND dedupe <> $2", [p.id, key]);
    const needsText = problems.some((x) => x.includes("description"));
    const draft = needsText ? await draftDescription(settings, p) : null;
    // Auto (off by default): a product with no description at all gets the draft straight away
    const auto = settings.agents.catalogue_auto && draft && problems.includes("No description");
    if (auto) await applyDescription(p.id, draft);
    // what is still left for a person once Auto has written the description
    const left = auto ? problems.filter((x) => x !== "No description") : problems;
    if (await suggest({
      agent: "catalogue", kind: "catalogue_fix", refType: "product", refId: p.id, dedupe: key,
      severity: left.some((x) => x.startsWith("No photos") || x.startsWith("No price") || x.startsWith("No sizes")) ? "warn" : "info",
      title: left.length ? `${p.name}: ${left.length} ${left.length === 1 ? "thing" : "things"} to fix` : `${p.name}: description written`,
      detail: (left.length ? left.join(". ") + "." : "") + (auto ? `${left.length ? " " : ""}A description was written and saved automatically.` : ""),
      data: { problems: left, draft: auto ? null : draft },
      status: left.length ? "open" : "done", note: auto && !left.length ? "Description saved automatically (Auto mode)" : "",
    })) made++;
  }
  const fixed = await query(
    `UPDATE agent_tasks SET status = 'done', note = 'Fixed on the product', decided_at = now()
     WHERE agent = 'catalogue' AND status = 'open' AND ref_id IS NOT NULL AND NOT (ref_id = ANY($1::int[])) RETURNING id`, [stillBad]);
  return `${rows.length} products checked: ${found} with something to fix${onePhoto.length ? `, ${onePhoto.length} with only one photo` : ""} (${made} new suggestions). ${fixed.length} closed because they were fixed.`;
}

/* ================= chat coach ================= */

const COACH_STOP = new Set("a an the i you we it is are am do does did can could would should will to of in on for at with and or my your our me this that there here please hi hello salam aoa plz pls kya hai ka ki ke ko se me mein".split(" "));

/**
 * Questions the chat could not answer in the last two weeks, grouped by their main words. Each becomes a
 * suggestion: write the answer once and it is saved as a ready answer the assistant uses from then on.
 */
export async function runCoach() {
  const rows = await query(
    `SELECT m.body FROM chat_messages m
     WHERE m.sender = 'customer' AND (m.meta->>'miss') = 'true' AND m.created_at > now() - interval '14 days'
     ORDER BY m.id DESC LIMIT 400`);
  const groups = new Map();
  for (const { body } of rows) {
    const clean = String(body).toLowerCase().replace(/['’`]/g, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
    if (clean.length < 6 || /^\d[\d\s]*$/.test(clean)) continue;
    const main = clean.split(" ").filter((w) => w.length > 2 && !COACH_STOP.has(w));
    if (!main.length) continue;
    const key = [...new Set(main)].sort().slice(0, 5).join(" ");
    const g = groups.get(key) || { n: 0, sample: String(body).trim().slice(0, 200), words: main };
    g.n++;
    groups.set(key, g);
  }
  const top = [...groups.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 5);
  let made = 0;
  for (const [key, g] of top) {
    const keywords = [...new Set(g.words)].slice(0, 3).join(", ");
    if (await suggest({
      agent: "coach", kind: "faq_suggest", dedupe: `coach:${key}`, severity: g.n >= 3 ? "warn" : "info",
      title: `Customers asked: “${g.sample}”${g.n > 1 ? ` (${g.n} times)` : ""}`,
      detail: "The assistant could not answer this. Write the answer once and it will use it from now on.",
      data: { question: g.sample, keywords, n: g.n },
    })) made++;
  }
  return rows.length
    ? `${rows.length} unanswered ${rows.length === 1 ? "question" : "questions"} in 14 days, ${groups.size} different ${groups.size === 1 ? "topic" : "topics"}: ${made} new ${made === 1 ? "suggestion" : "suggestions"} to add an answer.`
    : "Every question in the last 14 days was answered.";
}

/** Applies an approved catalogue suggestion: saves the drafted description on the product. */
export async function applyDescription(productId, text) {
  const clean = String(text || "").trim().slice(0, 4000);
  if (clean.length < 20) return { error: "The description is too short." };
  await query("UPDATE products SET description = $2 WHERE id = $1", [productId, clean]);
  return { ok: true };
}

/** A reply draft for a chat in the Inbox: the assistant's answer, or a polite holding reply. Never sent by itself. */
export async function draftReply(conversationId, settings) {
  const [conv] = await query("SELECT * FROM conversations WHERE id = $1", [conversationId]);
  if (!conv) return { error: "Chat not found." };
  const history = (await query("SELECT sender, body FROM chat_messages WHERE conversation_id = $1 AND sender <> 'system' ORDER BY id DESC LIMIT 12", [conv.id])).reverse();
  const last = [...history].reverse().find((m) => m.sender === "customer");
  if (!last) return { error: "The customer has not written anything yet." };
  const first = (conv.name || "").split(" ")[0] || "there";
  try {
    const { answer } = await import("./assistant");
    const res = await answer({ text: last.body, conversation: { ...conv, misses: 0 }, history: history.slice(0, -1) });
    if (res?.text && !res.handoff && !res.miss) return { ok: true, text: res.text, via: res.via || "assistant" };
  } catch (err) {
    console.error("[draft]", err);
  }
  // the assistant could not answer: a short holding reply, written by the AI if one is connected
  const ai = await aiWrite({
    system: voice(settings),
    prompt: `A customer wrote: "${last.body.slice(0, 600)}". Write a short, kind reply from the shop's team (under 50 words) that acknowledges exactly what they asked and says a team member is checking and will reply shortly. Do not invent any facts.`,
    maxTokens: 160,
  });
  return { ok: true, text: ai || `Hi ${first}, thank you for your message. Let me check this for you and I will get back to you shortly.`, via: ai ? "ai" : "built-in" };
}

export { siteUrl };
