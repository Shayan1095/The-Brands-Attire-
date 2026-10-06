import "server-only";
import { query } from "./db";
import { getSettings } from "./settings";
import { variantLabel } from "./format";

/*
  Stock insights: what is selling, what is stuck, what will run out and how much to reorder.

  Demand per size = units sold per day, weighted towards the last 7 days (60%) over the last 30 (40%),
  so a size that has just taken off is noticed quickly. Only orders that actually left stock count
  (confirmed or later; cancelled and returned ones are ignored).

  Seasonality: when the shop has sales from this time last year, demand is scaled by how much the
  coming 30 days outsold the previous 30 days back then (capped between half and double). With less
  than a year of history the factor is simply 1.

  Reorder suggestion = demand x (supplier lead time + days of cover wanted) - what is available now.
*/
export async function stockInsights() {
  const { inventory } = await getSettings();
  const lead = Math.max(0, Number(inventory.lead_days) || 0);
  const cover = Math.max(1, Number(inventory.cover_days) || 21);

  const [rows, [season], losses] = await Promise.all([
    query(
      `SELECT v.id, v.size, v.color, v.sku, v.stock, v.reserved, p.id AS product_id, p.name, p.product_type, p.low_stock_threshold AS low_at,
              COALESCE(c.name, '') AS category, p.published_at,
              (SELECT thumb_url FROM product_images i WHERE i.product_id = p.id ORDER BY i.sort_order, i.id LIMIT 1) AS image,
              COALESCE(s.d7, 0)::int AS d7, COALESCE(s.d30, 0)::int AS d30
       FROM variants v JOIN products p ON p.id = v.product_id LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN (
         SELECT i.variant_id,
                sum(i.qty) FILTER (WHERE o.created_at > now() - interval '7 days') AS d7,
                sum(i.qty) AS d30
         FROM order_items i JOIN orders o ON o.id = i.order_id
         WHERE o.status IN ('confirmed', 'packed', 'shipped', 'delivered') AND o.created_at > now() - interval '30 days'
         GROUP BY i.variant_id
       ) s ON s.variant_id = v.id
       WHERE p.status = 'active'
       ORDER BY p.name, v.sort_order, v.id`
    ),
    query(
      `SELECT
         COALESCE(sum(i.qty) FILTER (WHERE o.created_at >= now() - interval '1 year' AND o.created_at < now() - interval '1 year' + interval '30 days'), 0)::int AS ahead,
         COALESCE(sum(i.qty) FILTER (WHERE o.created_at >= now() - interval '1 year' - interval '30 days' AND o.created_at < now() - interval '1 year'), 0)::int AS behind
       FROM order_items i JOIN orders o ON o.id = i.order_id
       WHERE o.status IN ('confirmed', 'packed', 'shipped', 'delivered')
         AND o.created_at >= now() - interval '1 year' - interval '30 days' AND o.created_at < now() - interval '1 year' + interval '30 days'`
    ),
    query(
      `SELECT type, COALESCE(sum(qty), 0)::int AS units FROM stock_movements
       WHERE type IN ('damaged', 'return', 'lost') AND created_at > now() - interval '30 days' GROUP BY type`
    ),
  ]);

  // needs a meaningful sample from last year before it is trusted
  const hasHistory = season.ahead >= 20 && season.behind >= 20;
  const factor = hasHistory ? Math.min(2, Math.max(0.5, season.ahead / season.behind)) : 1;

  const variants = rows.map((r) => {
    const available = Math.max(0, r.stock - r.reserved);
    const rate = ((r.d7 / 7) * 0.6 + (r.d30 / 30) * 0.4) * factor; // units per day
    const daysLeft = rate > 0 ? available / rate : null;
    const suggest = rate > 0 ? Math.max(0, Math.ceil(rate * (lead + cover) - available)) : 0;
    return {
      id: r.id, productId: r.product_id, name: r.name, label: variantLabel(r), sku: r.sku, image: r.image, category: r.category, type: r.product_type,
      onHand: r.stock, reserved: r.reserved, available, sold7: r.d7, sold30: r.d30,
      perWeek: Math.round(rate * 70) / 10, daysLeft: daysLeft === null ? null : Math.floor(daysLeft), suggest,
      // will it run out before a new delivery could arrive?
      urgent: daysLeft !== null && daysLeft <= Math.max(lead, 3),
    };
  });

  // per product: how fast it moves and how much is sitting
  const byProduct = new Map();
  for (const v of variants) {
    const p = byProduct.get(v.productId) || { id: v.productId, name: v.name, image: v.image, category: v.category, sold30: 0, sold7: 0, available: 0 };
    p.sold30 += v.sold30; p.sold7 += v.sold7; p.available += v.available;
    byProduct.set(v.productId, p);
  }
  const products = [...byProduct.values()].map((p) => ({
    ...p,
    // share of what was available this month that sold
    sellThrough: p.sold30 + p.available ? Math.round((p.sold30 / (p.sold30 + p.available)) * 100) : 0,
  }));

  return {
    lead, cover, factor, hasHistory,
    restock: variants.filter((v) => v.suggest > 0).sort((a, b) => (a.daysLeft ?? 1e9) - (b.daysLeft ?? 1e9)),
    runningOut: variants.filter((v) => v.urgent && v.available > 0),
    fast: products.filter((p) => p.sold30 > 0).sort((a, b) => b.sold30 - a.sold30).slice(0, 8),
    slow: products.filter((p) => p.sold30 === 0 && p.available > 0).sort((a, b) => b.available - a.available).slice(0, 8),
    losses: Object.fromEntries(losses.map((l) => [l.type, l.units])),
    totals: {
      units: variants.reduce((s, v) => s + v.onHand, 0),
      reserved: variants.reduce((s, v) => s + v.reserved, 0),
      toOrder: variants.reduce((s, v) => s + v.suggest, 0),
      stuck: products.filter((p) => p.sold30 === 0).reduce((s, p) => s + p.available, 0),
    },
  };
}
