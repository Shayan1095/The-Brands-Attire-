"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { verifyPassword, hashPassword } from "@db/password.mjs";
import { query, tx } from "./db";
import { requireAdmin, requirePerm, createSession, destroySession } from "./auth";
import { getSettings, saveSetting, siteUrl, DEFAULT_SETTINGS } from "./settings";
import { saveImage, saveBanner } from "./images";
import { setOrderStatus, notifyBackInStock, createManualOrder, assignOrder, addOrderNote, findDuplicates } from "./orders";
import { broadcast, processQueue, sendSoon, EVENTS } from "./notify";
import { staffReply, updateConversation } from "./inbox";
import { answer, fullText } from "./assistant";
import { slugify, money, fmtDate, normalizePhone, can, BANNER_PLACEMENTS, PERMISSIONS, STOCK_REASONS } from "./format";
import { SHOWCASE_SECTIONS, SHOWCASE_PHOTOS } from "./showcase-sections";

/* Every action except login starts with requireAdmin(): server actions are public HTTP endpoints. */

const str = (v, max = 500) => String(v ?? "").trim().slice(0, max);
const int = (v, fallback = 0) => (Number.isFinite(parseInt(v, 10)) ? parseInt(v, 10) : fallback);
// date inputs arrive as local wall-clock text ("2026-10-05T18:00"); SQL converts them using the store's timezone
const localText = (v) => (/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?/.test(String(v || "")) ? String(v) : null);

/* ---------------- auth ---------------- */


export async function loginAction(_prev, formData) {
  const email = str(formData.get("email")).toLowerCase();
  const password = String(formData.get("password") || "");
  // kept in the database, not in memory: on Vercel every request can land on a fresh server, which would
  // reset an in-memory count. 8 tries per account and 30 per visitor every 15 minutes.
  const { allow, limit } = await import("./limits");
  if (!(await allow(`login:${email}`, 8, 900)) || !(await limit("login", 30, 900))) return { error: "Too many attempts. Please wait 15 minutes." };

  const [admin] = await query("SELECT * FROM admins WHERE email = $1", [email]);
  if (!admin || !admin.is_active || !verifyPassword(password, admin.password_hash)) {
    return { error: "Wrong email or password." };
  }
  await createSession(admin);
  redirect("/admin");
}

export async function logoutAction() {
  await destroySession();
  redirect("/admin/login");
}

/* ---------------- images ---------------- */

/** Receives one photo and returns the standardised website versions. */
export async function uploadImageAction(formData) {
  const admin = await requirePerm("products");
  const file = formData.get("file");
  if (!file || typeof file === "string") return { error: "No file received." };
  try {
    const out = await saveImage(Buffer.from(await file.arrayBuffer()), formData.get("fit") === "contain" ? "contain" : "cover");
    return { url: out.url, thumb: out.thumb, kb: Math.round(out.bytes / 1024) };
  } catch (err) {
    console.error("[upload]", err);
    return { error: err.message?.includes("storage") ? err.message : "That file could not be read as an image." };
  }
}

/* ---------------- products ---------------- */

