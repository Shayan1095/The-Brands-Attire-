import "server-only";
import { query } from "./db";
import { getSettings, saveSetting } from "./settings";
import { stockInsights } from "./insights";
import { listProducts } from "./catalog";
import { aiWrite, voice } from "./ai";
import { SHOWCASE_SECTIONS } from "./showcase-sections";
import { suggest } from "./agents-writers";

/*
  Phase 3 agents.

    merch     the merchandiser: puts slow pieces forward for a clear-out sale, cleans sold-out or hidden pieces out of
              hand-picked Showcase sections, and points out a best seller the Showcase is not featuring
    feedback  the feedback analyst: reads returns and ratings per product and finds the pattern behind them
              (runs small / large, quality complaints, low ratings); a fit pattern becomes a fit tip on the product page

  Auto mode (off by default, Admin -> Agents): the merchandiser may clean the Showcase by itself and the analyst may
  publish fit tips by itself. Sales and anything customers are sent always wait for the owner.
*/

const week = () => { const d = new Date(); const s = new Date(Date.UTC(d.getUTCFullYear(), 0, 1)); return `${d.getUTCFullYear()}-${Math.ceil(((d - s) / 864e5 + s.getUTCDay() + 1) / 7)}`; };
const month = () => new Date().toISOString().slice(0, 7);
const AGENT = { id: null, name: "Merchandiser agent" };

/* ================= merchandiser ================= */

/**
 * Removes products that cannot be shown (sold out, hidden, deleted) from the hand-picked Showcase sections.
 * Checked again at the moment it runs: a piece that came back in stock since the suggestion is kept.
 */
export async function cleanShowcase(remove) {
  const settings = await getSettings();
  const sc = structuredClone(settings.showcase || {});
  const live = new Map((await listProducts()).map((p) => [p.id, p]));
  const dead = (id) => { const p = live.get(Number(id)); return !p || p.total_stock === 0; };
  let n = 0;
  for (const [key, ids] of Object.entries(remove || {})) {
    const s = sc.sections?.[key];
    if (!s?.items) continue;
    const drop = new Set(ids.map(Number).filter(dead));
    const before = s.items.length;
    s.items = s.items.filter((i) => !drop.has(Number(i.id)));
    n += before - s.items.length;
  }
  if (n) await saveSetting("showcase", sc);
  return { ok: true, removed: n };
}

/** Starts a clear-out sale on the given products. */
export async function startClearout(productIds, percent, days) {
  const ids = (productIds || []).map(Number).filter(Boolean);
  const pct = Math.min(70, Math.max(5, Math.round(Number(percent) || 20)));
  const len = Math.min(60, Math.max(1, Math.round(Number(days) || 14)));
  if (!ids.length) return { error: "No products to put on sale." };
  const name = `Clear-out ${new Intl.DateTimeFormat("en-GB", { month: "long" }).format(new Date())}`;
  await query(
    `INSERT INTO sales (name, percent, scope, product_ids, starts_at, ends_at, is_active) VALUES ($1, $2, 'products', $3::int[], now(), now() + make_interval(days => $4::int), true)`,
    [name, pct, ids, len]
  );
  return { ok: true, name, percent: pct, days: len };
}

