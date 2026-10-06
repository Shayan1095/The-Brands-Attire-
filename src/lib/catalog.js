import "server-only";
import { query } from "./db";

/** Sales that are switched on and inside their date window. */
export async function getActiveSales() {
  return query(
    `SELECT id, name, percent, scope, category_id, product_ids, ends_at
     FROM sales WHERE is_active AND starts_at <= now() AND (ends_at IS NULL OR ends_at > now())`
  );
}

/**
 * Works out what the customer pays. Adds:
 *   final_price    - price after the best applicable sale
 *   original_price - struck-through price (null when there is no discount)
 *   off            - discount in percent
 */
export function applyPricing(p, sales) {
  let best = null;
  for (const s of sales) {
    const hit =
      s.scope === "all" ||
      (s.scope === "category" && s.category_id === p.category_id) ||
      (s.scope === "products" && s.product_ids.includes(p.id));
    if (hit && (!best || s.percent > best.percent)) best = s;
  }
  const original = Math.max(p.price, p.compare_at_price || 0);
  const final = best ? Math.round((p.price * (100 - best.percent)) / 100) : p.price;
  p.final_price = final;
  p.original_price = original > final ? original : null;
  p.off = p.original_price ? Math.round((1 - final / original) * 100) : 0;
  p.sale_name = best?.name || null;
  return p;
}

const SELECT = `
  SELECT p.*, c.name AS category_name, c.slug AS category_slug,
    COALESCE((SELECT json_agg(json_build_object('id', i.id, 'url', i.url, 'thumb', i.thumb_url) ORDER BY i.sort_order, i.id)
              FROM product_images i WHERE i.product_id = p.id), '[]'::json) AS images,
    COALESCE((SELECT json_agg(json_build_object('id', v.id, 'size', v.size, 'color', v.color, 'sku', v.sku,
                'stock', GREATEST(v.stock - v.reserved, 0), 'on_hand', v.stock, 'reserved', v.reserved) ORDER BY v.sort_order, v.id)
              FROM variants v WHERE v.product_id = p.id), '[]'::json) AS variants
  FROM products p LEFT JOIN categories c ON c.id = p.category_id`;

function finish(rows, sales) {
  for (const p of rows) {
    applyPricing(p, sales);
    p.total_stock = p.variants.reduce((s, v) => s + v.stock, 0);
  }
  return rows;
}

/** Products visible in the shop, already priced. Filtering/sorting by price happens here because sales change prices. */
export async function listProducts({ category, q, sale, sort, limit, excludeId } = {}) {
  const where = ["p.status = 'active'"];
  const params = [];
  if (category) { params.push(category); where.push(`c.slug = $${params.length}`); }
  if (excludeId) { params.push(excludeId); where.push(`p.id <> $${params.length}`); }
  if (q) {
    params.push(`%${q.trim().toLowerCase()}%`);
    where.push(`lower(p.name || ' ' || p.description || ' ' || p.fabric || ' ' || COALESCE(c.name, '')) LIKE $${params.length}`);
  }
  const [rows, sales] = await Promise.all([
    query(`${SELECT} WHERE ${where.join(" AND ")} ORDER BY p.published_at DESC NULLS LAST, p.id DESC`, params),
    getActiveSales(),
  ]);
  let list = finish(rows, sales);
  if (sale) list = list.filter((p) => p.off > 0);
  if (sort === "price-asc") list.sort((a, b) => a.final_price - b.final_price);
  else if (sort === "price-desc") list.sort((a, b) => b.final_price - a.final_price);
  else if (sort === "featured") list.sort((a, b) => Number(b.is_featured) - Number(a.is_featured));
  return limit ? list.slice(0, limit) : list;
}

export async function getProductBySlug(slug) {
  const [rows, sales] = await Promise.all([
    query(`${SELECT} WHERE p.slug = $1 AND p.status = 'active'`, [slug]),
    getActiveSales(),
  ]);
  return finish(rows, sales)[0] || null;
}

/** Admin: every product regardless of status. */
export async function listAllProducts() {
  const [rows, sales] = await Promise.all([query(`${SELECT} ORDER BY p.id DESC`), getActiveSales()]);
  return finish(rows, sales);
}

export async function getProductById(id) {
  const [rows, sales] = await Promise.all([query(`${SELECT} WHERE p.id = $1`, [id]), getActiveSales()]);
  return finish(rows, sales)[0] || null;
}

export async function listCategories({ all = false } = {}) {
  return query(
    `SELECT c.*, (SELECT count(*)::int FROM products p WHERE p.category_id = c.id AND p.status = 'active') AS product_count
     FROM categories c ${all ? "" : "WHERE c.is_active"} ORDER BY c.sort_order, c.id`
  );
}

/** The slim shape product cards need in the browser. */
export const toCard = (p) => ({
  id: p.id,
  slug: p.slug,
  name: p.name,
  category: p.category_name,
  price: p.final_price,
  was: p.original_price,
  off: p.off,
  badge: p.badge,
  images: p.images.slice(0, 2),
  variants: p.variants.map(({ id, size, color, stock }) => ({ id, size, color, stock })),
  soldOut: p.total_stock === 0,
});