export async function saveProductAction(input) {
  const admin = await requirePerm("products");
  const d = {
    id: int(input.id) || null,
    name: str(input.name, 160),
    description: str(input.description, 4000),
    category_id: int(input.category_id) || null,
    price: int(input.price, -1),
    compare: int(input.compare_at_price) || null,
    status: ["draft", "active", "archived"].includes(input.status) ? input.status : "draft",
    badge: str(input.badge, 20) || null,
    fabric: str(input.fabric), care: str(input.care), origin: str(input.origin),
    fit_note: str(input.fit_note, 200),
    type: str(input.product_type, 40),
    featured: Boolean(input.is_featured),
    threshold: Math.max(0, int(input.low_stock_threshold, 3)),
    images: (input.images || []).filter((i) => i?.url && i?.thumb).slice(0, 10),
    variants: (input.variants || []).map((v) => ({ id: int(v.id) || null, size: str(v.size, 20), color: str(v.color, 30), sku: str(v.sku, 60), stock: Math.max(0, int(v.stock)) })).filter((v) => v.size),
  };
  if (!d.name) return { error: "Give the product a name." };
  if (d.price < 0) return { error: "Enter a price." };
  if (!d.variants.length) return { error: "Add at least one size (use \"One size\" if it has none)." };
  if (new Set(d.variants.map((v) => `${v.size}|${v.color}`.toLowerCase())).size !== d.variants.length) return { error: "Each size and colour combination can only be listed once." };
  if (d.status === "active" && !d.images.length) return { error: "Add at least one photo before publishing." };

  // unique, readable URL
  let slug = slugify(input.slug || d.name) || "product";
  for (let n = 2; ; n++) {
    const [clash] = await query("SELECT id FROM products WHERE slug = $1 AND id IS DISTINCT FROM $2", [slug, d.id]);
    if (!clash) break;
    slug = `${slugify(input.slug || d.name)}-${n}`;
  }

  const restocked = [];
  const id = await tx(async (q) => {
    const fields = [d.name, slug, d.description, d.category_id, d.price, d.compare, d.status, d.badge, d.fabric, d.care, d.origin, d.featured, d.threshold];
    const setType = (pid) => q("UPDATE products SET product_type = $2 WHERE id = $1", [pid, d.type]);
    let pid = d.id;
    if (pid) {
      await q(
        `UPDATE products SET name=$1, slug=$2, description=$3, category_id=$4, price=$5, compare_at_price=$6, status=$7, badge=$8,
           fabric=$9, care=$10, origin=$11, is_featured=$12, low_stock_threshold=$13, updated_at=now(),
           published_at = CASE WHEN $7::text = 'active' THEN COALESCE(published_at, now()) ELSE published_at END
         WHERE id=$14`,
        [...fields, pid]
      );
    } else {
      const [row] = await q(
        `INSERT INTO products (name, slug, description, category_id, price, compare_at_price, status, badge, fabric, care, origin, is_featured, low_stock_threshold, published_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13, CASE WHEN $7::text = 'active' THEN now() END) RETURNING id`,
        fields
      );
      pid = row.id;
    }

    await setType(pid);
    // the fit tip above the size picker (also written by the Feedback analyst agent)
    await q("UPDATE products SET fit_note = $2 WHERE id = $1", [pid, d.fit_note]);
    await q("DELETE FROM product_images WHERE product_id = $1", [pid]);
    for (const [i, im] of d.images.entries()) {
      await q("INSERT INTO product_images (product_id, url, thumb_url, sort_order) VALUES ($1,$2,$3,$4)", [pid, im.url, im.thumb, i]);
    }

    const existing = await q("SELECT id, stock FROM variants WHERE product_id = $1", [pid]);
    const keep = d.variants.filter((v) => v.id).map((v) => v.id);
    for (const old of existing) if (!keep.includes(old.id)) await q("DELETE FROM variants WHERE id = $1", [old.id]);
    // park kept rows on temporary names so sizes can be renamed/swapped without tripping the unique index
    await q("UPDATE variants SET size = '~' || id, color = '' WHERE product_id = $1", [pid]);
    for (const [i, v] of d.variants.entries()) {
      const old = existing.find((e) => e.id === v.id);
      let vid = old?.id;
      if (old) await q("UPDATE variants SET size=$2, color=$6, sku=$3, stock=$4, sort_order=$5 WHERE id=$1", [vid, v.size, v.sku, v.stock, i, v.color]);
      else [{ id: vid }] = await q("INSERT INTO variants (product_id, size, color, sku, stock, sort_order) VALUES ($1,$2,$6,$3,$4,$5) RETURNING id", [pid, v.size, v.sku, v.stock, i, v.color]);
      const delta = v.stock - (old?.stock || 0);
      if (delta) await q("INSERT INTO stock_movements (variant_id, delta, qty, type, reason, admin_id) VALUES ($1,$2,$3,$4,$5,$6)", [vid, delta, Math.abs(delta), old ? "count" : "supplier", old ? "Edited on the product page" : "Initial stock", admin.id]);
      if (old && old.stock === 0 && v.stock > 0) restocked.push(vid);
    }
    return pid;
  });

  await notifyBackInStock(restocked);

  let announced = 0;
  if (input.announce && d.status === "active") {
    const settings = await getSettings();
    const res = await broadcast({
      name: `New arrival: ${d.name}`, event: "new_arrival",
      vars: { product: d.name, price: money(d.price, settings.store.currency), url: `${siteUrl()}/products/${slug}` },
    });
    announced = res.recipients;
    await query("UPDATE products SET announced_at = now() WHERE id = $1", [id]);
  }
  sendSoon(15);
  return { ok: true, id, announced };
}

export async function deleteProductAction(formData) {
  const admin = await requirePerm("products");
  await query("DELETE FROM products WHERE id = $1", [int(formData.get("id"))]);
  redirect("/admin/products");
}

/* ---------------- categories ---------------- */

export async function saveCategoryAction(input) {
  const admin = await requirePerm("products");
  const id = int(input.id) || null;
  const name = str(input.name, 80);
  if (!name) return { error: "Give the category a name." };
  const slug = slugify(input.slug || name);
  const [clash] = await query("SELECT id FROM categories WHERE slug = $1 AND id IS DISTINCT FROM $2", [slug, id]);
  if (clash) return { error: "Another category already uses that name." };
  const fields = [name, slug, str(input.description, 300), str(input.image_url, 600) || null, int(input.sort_order), input.is_active !== false, str(input.icon, 20)];
  if (id) await query("UPDATE categories SET name=$1, slug=$2, description=$3, image_url=$4, sort_order=$5, is_active=$6, icon=$7 WHERE id=$8", [...fields, id]);
  else await query("INSERT INTO categories (name, slug, description, image_url, sort_order, is_active, icon) VALUES ($1,$2,$3,$4,$5,$6,$7)", fields);
  revalidatePath("/admin/categories");
  return { ok: true };
}

export async function deleteCategoryAction(formData) {
  const admin = await requirePerm("products");
  await query("DELETE FROM categories WHERE id = $1", [int(formData.get("id"))]);
  revalidatePath("/admin/categories");
}

/* ---------------- inventory ---------------- */

export async function setStockAction(variantId, stock) {
  const admin = await requirePerm("inventory");
  stock = Math.max(0, int(stock));
  const [old] = await query("SELECT stock, reserved FROM variants WHERE id = $1", [int(variantId)]);
  if (!old) return { error: "Size not found." };
  // pieces promised to unconfirmed orders must stay on the shelf
  if (stock < old.reserved) return { error: `${old.reserved} are reserved for unconfirmed orders.` };
  if (old.stock !== stock) {
    await query("UPDATE variants SET stock = $2 WHERE id = $1", [variantId, stock]);
    await query("INSERT INTO stock_movements (variant_id, delta, qty, type, reason, admin_id) VALUES ($1,$2,$3,'count','Counted in inventory',$4)", [variantId, stock - old.stock, Math.abs(stock - old.stock), admin.id]);
    if (old.stock === 0 && stock > 0) {
      await notifyBackInStock([variantId]);
      sendSoon(15);
    }
  }
  return { ok: true, stock };
}

/* ---------------- offers ---------------- */

