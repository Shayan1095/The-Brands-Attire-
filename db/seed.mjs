import { hashPassword } from "./password.mjs";

const U = (id) => `https://images.unsplash.com/${id}`;
const img = (id) => ({
  url: `${U(id)}?auto=format&fit=crop&w=1200&h=1500&q=80`,
  thumb: `${U(id)}?auto=format&fit=crop&w=600&h=750&q=75`,
});

const ALPHA = ["XS", "S", "M", "L", "XL", "XXL"];
const WAIST = ["28", "30", "32", "34", "36", "38"];

const CATEGORIES = [
  { name: "Luxury", slug: "luxury", description: "Refined, considered pieces made to last.", image: "photo-1490481651871-ab68de25d43d" },
  { name: "Everyday", slug: "everyday", description: "Lived-in essentials for every day of the week.", image: "photo-1556905055-8f358a7a47b2" },
  { name: "Tech", slug: "tech", description: "Engineered performance wear.", image: "photo-1571019613454-1cb2f99b2d8b" },
];

// [name, category, price, compareAt, badge, sizes, soldOut, photos, description, fabric, care, origin]
const PRODUCTS = [
  ["Merino Overcoat", "luxury", 24500, null, "New", ALPHA.slice(0, 5), ["XS"], ["photo-1539533018447-63fcce2678e3", "photo-1591047139829-d91aecb6caea"],
    "A timeless overcoat cut from deadstock merino wool and finished by hand. Relaxed shoulders, single-breasted, fully lined.",
    "100% deadstock merino wool", "Dry clean only. Store on a wide hanger.", "Hand-finished in Portugal"],
  ["Cashmere Crewneck", "luxury", 12900, null, null, ALPHA.slice(0, 5), [], ["photo-1620799140408-edc6dcb6d633"],
    "Pure grade-A cashmere knit to a heavyweight 12-gauge. Drapes softly and holds its shape season after season.",
    "100% grade-A Mongolian cashmere", "Hand wash cold, dry flat.", "Knitted in Scotland"],
  ["Heavyweight Tee", "everyday", 2490, null, null, ALPHA, ["XXL"], ["photo-1521572163474-6864f9cf17ab"],
    "Our everyday essential, built from 280gsm organic cotton with a boxy, lived-in fit from day one. Pre-shrunk and garment dyed.",
    "100% organic cotton, 280gsm", "Machine wash cold, tumble dry low.", "Cut and sewn in Portugal"],
  ["Relaxed Selvedge Jean", "everyday", 5990, 7490, null, WAIST, ["28", "38"], ["photo-1542272604-787c3835535d"],
    "Japanese 14oz selvedge denim, sanforized for a clean break-in. Mid-rise with a relaxed taper through the leg.",
    "100% Japanese selvedge cotton, 14oz", "Wash inside-out, cold. Hang dry.", "Woven in Okayama, Japan"],
  ["Tech Shell Jacket", "tech", 14900, null, "New", ALPHA.slice(1, 5), [], ["photo-1551028719-00167b16eac5"],
    "A 3-layer waterproof shell engineered for movement. Taped seams, laser-cut ventilation and an articulated fit.",
    "3-layer ripstop nylon, 20K/20K membrane", "Wipe clean. Do not iron.", "Engineered in Vietnam"],
  ["Compression Legging", "tech", 3990, null, null, ALPHA.slice(0, 5), ["XS"], ["photo-1571019613454-1cb2f99b2d8b"],
    "Graduated compression from ankle to waist. Moisture-wicking, four-way stretch, flatlock seams that disappear under layers.",
    "72% nylon, 28% elastane, recycled yarn", "Machine wash cold. No fabric softener.", "Made in Sri Lanka"],
  ["Wool Tailored Trouser", "luxury", 9900, null, null, WAIST, ["30"], ["photo-1473966968600-fa801b869a1a"],
    "A fluid, single-pleat trouser in Italian virgin wool. Tailored through the thigh, tapered to a clean break.",
    "100% Italian virgin wool, 240gsm", "Dry clean recommended.", "Tailored in Italy"],
  ["Loopback Hoodie", "everyday", 4990, null, null, ALPHA.slice(1), [], ["photo-1556821840-3a63f95609a7"],
    "Classic loopback jersey, brushed inside for warmth. Relaxed, true-to-size fit with a double-layer hood.",
    "100% loopback cotton, 380gsm", "Machine wash cold, inside-out.", "Cut and sewn in Portugal"],
  ["Puffer Vest", "tech", 8900, null, null, ALPHA.slice(1, 5), [], ["photo-1591047139829-d91aecb6caea"],
    "850-fill responsibly sourced down in a ripstop shell. Warms the core without restricting the arms.",
    "Ripstop nylon shell, 850-fill down", "Machine wash cold, tumble dry low.", "Made in Vietnam"],
  ["Silk Blend Shirt", "luxury", 7900, 9500, null, ALPHA.slice(1, 5), ["S"], ["photo-1602810318383-e386cc2a3ccf"],
    "A fluid shirt woven from a silk-cotton blend that catches the light. Camp collar, relaxed body, mother-of-pearl buttons.",
    "55% silk, 45% cotton", "Dry clean, or hand wash cold.", "Woven in Como, Italy"],
  ["Cotton Chino", "everyday", 3990, null, null, WAIST, ["36"], ["photo-1473966968600-fa801b869a1a"],
    "A versatile chino in garment-dyed stretch twill. Slim through the thigh with a clean taper.",
    "98% cotton, 2% elastane twill", "Machine wash cold, hang dry.", "Cut and sewn in Portugal"],
  ["Performance Shorts", "tech", 2790, null, null, ALPHA.slice(1, 5), [], ["photo-1571019613454-1cb2f99b2d8b"],
    "7-inch run shorts with a built-in liner, drop-in pockets and a hidden zip pocket for your phone.",
    "Recycled polyester, 4-way stretch", "Machine wash cold, hang dry.", "Made in Sri Lanka"],
];

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/**
 * @param {(text: string, params?: any[]) => Promise<any[]>} query
 * @param {{ demo?: boolean }} opts
 */
