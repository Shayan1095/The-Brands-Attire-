/*
  Shop search, worked out in memory over the active catalogue (small enough for a clothing shop).

  - every word typed must match somewhere ("black jacket" finds a black jacket, in any order)
  - where it matches decides the order: name > collection / type > colour > fabric > description
  - a word matching the start of a word ("jack" -> "jacket") counts more than one found inside a word
  - nothing found: each word is checked against the shop's own vocabulary for a likely typo
    ("jaket" -> "jacket") and the corrected search is returned with a "did you mean" note
*/

const FIELDS = [["name", 6], ["category", 4], ["type", 4], ["colors", 3], ["fabric", 2], ["description", 1]];

export const words = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}\s-]/gu, " ").split(/[\s-]+/).filter(Boolean);

/** The searchable text of a product, field by field. */
function fieldsOf(p) {
  return {
    name: p.name, category: p.category_name || "", type: p.product_type || "",
    colors: [...new Set(p.variants.map((v) => v.color).filter(Boolean))].join(" "),
    fabric: p.fabric || "", description: p.description || "",
  };
}

/** Score of one product for the query words, or 0 when any word is missing. */
function score(p, qWords, phrase) {
  const f = fieldsOf(p);
  const tokens = Object.fromEntries(FIELDS.map(([k]) => [k, words(f[k])]));
  let total = 0;
  for (const w of qWords) {
    let best = 0;
    for (const [k, weight] of FIELDS) {
      const t = tokens[k];
      if (t.some((x) => x === w)) best = Math.max(best, weight * 1.2);
      else if (t.some((x) => x.startsWith(w))) best = Math.max(best, weight);
      else if (w.length >= 3 && t.some((x) => x.includes(w))) best = Math.max(best, weight * 0.5);
    }
    if (!best) return 0;
    total += best;
  }
  const name = p.name.toLowerCase();
  if (name.startsWith(phrase)) total += 8;
  else if (name.includes(phrase)) total += 4;
  if (p.total_stock > 0) total += 1;
  return total;
}

/** Products matching the query, best first (ties: newest first, as the list arrives). */
export function rank(products, q) {
  const qWords = words(q);
  if (!qWords.length) return [];
  const phrase = qWords.join(" ");
  return products.map((p, i) => ({ p, s: score(p, qWords, phrase), i }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.p);
}

function distance(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 9;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length];
}

/** "jaket hodie" -> "jacket hoodie" using the words the shop actually uses; null when nothing better is found. */
export function correct(products, q) {
  const vocab = new Set();
  for (const p of products) {
    const f = fieldsOf(p);
    for (const k of ["name", "category", "type", "colors", "fabric"]) words(f[k]).forEach((w) => w.length >= 3 && vocab.add(w));
  }
  let changed = false;
  const fixed = words(q).map((w) => {
    if (vocab.has(w) || [...vocab].some((v) => v.startsWith(w))) return w;
    let best = w, bestD = w.length <= 4 ? 1 : 2;
    for (const v of vocab) {
      const d = distance(w, v);
      if (d <= bestD && (d < bestD || best === w)) { best = v; bestD = d; }
    }
    if (best !== w) changed = true;
    return best;
  });
  return changed ? fixed.join(" ") : null;
}

/** Fallback when no product has every word: products matching most of the words, best first. */
export function rankAny(products, q) {
  const qWords = words(q);
  if (qWords.length < 2) return [];
  const hits = new Map();
  for (const w of qWords) rank(products, w).forEach((p, i) => {
    const h = hits.get(p.id) || { p, n: 0, pos: 0 };
    h.n += 1;
    h.pos += i;
    hits.set(p.id, h);
  });
  return [...hits.values()].sort((a, b) => b.n - a.n || a.pos - b.pos).map((h) => h.p);
}
