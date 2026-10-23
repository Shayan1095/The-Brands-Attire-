import { listProducts, listCategories, getActiveSales, toCard } from "@/lib/catalog";
import { getSettings } from "@/lib/settings";
import { money } from "@/lib/format";
import { heroBanner } from "@/lib/banners";
import Catalog from "@/components/store/Catalog";
import { HERO_IMAGES } from "@/components/store/ui";

const QUERY_KEYS = ["category", "sale", "saved", "sort", "stock", "price", "q", "size", "color"];

export async function generateMetadata({ searchParams }) {
  const { category, sale } = await searchParams;
  if (sale) return { title: "Sale" };
  if (category) return { title: String(category).charAt(0).toUpperCase() + String(category).slice(1) };
  return { title: "Shop all" };
}

export default async function Products({ searchParams }) {
  // everything is sent once; the Catalog filters and sorts in the browser
  const [params, products, categories, sales, settings, shop, sale] = await Promise.all([
    searchParams,
    listProducts(),
    listCategories(),
    getActiveSales(),
    getSettings(),
    heroBanner("shop", HERO_IMAGES.shop),
    heroBanner("sale", HERO_IMAGES.sale),
  ]);
  // the filters in the address, read here so the first paint already shows the right products
  // (reading them in the browser instead would hold the whole catalogue back until it hydrates)
  const query = Object.fromEntries(QUERY_KEYS.filter((k) => typeof params[k] === "string" && params[k]).map((k) => [k, params[k]]));

  const onSale = products.filter((p) => p.off > 0);
  const saleName = onSale.find((p) => p.sale_name)?.sale_name;
  const { shipping, store } = settings;
  const perks = [
    ["cash", "Cash on delivery", "Pay when it arrives"],
    ["truck", shipping.free_over > 0 ? `Free delivery over ${money(shipping.free_over, store.currency)}` : "Nationwide delivery", `Arrives in ${shipping.eta}`],
    ["refresh", "Easy exchange", "Within 7 days of delivery"],
    ["chat", "WhatsApp support", "Real people, quick replies"],
  ];

  return (
    <Catalog
      query={query}
      products={products.map((p) => ({
        ...toCard(p),
        // the quick view shows every photo (a few at most), the card only the first two
        images: p.images.slice(0, 6),
        cat: p.category_slug, featured: p.is_featured, desc: p.description, lowAt: p.low_stock_threshold,
      }))}
      categories={categories.map(({ id, name, slug, description, image_url, product_count, icon }) => ({ id, name, slug, description, image_url, product_count, icon }))}
      banners={{ shop, sale }}
      perks={perks}
      sale={onSale.length ? {
        name: saleName || "Sale",
        top: Math.max(...onSale.map((p) => p.off)),
        endsAt: sales.find((s) => s.name === saleName)?.ends_at?.toISOString() || null,
      } : null}
    />
  );
}