export async function saveSaleAction(formData) {
  const admin = await requirePerm("offers");
  const name = str(formData.get("name"), 80);
  const percent = int(formData.get("percent"));
  const scope = ["all", "category", "products"].includes(formData.get("scope")) ? formData.get("scope") : "all";
  const categoryId = scope === "category" ? int(formData.get("category_id")) || null : null;
  const productIds = scope === "products" ? formData.getAll("product_ids").map((v) => int(v)).filter(Boolean) : [];
  const startsAt = localText(formData.get("starts_at"));
  const endsAt = localText(formData.get("ends_at"));
  const settings = await getSettings();
  if (!name || percent < 1 || percent > 95) redirect("/admin/offers?error=Enter+a+name+and+a+discount+between+1+and+95%25");
  if (scope === "category" && !categoryId) redirect("/admin/offers?error=Choose+a+category+for+this+sale");
  if (scope === "products" && !productIds.length) redirect("/admin/offers?error=Choose+at+least+one+product");

  const [sale] = await query(
    `INSERT INTO sales (name, percent, scope, category_id, product_ids, starts_at, ends_at)
     VALUES ($1,$2,$3,$4,$5::int[], COALESCE($6::timestamp AT TIME ZONE $8, now()), $7::timestamp AT TIME ZONE $8) RETURNING id, ends_at`,
    [name, percent, scope, categoryId, productIds, startsAt, endsAt, settings.store.timezone]
  );

  if (formData.get("announce")) {
    await broadcast({
      name: `Sale: ${name}`, event: "sale_started",
      vars: { sale: name, percent, ends: sale.ends_at ? ` until ${fmtDate(sale.ends_at, settings.store.timezone, false)}` : "", url: `${siteUrl()}/products?sale=1` },
    });
    await query("UPDATE sales SET announced_at = now() WHERE id = $1", [sale.id]);
    sendSoon(15);
  }
  redirect("/admin/offers");
}

export async function toggleSaleAction(formData) {
  const admin = await requirePerm("offers");
  await query("UPDATE sales SET is_active = NOT is_active WHERE id = $1", [int(formData.get("id"))]);
  revalidatePath("/admin/offers");
}

export async function deleteSaleAction(formData) {
  const admin = await requirePerm("offers");
  await query("DELETE FROM sales WHERE id = $1", [int(formData.get("id"))]);
  revalidatePath("/admin/offers");
}

export async function saveCouponAction(formData) {
  const admin = await requirePerm("offers");
  const code = str(formData.get("code"), 30).toUpperCase().replace(/[^A-Z0-9_-]/g, "");
  const type = formData.get("type") === "fixed" ? "fixed" : "percent";
  const value = int(formData.get("value"));
  if (!code || value < 1 || (type === "percent" && value > 95)) redirect("/admin/offers?error=Enter+a+code+and+a+valid+discount");
  await query(
`INSERT INTO coupons (code, type, value, min_subtotal, max_uses, ends_at) VALUES ($1,$2,$3,$4,$5, ($6::date + 1)::timestamp AT TIME ZONE $7)
     ON CONFLICT (code) DO UPDATE SET type=EXCLUDED.type, value=EXCLUDED.value, min_subtotal=EXCLUDED.min_subtotal, max_uses=EXCLUDED.max_uses, ends_at=EXCLUDED.ends_at, is_active=true`,
    [code, type, value, Math.max(0, int(formData.get("min_subtotal"))), int(formData.get("max_uses")) || null, localText(formData.get("ends_at")), (await getSettings()).store.timezone]
  );
  redirect("/admin/offers");
}

export async function toggleCouponAction(formData) {
  const admin = await requirePerm("offers");
  await query("UPDATE coupons SET is_active = NOT is_active WHERE id = $1", [int(formData.get("id"))]);
  revalidatePath("/admin/offers");
}

export async function deleteCouponAction(formData) {
  const admin = await requirePerm("offers");
  await query("DELETE FROM coupons WHERE id = $1", [int(formData.get("id"))]);
  revalidatePath("/admin/offers");
}

/* ---------------- orders ---------------- */

export async function orderStatusAction(formData) {
  const admin = await requirePerm("orders");
  const id = int(formData.get("id"));
  const status = str(formData.get("status"), 20);
  const returns = {};
  for (const [key, value] of formData.entries()) if (key.startsWith("return_")) returns[int(key.slice(7))] = value;
  const res = await setOrderStatus(id, status, {
    by: "staff", admin, returns,
    reason: str(formData.get("reason"), 200),
    courier: status === "shipped" ? str(formData.get("courier"), 60) : undefined,
    tracking: status === "shipped" ? str(formData.get("tracking"), 80) : undefined,
    silent: formData.get("silent") === "on",
  });
  redirect(`/admin/orders/${id}${res.error ? `?error=${encodeURIComponent(res.error)}` : ""}`);
}

/**
 * After printing slips and cards: records when they were printed and, if asked, marks the confirmed ones
 * packed (one click for the whole day). Returns how many moved.
 */
export async function markPrintedAction(ids, pack) {
  const admin = await requirePerm("orders");
  const list = (Array.isArray(ids) ? ids : []).map((v) => int(v)).filter(Boolean).slice(0, 200);
  if (!list.length) return { error: "Nothing selected." };
  await query("UPDATE orders SET printed_at = now() WHERE id = ANY($1::int[])", [list]);
  let packed = 0;
  if (pack) {
    for (const id of list) {
      const res = await setOrderStatus(id, "packed", { from: ["confirmed"], by: "staff", admin, silent: true });
      if (res.ok) packed++;
    }
  }
  revalidatePath("/admin/orders");
  return { ok: true, packed };
}

/* ---------------- messages + campaigns ---------------- */