export async function runMerch(settings) {
  const made = [];
  const live = await listProducts();
  const byId = new Map(live.map((p) => [p.id, p]));

  // 1. slow pieces: nothing sold for 30 days, stock sitting, not new, not already reduced
  const ins = await stockInsights();
  const slow = ins.slow
    .map((s) => byId.get(s.id))
    .filter((p) => p && !(p.off > 0) && p.total_stock > 0 && (!p.published_at || new Date(p.published_at) < new Date(Date.now() - 30 * 864e5)));
  // an earlier week's clear-out suggestion is replaced by this week's list (or closes when nothing is slow now)
  await query("UPDATE agent_tasks SET status = 'done', note = $2, decided_at = now() WHERE agent = 'merch' AND kind = 'clearout' AND status = 'open' AND dedupe <> $1",
    [`merch:clearout:${week()}`, slow.length ? "Replaced by this week's list" : "No longer needed"]);
  if (slow.length) {
    const units = slow.reduce((n, p) => n + p.total_stock, 0);
    if (await suggest({
      agent: "merch", kind: "clearout", dedupe: `merch:clearout:${week()}`, severity: "info",
      title: `Put ${slow.length} slow ${slow.length === 1 ? "piece" : "pieces"} on a clear-out sale`,
      detail: `Nothing sold in 30 days and ${units} units are sitting in stock. A short sale frees the space and the cash; the Marketing writer will offer to announce it.`,
      data: { products: slow.map((p) => ({ id: p.id, name: p.name, stock: p.total_stock })), percent: 20, days: 14 },
    })) made.push("clear-out sale");
  }

  // 2. hand-picked Showcase sections showing pieces that cannot be bought
  const sections = settings.showcase?.sections || {};
  const remove = {};
  const lines = [];
  for (const [key, s] of Object.entries(sections)) {
    if (s?.mode !== "pick" || !s.items?.length) continue;
    const dead = s.items.filter((i) => { const p = byId.get(Number(i.id)); return !p || p.total_stock === 0; });
    if (dead.length) {
      remove[key] = dead.map((i) => Number(i.id));
      lines.push(`${SHOWCASE_SECTIONS[key]?.label || key}: ${dead.length} sold out or hidden`);
    }
  }
  const cleanKey = `merch:clean:${week()}:${Object.values(remove).flat().join(",")}`;
  // an older clean-up suggestion that no longer matches (pieces back in stock, or picks changed) closes itself
  await query("UPDATE agent_tasks SET status = 'done', note = 'No longer needed', decided_at = now() WHERE agent = 'merch' AND kind = 'showcase_clean' AND status = 'open' AND dedupe <> $1", [cleanKey]);
  if (lines.length) {
    const auto = settings.agents.merch_auto;
    if (auto) await cleanShowcase(remove);
    if (await suggest({
      agent: "merch", kind: "showcase_clean", dedupe: cleanKey, severity: "warn",
      title: auto ? "Cleaned sold-out pieces out of the Showcase" : "Remove sold-out pieces from your Showcase picks",
      detail: lines.join(". ") + ". The shop already skips them, but the sections may look thin.",
      data: { remove }, status: auto ? "done" : "open", note: auto ? "Done automatically (Auto mode)" : "",
    })) made.push("showcase clean-up");
  }

  // 3. a best seller the Showcase is not featuring (only when sections are hand-picked)
  const picked = new Set(Object.values(sections).filter((s) => s?.mode === "pick").flatMap((s) => (s.items || []).map((i) => Number(i.id))));
  if (picked.size) {
    // a featured product's suggestion closes itself once it is in a section
    await query("UPDATE agent_tasks SET status = 'done', note = 'Now in the Showcase', decided_at = now() WHERE agent = 'merch' AND kind = 'feature' AND status = 'open' AND ref_id = ANY($1::int[])", [[...picked]]);
    const top = await query(
      `SELECT i.product_id AS id, sum(i.qty)::int AS units FROM order_items i JOIN orders o ON o.id = i.order_id
       WHERE o.status <> 'cancelled' AND o.created_at > now() - interval '30 days' AND i.product_id IS NOT NULL
       GROUP BY i.product_id ORDER BY units DESC LIMIT 5`);
    const best = top.find((b) => b.units >= 2 && !picked.has(b.id) && byId.get(b.id)?.total_stock > 0);
    const p = best && byId.get(best.id);
    if (p) {
      if (await suggest({
        agent: "merch", kind: "feature", refType: "product", refId: p.id, dedupe: `merch:feature:${p.id}:${month()}`, severity: "info",
        title: `Feature ${p.name}: ${top[0].id === p.id ? "your best seller" : "one of your best sellers"} this month`,
        detail: `${best.units} sold in 30 days, but none of your hand-picked Showcase sections shows it.`,
        data: { units: best.units },
      })) made.push("feature a best seller");
    }
  }
  return made.length ? `Suggested: ${made.join(", ")}.` : "Nothing to change: no slow pieces, the Showcase picks are all in stock.";
}

/* ================= feedback analyst ================= */

const SMALL = /\b(small|tight|short|narrow|chota|chhota|choti|tang|kam)\b/i;
const LARGE = /\b(big|large|loose|long|wide|bara|bada|bari|dheela|dhila|khula)\b/i;

