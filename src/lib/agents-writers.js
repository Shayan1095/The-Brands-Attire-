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

export async function runTriage(settings) {
  const waiting = await query(
    `SELECT c.id FROM cases c WHERE c.status = 'requested'
       AND NOT EXISTS (SELECT 1 FROM agent_tasks t WHERE t.dedupe = 'triage:case:' || c.id) ORDER BY c.id LIMIT 20`);
  let made = 0;
  for (const c of waiting) if (await triageCase(c.id, settings)) made++;
  // suggestions for requests someone already decided close themselves
  const closed = await query(
    `UPDATE agent_tasks t SET status = 'done', note = 'Decided on the request page', decided_at = now()
     FROM cases c WHERE t.agent = 'triage' AND t.status = 'open' AND t.ref_id = c.id AND c.status <> 'requested' RETURNING t.id`);
  return `${waiting.length} new ${waiting.length === 1 ? "request" : "requests"} looked at, ${made} suggestions made, ${closed.length} closed because they were decided.`;
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

export async function runWriter(settings) {
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
  return made.length ? `Drafted: ${made.join(", ")}.` : "No campaign moment right now (no new pieces or sales to announce, few customers drifting away).";
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