export async function sendCampaignAction(_prev, formData) {
  const admin = await requirePerm("marketing");
  const name = str(formData.get("name"), 100);
  const subject = str(formData.get("subject"), 150);
  const body = str(formData.get("body"), 3000);
  const email = formData.get("email") === "on";
  const whatsapp = formData.get("whatsapp") === "on";
  if (!name || body.length < 10) return { error: "Add a campaign name and a message." };
  if (!email && !whatsapp) return { error: "Choose at least one channel." };
  if (email && !subject) return { error: "Emails need a subject line." };
  // a customer group (VIP, at risk, bought a collection before...) or everyone who subscribed
  const audience = str(formData.get("audience"), 40);
  const { audienceIds } = await import("./crm");
  const ids = audience ? await audienceIds(audience) : null;
  if (ids && !ids.length) return { error: "Nobody is in that group yet." };
  const res = await broadcast({ name, event: "broadcast", template: { subject, body, email, whatsapp }, ids, audience });
  sendSoon(15);
  return { ok: true, recipients: res.recipients };
}

/** Sends the next batch of queued messages; the panel calls it repeatedly until nothing is left. */
export async function processQueueAction() {
  await requireAdmin();
  return processQueue(15);
}

export async function markMessageSentAction(id) {
  await requireAdmin();
  await query("UPDATE messages SET status = 'sent', sent_at = now() WHERE id = $1 AND status = 'manual'", [int(id)]);
  return { ok: true };
}

export async function retryMessagesAction() {
  const admin = await requirePerm("marketing");
  await query("UPDATE messages SET status = 'queued', error = NULL WHERE status IN ('failed', 'skipped') AND created_at > now() - interval '7 days'");
  revalidatePath("/admin/messages");
}

export async function markInboxReadAction(formData) {
  const admin = await requirePerm("marketing");
  await query("UPDATE contact_messages SET is_read = true WHERE id = $1", [int(formData.get("id"))]);
  revalidatePath("/admin/messages");
}

export async function saveAutomationAction(formData) {
  const admin = await requirePerm("marketing");
  const event = str(formData.get("event"), 40);
  if (!EVENTS[event]) return;
  const settings = await getSettings();
  const next = {
    ...settings.automations,
    [event]: {
      email: formData.get("email") === "on",
      whatsapp: formData.get("whatsapp") === "on",
      subject: str(formData.get("subject"), 200),
      body: str(formData.get("body"), 3000),
      wa_template: str(formData.get("wa_template"), 80),
    },
  };
  await saveSetting("automations", next);
  redirect(`/admin/automations?saved=${event}#${event}`);
}

/* ---------------- settings ---------------- */

const NUMERIC = ["save_offer", "cross_sell_days", "birthday_value", "change_hours", "max_qty", "max_pending", "window_days", "complaint_hours", "exchange_fee", "next_code_value", "next_code_days", "vip_spend", "vip_orders", "winback_days", "reorder_days", "feedback_days", "points_per_100", "reward_points", "reward_value", "reward_days", "handoff_after", "cart_hours", "fee", "free_over", "reminder_hours", "auto_cancel_hours", "duplicate_hours", "pack_hours", "deliver_days", "lead_days", "cover_days"];

export async function saveSettingsAction(formData) {
  const key = str(formData.get("_key"), 30);
  await requirePerm(key === "announcement" ? "offers" : key === "assistant" ? "support" : "settings");
  const defaults = DEFAULT_SETTINGS[key];
  if (!defaults || key === "automations" || key === "showcase") return;
  const value = {};
  for (const field of Object.keys(defaults)) {
    if (typeof defaults[field] === "boolean") value[field] = formData.get(field) === "on";
    else if (NUMERIC.includes(field)) value[field] = Math.max(0, int(formData.get(field)));
    else value[field] = str(formData.get(field), field === "about" ? 3000 : 1000);
  }
  if (key === "assistant") {
    await saveSetting(key, value);
    redirect("/admin/assistant?saved=settings");
  }
  if (key === "store") value.whatsapp = value.whatsapp.replace(/\D/g, "");
  if (key === "labels") {
    value.format = value.format === "thermal" ? "thermal" : "a4";
    value.next_code_type = value.next_code_type === "fixed" ? "fixed" : "percent";
    if (value.next_code_type === "percent") value.next_code_value = Math.min(90, value.next_code_value);
    value.next_code_prefix = value.next_code_prefix.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10) || "NEXT";
  }
  await saveSetting(key, value);
  redirect(`/admin/${formData.get("_back") === "offers" ? "offers" : "settings"}?saved=${key}`);
}

/* ---------------- banners ---------------- */

/** One banner photo: detects which screens it suits from its shape, then stores it. */
export async function uploadBannerAction(formData) {
  const admin = await requirePerm("banners");
  const file = formData.get("file");
  const placement = str(formData.get("placement"), 20);
  if (!BANNER_PLACEMENTS[placement]) return { error: "Unknown page." };
  if (!file || typeof file === "string") return { error: "No file received." };
  try {
    const b = await saveBanner(Buffer.from(await file.arrayBuffer()));
    await query(
      `INSERT INTO banners (placement, image_url, width, height, auto_device, device, sort_order)
       VALUES ($1, $2, $3, $4, $5, $5, (SELECT COALESCE(max(sort_order), -1) + 1 FROM banners WHERE placement = $1))`,
      [placement, b.url, b.width, b.height, b.device]
    );
    return { ok: true, device: b.device, width: b.width, height: b.height };
  } catch (err) {
    console.error("[banner]", err);
    return { error: err.message?.includes("storage") ? err.message : "That file could not be read as an image." };
  }
}

export async function updateBannerAction(formData) {
  const admin = await requirePerm("banners");
  const device = ["desktop", "mobile", "both"].includes(formData.get("device")) ? formData.get("device") : "both";
  const [row] = await query(
    `UPDATE banners SET device=$2, eyebrow=$3, title=$4, subtitle=$5, cta_text=$6, cta_link=$7, sort_order=$8, is_active=$9
     WHERE id=$1 RETURNING placement`,
    [int(formData.get("id")), device, str(formData.get("eyebrow"), 80), str(formData.get("title"), 120), str(formData.get("subtitle"), 240),
     str(formData.get("cta_text"), 40), str(formData.get("cta_link"), 200), int(formData.get("sort_order")), formData.get("is_active") === "on"]
  );
  redirect(`/admin/banners?placement=${row?.placement || "home"}&saved=${int(formData.get("id"))}`);
}