export async function runFeedback(settings) {
  const [sizeCases, faultCases, ratings] = await Promise.all([
    query(
      `SELECT ci.product_id, p.name, p.fit_note, string_agg(c.details, ' | ') AS words, count(DISTINCT c.id)::int AS n
       FROM case_items ci JOIN cases c ON c.id = ci.case_id JOIN products p ON p.id = ci.product_id
       WHERE c.reason = 'size' AND c.status <> 'rejected' AND c.created_at > now() - interval '120 days' AND p.status = 'active'
       GROUP BY ci.product_id, p.name, p.fit_note HAVING count(DISTINCT c.id) >= 2`),
    query(
      `SELECT ci.product_id, p.name, count(DISTINCT c.id)::int AS n, string_agg(DISTINCT c.reason, ',') AS reasons
       FROM case_items ci JOIN cases c ON c.id = ci.case_id JOIN products p ON p.id = ci.product_id
       WHERE c.reason IN ('defective', 'not_as_described', 'quality') AND c.status <> 'rejected' AND c.created_at > now() - interval '120 days'
       GROUP BY ci.product_id, p.name HAVING count(DISTINCT c.id) >= 2`),
    query(
      `SELECT i.product_id, p.name, round(avg(f.rating), 1)::float AS avg, count(*)::int AS n, string_agg(NULLIF(f.comment, ''), ' | ') AS words
       FROM feedback f JOIN order_items i ON i.order_id = f.order_id JOIN products p ON p.id = i.product_id
       WHERE f.created_at > now() - interval '120 days' AND p.status = 'active'
       GROUP BY i.product_id, p.name HAVING count(*) >= 2 AND avg(f.rating) <= 3`),
  ]);
  const made = [];

  for (const s of sizeCases) {
    const words = `${s.words || ""}`;
    const small = SMALL.test(words), large = LARGE.test(words);
    const builtIn = small && !large ? "Runs small: most customers who exchanged went one size up."
      : large && !small ? "Runs large: if you are between sizes, choose the smaller one."
      : "Fit varies on this piece: if you are between sizes, message us before ordering and we will help.";
    const ai = await aiWrite({
      system: voice(settings),
      prompt: `Write one short fit tip (under 18 words) for a product page. Facts: ${s.n} customers exchanged "${s.name}" for a different size. What they said: "${words.slice(0, 500)}". Base the tip only on what they said; if unclear, advise messaging the shop when between sizes.`,
      maxTokens: 60,
    });
    const note = (ai || builtIn).split("\n")[0].slice(0, 200);
    if (s.fit_note && s.fit_note === note) continue;
    // Auto publishes only the built-in tips: an AI tip is written from what customers typed, so a person checks it
    const auto = settings.agents.feedback_auto && !ai;
    if (auto) await query("UPDATE products SET fit_note = $2 WHERE id = $1", [s.product_id, note]);
    if (await suggest({
      agent: "feedback", kind: "fit_note", refType: "product", refId: s.product_id, dedupe: `feedback:fit:${s.product_id}:${month()}`, severity: "warn",
      title: `${s.name}: ${s.n} size exchanges, ${small && !large ? "it runs small" : large && !small ? "it runs large" : "the fit is unclear"}`,
      detail: `${s.n} customers swapped it for another size in the last 4 months. A fit tip above the sizes stops the next exchange.`,
      data: { note, n: s.n, quotes: words.slice(0, 300) }, status: auto ? "done" : "open", note: auto ? "Fit tip published automatically (Auto mode)" : "",
    })) made.push(`fit tip for ${s.name}`);
  }

  for (const f of faultCases) {
    if (await suggest({
      agent: "feedback", kind: "quality", refType: "product", refId: f.product_id, dedupe: `feedback:quality:${f.product_id}:${month()}`, severity: "bad",
      title: `${f.name}: ${f.n} quality complaints`,
      detail: `${f.n} returns for being faulty or not as described in 4 months. Check the stock you have and talk to the supplier.`,
      data: { reasons: f.reasons },
    })) made.push(`quality check for ${f.name}`);
  }

  for (const r of ratings) {
    if (await suggest({
      agent: "feedback", kind: "low_rating", refType: "product", refId: r.product_id, dedupe: `feedback:rating:${r.product_id}:${month()}`, severity: "warn",
      title: `${r.name}: rated ${r.avg} of 5 by ${r.n} customers`,
      detail: r.words ? `What they said: ${r.words.slice(0, 300)}` : "Low ratings without comments: worth a look at the photos, description and quality.",
      data: { avg: r.avg, n: r.n },
    })) made.push(`low rating for ${r.name}`);
  }
  return made.length ? `Found: ${made.join(", ")}.` : "No pattern yet: no product has repeated size exchanges, quality complaints or low ratings.";
}

export { AGENT };