export async function seed(query, { demo = false } = {}) {
  // First admin account
  const [{ n: admins }] = await query("SELECT count(*)::int AS n FROM admins");
  if (!admins) {
    const email = process.env.ADMIN_EMAIL;
    const password = process.env.ADMIN_PASSWORD;
    if (email && password) {
      await query("INSERT INTO admins (email, name, password_hash) VALUES ($1, $2, $3)", [email.toLowerCase(), "Owner", hashPassword(password)]);
      console.log(`[db] created admin account ${email}`);
    } else {
      console.warn("[db] no admin account exists - set ADMIN_EMAIL and ADMIN_PASSWORD, then run again");
    }
  }

  if (!demo) return;
  const [{ n: products }] = await query("SELECT count(*)::int AS n FROM products");
  if (products) return;

  const catId = {};
  for (const [i, c] of CATEGORIES.entries()) {
    const [row] = await query(
      "INSERT INTO categories (name, slug, description, image_url, sort_order) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id",
      [c.name, c.slug, c.description, img(c.image).url, i]
    );
    catId[c.slug] = row.id;
  }

  for (const [i, p] of PRODUCTS.entries()) {
    const [name, cat, price, compare, badge, sizes, soldOut, photos, description, fabric, care, origin] = p;
    const [row] = await query(
      `INSERT INTO products (name, slug, description, category_id, price, compare_at_price, status, badge, fabric, care, origin, is_featured, published_at, announced_at)
       VALUES ($1,$2,$3,$4,$5,$6,'active',$7,$8,$9,$10,$11, now() - make_interval(hours => $12::int), now()) RETURNING id`,
      [name, slug(name), description, catId[cat], price, compare, badge, fabric, care, origin, i < 4, i * 30]
    );
    const type = /coat|jacket|vest/i.test(name) ? "Outerwear" : /crew|hoodie/i.test(name) ? "Knitwear" : /tee|shirt/i.test(name) ? "Tops" : "Bottoms";
    await query("UPDATE products SET product_type = $2 WHERE id = $1", [row.id, type]);
    for (const [j, id] of photos.entries()) {
      const im = img(id);
      await query("INSERT INTO product_images (product_id, url, thumb_url, sort_order) VALUES ($1,$2,$3,$4)", [row.id, im.url, im.thumb, j]);
    }
    // one demo product comes in two colours, to show how size x colour stock works; the rest have none
    const colours = name === "Heavyweight Tee" ? ["Black", "White"] : [""];
    let order = 0;
    for (const colour of colours) {
      for (const [j, size] of sizes.entries()) {
        const stock = soldOut.includes(size) ? 0 : 2 + ((i * 7 + j * 3 + colour.length) % 9);
        await query("INSERT INTO variants (product_id, size, color, sku, stock, sort_order) VALUES ($1,$2,$3,$4,$5,$6)",
          [row.id, size, colour, `TBA-${row.id}-${size}${colour ? `-${colour.slice(0, 3).toUpperCase()}` : ""}`, stock, order++]);
      }
    }
  }

  await query("INSERT INTO sales (name, percent, scope, category_id, announced_at) VALUES ($1, $2, 'category', $3, now())", ["Everyday Edit", 15, catId.everyday]);

  // home hero slides: wide photos for desktop, tall crops for phones
  const wide = (id) => [`${U(id)}?auto=format&fit=crop&w=2000&h=1125&q=72`, 2000, 1125, "desktop"];
  const tall = (id) => [`${U(id)}?auto=format&fit=crop&w=1080&h=1620&q=72`, 1080, 1620, "mobile"];
  const SLIDES = [
    [...wide("photo-1490481651871-ab68de25d43d"), "New season · Live now", "Wear *like* you mean it.", "Considered pieces across luxury, everyday and tech. Cash on delivery nationwide.", "Shop new arrivals", "/products"],
    [...wide("photo-1483985988355-763728e1935b"), "The Everyday Edit", "Made for *every* day.", "Lived-in essentials, now 15% off for a limited time.", "Shop the sale", "/products?sale=1"],
    [...wide("photo-1556905055-8f358a7a47b2"), "The lookbook", "Cut with *intent*.", "See how the season comes together, then shop any look.", "See the lookbook", "/lookbook"],
    [...tall("photo-1539533018447-63fcce2678e3"), "New season · Live now", "Wear *like* you mean it.", "Considered pieces. Cash on delivery nationwide.", "Shop new arrivals", "/products"],
    [...tall("photo-1551028719-00167b16eac5"), "The Everyday Edit", "Made for *every* day.", "Lived-in essentials, now 15% off.", "Shop the sale", "/products?sale=1"],
    [...tall("photo-1521572163474-6864f9cf17ab"), "The lookbook", "Cut with *intent*.", "See the season, shop the look.", "See the lookbook", "/lookbook"],
  ];
  for (const [i, s] of SLIDES.entries()) {
    await query(
      `INSERT INTO banners (placement, image_url, width, height, auto_device, device, eyebrow, title, subtitle, cta_text, cta_link, sort_order)
       VALUES ('home', $1, $2, $3, $4, $4, $5, $6, $7, $8, $9, $10)`,
      [...s, i]
    );
  }
  await query("INSERT INTO coupons (code, type, value, min_subtotal) VALUES ('WELCOME10', 'percent', 10, 3000) ON CONFLICT DO NOTHING");
  console.log("[db] demo catalogue loaded");
}