export async function deleteBannerAction(formData) {
  const admin = await requirePerm("banners");
  await query("DELETE FROM banners WHERE id = $1", [int(formData.get("id"))]);
  revalidatePath("/admin/banners");
}

/* ---------------- quick search (Ctrl+K) ---------------- */

export async function adminSearchAction(q) {
  const admin = await requireAdmin();
  const like = `%${str(q, 60).toLowerCase()}%`;
  const [orders, products, customers] = await Promise.all([
    query(
      `SELECT id, number, customer_name, status FROM orders
       WHERE lower(number || ' ' || customer_name || ' ' || phone) LIKE $1 ORDER BY id DESC LIMIT 5`, [like]),
    query("SELECT id, name, status FROM products WHERE lower(name) LIKE $1 ORDER BY id DESC LIMIT 5", [like]),
    query(
      `SELECT id, name, email, phone FROM contacts
       WHERE lower(name || ' ' || COALESCE(email, '') || ' ' || COALESCE(phone, '')) LIKE $1 ORDER BY id DESC LIMIT 5`, [like]),
  ]);
  return {
    orders: !can(admin, "orders") ? [] : orders.map((o) => ({ href: `/admin/orders/${o.id}`, label: `${o.number} · ${o.customer_name}`, hint: o.status })),
    products: !can(admin, "products") ? [] : products.map((p) => ({ href: `/admin/products/${p.id}`, label: p.name, hint: p.status })),
    customers: !can(admin, "customers") ? [] : customers.map((c) => ({ href: `/admin/customers/${c.id}`, label: c.name || c.email || `+${c.phone}`, hint: c.email || (c.phone ? `+${c.phone}` : "") })),
  };
}

/* ---------------- manual orders, assignment, notes ---------------- */

/** Order typed in by staff from WhatsApp, Instagram, a call or the shop counter. */
export async function createManualOrderAction(input) {
  const admin = await requirePerm("orders");
  const res = await createManualOrder(input, admin);
  return res.error ? { error: res.error } : { ok: true, id: res.id, number: res.number };
}

/** Customer lookup + duplicate warning while a manual order is being typed. */
export async function orderCheckAction(phone, variantIds) {
  await requirePerm("orders");
  const settings = await getSettings();
  const normal = normalizePhone(phone, settings.store.country_code);
  if (normal.length < 11) return { customer: null, duplicates: [] };
  const [[contact], [last], duplicates] = await Promise.all([
    query("SELECT id, name, email, city, is_flagged, notes FROM contacts WHERE phone = $1 LIMIT 1", [normal]),
    query(
      `SELECT customer_name, email, address, city,
              (SELECT count(*)::int FROM orders WHERE phone = $1) AS orders,
              (SELECT count(*)::int FROM orders WHERE phone = $1 AND status IN ('cancelled', 'returned')) AS failed
       FROM orders WHERE phone = $1 ORDER BY id DESC LIMIT 1`, [normal]),
    findDuplicates({ phone: normal, variantIds: (variantIds || []).map((v) => int(v)).filter(Boolean) }),
  ]);
  return {
    customer: contact || last ? {
      id: contact?.id || null, name: last?.customer_name || contact?.name || "", email: last?.email || contact?.email || "",
      address: last?.address || "", city: last?.city || contact?.city || "",
      orders: last?.orders || 0, failed: last?.failed || 0, flagged: Boolean(contact?.is_flagged), notes: contact?.notes || "",
    } : null,
    duplicates: duplicates.map((d) => ({ id: d.id, number: d.number, status: d.status, channel: d.channel })),
  };
}

export async function assignOrderAction(formData) {
  const admin = await requirePerm("orders");
  const id = int(formData.get("id"));
  await assignOrder(id, int(formData.get("staff")) || null, admin);
  redirect(`/admin/orders/${id}`);
}

export async function orderNoteAction(formData) {
  const admin = await requirePerm("orders");
  const id = int(formData.get("id"));
  await addOrderNote(id, str(formData.get("note"), 500), admin);
  redirect(`/admin/orders/${id}`);
}

/* ---------------- stock adjustments ---------------- */

/** Supplier delivery, damage, loss, recount: a stock change with a reason, logged against the staff member. */
export async function adjustStockAction(_prev, formData) {
  const admin = await requirePerm("inventory");
  const variantId = int(formData.get("variant_id"));
  const reason = STOCK_REASONS.find(([type]) => type === formData.get("type"));
  const amount = Math.abs(int(formData.get("qty")));
  if (!variantId || !reason) return { error: "Choose a product, a size and a reason." };
  if (!amount && reason[0] !== "count") return { error: "Enter how many units." };
  const [v] = await query("SELECT stock, reserved FROM variants WHERE id = $1", [variantId]);
  if (!v) return { error: "That size no longer exists." };

  // "count" sets the number; the others add or remove
  const next = reason[2] === 0 ? amount : v.stock + reason[2] * amount;
  if (next < v.reserved) return { error: `${v.reserved} of these are reserved for unconfirmed orders, so stock cannot go below that.` };
  if (next < 0) return { error: `Only ${v.stock} on hand.` };
  await query("UPDATE variants SET stock = $2 WHERE id = $1", [variantId, next]);
  await query(
    "INSERT INTO stock_movements (variant_id, delta, qty, type, reason, admin_id) VALUES ($1,$2,$3,$4,$5,$6)",
    [variantId, next - v.stock, reason[2] === 0 ? Math.abs(next - v.stock) : amount, reason[0], str(formData.get("note"), 200) || reason[1], admin.id]
  );
  if (v.stock - v.reserved <= 0 && next - v.reserved > 0) {
    await notifyBackInStock([variantId]);
    sendSoon(15);
  }
  revalidatePath("/admin/inventory");
  return { ok: true, message: `${reason[1]}: stock is now ${next}.` };
}

