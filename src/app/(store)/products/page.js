import { Suspense } from "react";
import { listProducts, listCategories, getActiveSales, toCard } from "@/lib/catalog";
import { getSettings } from "@/lib/settings";
import { money } from "@/lib/format";
import { heroBanner } from "@/lib/banners";
import Catalog from "@/components/store/Catalog";
import { HERO_IMAGES } from "@/components/store/ui";

export async function generateMetadata({ searchParams }) {
  const { category, sale } = await searchParams;
  if (sale) return { title: "Sale" };
  if (category) return { title: String(category).charAt(0).toUpperCase() + String(category).slice(1) };
  return { title: "Shop all" };
}

export default async function Products() {
  // everything is sent once; the Catalog filters and sorts in the browser
  const [products, categories, sales, settings, shop, sale] = await Promise.all([
    listProducts(),
    listCategories(),
    getActiveSales(),
    getSettings(),
    heroBanner("shop", HERO_IMAGES.shop),
    heroBanner("sale", HERO_IMAGES.sale),
  ]);
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
    <Suspense fallback={null}>
      <Catalog
        products={products.map((p) => ({ ...toCard(p), cat: p.category_slug, featured: p.is_featured, desc: p.description }))}
        categories={categories.map(({ id, name, slug, description, image_url, product_count, icon }) => ({ id, name, slug, description, image_url, product_count, icon }))}
        banners={{ shop, sale }}
        perks={perks}
        sale={onSale.length ? {
          name: saleName || "Sale",
          top: Math.max(...onSale.map((p) => p.off)),
          endsAt: sales.find((s) => s.name === saleName)?.ends_at?.toISOString() || null,
        } : null}
      />
    </Suspense>
  );
}