/* ---------------- customers ---------------- */

export async function saveCustomerNoteAction(formData) {
  await requirePerm("customers");
  const id = int(formData.get("id"));
  await query("UPDATE contacts SET notes = $2, is_flagged = $3 WHERE id = $1", [id, str(formData.get("notes"), 1000), formData.get("is_flagged") === "on"]);
  redirect(`/admin/customers/${id}?saved=1`);
}

/* ---------------- staff ---------------- */

export async function saveStaffAction(_prev, formData) {
  const admin = await requirePerm("staff");
  const id = int(formData.get("id")) || null;
  const name = str(formData.get("name"), 80);
  const email = str(formData.get("email"), 160).toLowerCase();
  const password = String(formData.get("password") || "");
  const role = formData.get("role") === "owner" ? "owner" : "staff";
  const permissions = Object.keys(PERMISSIONS).filter((p) => formData.get(`perm_${p}`) === "on");
  const active = formData.get("is_active") === "on";

  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Enter a name and a valid email." };
  if (!id && password.length < 8) return { error: "Give the account a password of at least 8 characters." };
  if (password && password.length < 8) return { error: "The new password needs at least 8 characters." };
  // only an owner may create or change owners, and nobody can lock themselves out
  if (role === "owner" && admin.role !== "owner") return { error: "Only an owner can make someone an owner." };
  if (id === admin.id && (!active || role !== admin.role)) return { error: "You cannot deactivate yourself or change your own role." };
  if (id) {
    const [target] = await query("SELECT role FROM admins WHERE id = $1", [id]);
    if (target?.role === "owner" && admin.role !== "owner") return { error: "Only an owner can edit an owner account." };
    if (target?.role === "owner" && (role !== "owner" || !active)) {
      const [{ n }] = await query("SELECT count(*)::int AS n FROM admins WHERE role = 'owner' AND is_active AND id <> $1", [id]);
      if (!n) return { error: "There must be at least one active owner." };
    }
  }
  const [clash] = await query("SELECT id FROM admins WHERE email = $1 AND id IS DISTINCT FROM $2", [email, id]);
  if (clash) return { error: "Another account already uses that email." };

  if (id) {
    await query("UPDATE admins SET name=$2, email=$3, role=$4, permissions=$5::text[], is_active=$6 WHERE id=$1", [id, name, email, role, permissions, active]);
    if (password) await query("UPDATE admins SET password_hash = $2 WHERE id = $1", [id, hashPassword(password)]);
  } else {
    await query("INSERT INTO admins (name, email, role, permissions, is_active, password_hash) VALUES ($1,$2,$3,$4::text[],$5,$6)", [name, email, role, permissions, active, hashPassword(password)]);
  }
  revalidatePath("/admin/staff");
  return { ok: true, message: id ? "Saved." : `${name} can now sign in with that email and password.` };
}

/* ---------------- inbox and assistant ---------------- */

export async function inboxReplyAction(_prev, formData) {
  const admin = await requirePerm("support");
  const id = int(formData.get("id"));
  const res = await staffReply(id, formData.get("text"), admin);
  if (res.error) return { error: res.error };
  revalidatePath("/admin/inbox");
  return { ok: Date.now() };
}

/** Take over, hand back to the assistant, close, or assign a chat. */
export async function inboxStateAction(formData) {
  const admin = await requirePerm("support");
  const id = int(formData.get("id"));
  const status = formData.get("status") ? str(formData.get("status"), 10) : undefined;
  const assignedTo = formData.has("assigned_to") ? int(formData.get("assigned_to")) || null : undefined;
  await updateConversation(id, { status, assignedTo }, admin);
  redirect(`/admin/inbox?c=${id}`);
}

export async function saveFaqAction(formData) {
  await requirePerm("support");
  const id = int(formData.get("id"));
  const question = str(formData.get("question"), 300);
  const answerText = str(formData.get("answer"), 1500);
  const keywords = str(formData.get("keywords"), 300).toLowerCase();
  if (!question || !answerText) redirect("/admin/assistant?error=answer#answers");
  if (id) await query("UPDATE faqs SET question = $2, answer = $3, keywords = $4, is_active = $5 WHERE id = $1", [id, question, answerText, keywords, formData.get("is_active") === "on"]);
  else await query("INSERT INTO faqs (question, answer, keywords) VALUES ($1,$2,$3)", [question, answerText, keywords]);
  redirect("/admin/assistant?saved=answer#answers");
}

export async function deleteFaqAction(formData) {
  await requirePerm("support");
  await query("DELETE FROM faqs WHERE id = $1", [int(formData.get("id"))]);
  redirect("/admin/assistant#answers");
}

/** The "try it" box: answers exactly as a customer would be answered, without saving anything. */
export async function assistantTestAction({ text, channel, state } = {}) {
  await requirePerm("support");
  const conversation = { channel: channel === "whatsapp" ? "whatsapp" : "web", phone: null, context: state?.context || {}, misses: state?.misses || 0 };
  const res = await answer({ text: str(text, 600), conversation, history: Array.isArray(state?.history) ? state.history.slice(-12) : [] });
  return {
    text: conversation.channel === "whatsapp" ? fullText(res) : res.text,
    products: conversation.channel === "whatsapp" ? [] : res.products,
    handoff: res.handoff, via: res.via, miss: res.miss,
    state: { context: res.context, misses: res.misses },
  };
}

/* ---------------- showcase (hand-picked storefront sections) ---------------- */

const photoUrl = (v) => {
  const s = str(v, 600);
  return /^(https:\/\/|\/)[^\s"'<>]+$/.test(s) ? s : "";
};

/** Saves the whole Showcase page at once: each section's mode and picks, the replacement photos and the gallery order. */
export async function saveShowcaseAction(input) {
  await requirePerm("banners");
  const sections = {};
  for (const [key, meta] of Object.entries(SHOWCASE_SECTIONS)) {
    const s = input?.sections?.[key] || {};
    const seen = new Set();
    const items = (Array.isArray(s.items) ? s.items : [])
      .map((i) => ({ id: int(i?.id), photo: int(i?.photo) || null }))
      .filter((i) => i.id > 0 && !seen.has(i.id) && seen.add(i.id))
      .slice(0, meta.max * 2);
    sections[key] = { mode: s.mode === "pick" ? "pick" : "auto", fill: s.fill !== false, items };
  }
  const photos = {};
  for (const key of Object.keys(SHOWCASE_PHOTOS)) if (key !== "hero") photos[key] = photoUrl(input?.photos?.[key]);
  const gallery = {};
  for (const [slug, ids] of Object.entries(input?.gallery || {})) {
    if (!/^[a-z0-9-]{1,80}$/.test(slug) || !Array.isArray(ids)) continue;
    const list = [...new Set(ids.map((x) => int(x)).filter((x) => x > 0))].slice(0, 300);
    if (list.length) gallery[slug] = list;
  }
  await saveSetting("showcase", { sections, photos, gallery });

  // the home banner photo has always lived in Settings -> Home page banner: keep a single place for it
  if (input?.photos && "hero" in input.photos) {
    const { hero } = await getSettings();
    await saveSetting("hero", { ...hero, image: photoUrl(input.photos.hero) || DEFAULT_SETTINGS.hero.image });
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

/** One replacement photo for the Showcase page. Kept in its own shape (wide stays wide), like banners. */
export async function uploadShowcasePhotoAction(formData) {
  await requirePerm("banners");
  const file = formData.get("file");
  if (!file || typeof file === "string") return { error: "No file received." };
  try {
    const b = await saveBanner(Buffer.from(await file.arrayBuffer()));
    return { url: b.url, width: b.width, height: b.height };
  } catch (err) {
    console.error("[showcase photo]", err);
    return { error: err.message?.includes("storage") ? err.message : "That file could not be read as an image." };
  }
}

/* ---------------- inventory: one product's sizes at once ---------------- */

/**
 * Saves new on-hand numbers for several sizes of one product in one go, with one reason for the log.
 * `changes` = [{ variantId, stock }] (the new number on the shelf). "count" sets the number either way;
 * the other reasons only make sense in one direction (a delivery adds, damage removes) and are refused otherwise.
 */
export async function saveProductStockAction(productId, changes, type, note) {
  const admin = await requirePerm("inventory");
  const reason = STOCK_REASONS.find(([t]) => t === type);
  if (!reason) return { error: "Choose why the stock changed." };
  const list = (Array.isArray(changes) ? changes : []).slice(0, 100).map((c) => ({ id: int(c?.variantId), stock: Math.max(0, int(c?.stock)) })).filter((c) => c.id);
  if (!list.length) return { error: "Nothing changed." };

  let back = [];
  try {
    back = await tx(async (q) => {
      const restocked = [];
      for (const c of list) {
        const [v] = await q("SELECT id, stock, reserved, size FROM variants WHERE id = $1 AND product_id = $2 FOR UPDATE", [c.id, int(productId)]);
        if (!v) throw new Error("A size of this product no longer exists. Reload the page.");
        const delta = c.stock - v.stock;
        if (!delta) continue;
        if (c.stock < v.reserved) throw new Error(`${v.size}: ${v.reserved} are reserved for unconfirmed orders, so it cannot go below ${v.reserved}.`);
        if (reason[2] !== 0 && Math.sign(delta) !== reason[2]) {
          throw new Error(`${v.size} went ${delta > 0 ? "up" : "down"}, which does not match “${reason[1]}”. Choose “Count correction” for mixed changes.`);
        }
        await q("UPDATE variants SET stock = $2 WHERE id = $1", [v.id, c.stock]);
        await q(
          "INSERT INTO stock_movements (variant_id, delta, qty, type, reason, admin_id) VALUES ($1,$2,$3,$4,$5,$6)",
          [v.id, delta, Math.abs(delta), reason[0], str(note, 200) || reason[1], admin.id]
        );
        if (v.stock - v.reserved <= 0 && c.stock - v.reserved > 0) restocked.push(v.id);
      }
      return restocked;
    });
  } catch (err) {
    return { error: err.message || "Could not save. Please try again." };
  }
  if (back.length) { await notifyBackInStock(back); sendSoon(15); }
  revalidatePath("/admin/inventory");
  return { ok: true };
}

/** The latest stock changes of one product, for the inventory side panel. */
export async function productStockHistoryAction(productId) {
  await requirePerm("inventory");
  const [rows, settings] = await Promise.all([
    query(
      `SELECT m.id, m.delta, m.qty, m.type, m.reason, m.created_at, v.size, v.color, a.name AS staff, o.number
       FROM stock_movements m JOIN variants v ON v.id = m.variant_id
       LEFT JOIN admins a ON a.id = m.admin_id LEFT JOIN orders o ON o.id = m.order_id
       WHERE v.product_id = $1 ORDER BY m.id DESC LIMIT 12`,
      [int(productId)]
    ),
    getSettings(),
  ]);
  return rows.map((m) => ({
    id: m.id, delta: m.delta, qty: m.qty, type: m.type, note: m.number ? `Order ${m.number}` : m.reason,
    size: m.color ? `${m.size} · ${m.color}` : m.size, by: m.staff || "System", when: fmtDate(m.created_at, settings.store.timezone),
  }));
}

/* ---------------- returns, exchanges and complaints (see lib/cases.js) ---------------- */

export async function openCaseAction(orderId, input) {
  const admin = await requirePerm("returns");
  const { getOrder } = await import("./orders");
  const { openCase } = await import("./cases");
  const order = await getOrder("id", int(orderId));
  if (!order) return { error: "Order not found." };
  const res = await openCase(order, input, { admin });
  if (res.ok) revalidatePath("/admin/returns");
  return res;
}

export async function decideCaseAction(id, approve, note) {
  const admin = await requirePerm("returns");
  const { decideCase } = await import("./cases");
  const res = await decideCase(int(id), Boolean(approve), note, admin);
  revalidatePath(`/admin/returns/${int(id)}`);
  return res;
}

/** Books the rider or courier: a swap at the door (exchanges) or a plain collection. */
export async function bookPickupAction(id, data) {
  const admin = await requirePerm("returns");
  const { bookPickup } = await import("./cases");
  const res = await bookPickup(int(id), data || {}, admin);
  revalidatePath(`/admin/returns/${int(id)}`);
  revalidatePath("/admin/orders");
  return res.error ? res : { ok: true, order: res.order ? { id: Number(res.order.id), number: res.order.number } : null };
}

export async function markDamagedAction(caseId, itemId) {
  const admin = await requirePerm("returns");
  const { markDamaged } = await import("./cases");
  const res = await markDamaged(int(itemId), admin);
  revalidatePath(`/admin/returns/${int(caseId)}`);
  return res;
}

export async function assignCaseAction(id, staffId) {
  const admin = await requirePerm("returns");
  const { assignCase } = await import("./cases");
  const res = await assignCase(int(id), int(staffId) || null, admin);
  revalidatePath(`/admin/returns/${int(id)}`);
  revalidatePath("/admin/returns");
  return res;
}

export async function receiveCaseAction(id, conditions) {
  const admin = await requirePerm("returns");
  const { receiveCase } = await import("./cases");
  const res = await receiveCase(int(id), conditions && typeof conditions === "object" ? conditions : {}, admin);
  revalidatePath(`/admin/returns/${int(id)}`);
  return res;
}

export async function resolveCaseAction(id, data) {
  const admin = await requirePerm("returns");
  const { resolveCase } = await import("./cases");
  const res = await resolveCase(int(id), data || {}, admin);
  revalidatePath(`/admin/returns/${int(id)}`);
  return res;
}

export async function caseNoteAction(id, note) {
  const admin = await requirePerm("returns");
  const text = str(note, 600);
  if (!text) return { error: "Write a note first." };
  await query("INSERT INTO case_events (case_id, admin_id, actor, note) VALUES ($1,$2,$3,$4)", [int(id), admin.id, admin.name || "Staff", `Note: ${text}`]);
  revalidatePath(`/admin/returns/${int(id)}`);
  return { ok: true };
}

/* ---------------- loyalty (see lib/crm.js) ---------------- */

/** Staff add or take away points, with a reason that shows in the customer's history. */
export async function adjustPointsAction(contactId, points, reason) {
  const admin = await requirePerm("customers");
  const n = int(points);
  if (!n) return { error: "Enter how many points to add (or a minus number to take away)." };
  const { adjustPoints } = await import("./crm");
  await adjustPoints(int(contactId), n, str(reason, 120) || "Adjusted", admin);
  revalidatePath(`/admin/customers/${int(contactId)}`);
  return { ok: true };
}

/** Turn points into a reward code now (the customer has enough points). */
export async function issueRewardAction(contactId) {
  await requirePerm("customers");
  const { issueReward } = await import("./crm");
  const res = await issueReward(int(contactId));
  revalidatePath(`/admin/customers/${int(contactId)}`);
  return res;
}

/* ---------------- agents (see lib/agents.js) ---------------- */

/** "Run now" for one agent (or all of them). */
export async function runAgentAction(agent) {
  await requirePerm("agents");
  const { runAgents, AGENTS } = await import("./agents");
  const only = AGENTS[agent] ? agent : null;
  const res = await runAgents({ trigger: "manual", only, force: true });
  revalidatePath("/admin/agents");
  return { ok: true, ran: res };
}

/** Approve (mark done) or dismiss one suggestion. */
export async function decideTaskAction(id, approve, note, payload = {}) {
  const admin = await requirePerm("agents");
  const { decideTask } = await import("./agents");
  const clean = {
    decision: ["approve", "decline"].includes(payload?.decision) ? payload.decision : null,
    message: str(payload?.message, 600),
    description: str(payload?.description, 4000),
    // a clear-out sale from the Merchandiser: which pieces, how much off, how long
    percent: payload?.percent != null ? int(payload.percent) : undefined,
    days: payload?.days != null ? int(payload.days) : undefined,
    products: Array.isArray(payload?.products) ? payload.products.map((x) => int(x)).filter(Boolean).slice(0, 200) : undefined,
  };
  const res = await decideTask(int(id), Boolean(approve), admin, str(note, 300), clean);
  revalidatePath("/admin/agents");
  return res;
}

/** A reply suggestion for an Inbox chat (the assistant's answer, or a polite holding reply). Never sent by itself. */
export async function draftReplyAction(conversationId) {
  await requirePerm("support");
  const { draftReply } = await import("./agents-writers");
  return draftReply(int(conversationId), await getSettings());
}

/** Switches and numbers for the agents. */
export async function saveAgentSettingsAction(input) {
  await requirePerm("agents");
  const d = DEFAULT_SETTINGS.agents;
  const value = {};
  for (const [k, v] of Object.entries(d)) value[k] = typeof v === "boolean" ? Boolean(input?.[k]) : Math.max(0, int(input?.[k], v));
  value.briefing_hour = Math.min(23, value.briefing_hour);
  value.guard_advance = Math.max(value.guard_call, value.guard_advance);
  await saveSetting("agents", value);
  revalidatePath("/admin/agents");
  return { ok: true };
}
