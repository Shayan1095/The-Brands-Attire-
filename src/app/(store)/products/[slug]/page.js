import Link from "next/link";
import { notFound } from "next/navigation";
import { getProductBySlug, listProducts, toCard } from "@/lib/catalog";
import { getSettings, siteUrl } from "@/lib/settings";
import { money } from "@/lib/format";
import ProductCard from "@/components/store/ProductCard";
import ProductDetail from "@/components/store/ProductDetail";
import { Marquee } from "@/components/store/ui";

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const p = await getProductBySlug(slug);
  if (!p) return { title: "Not found" };
  return {
    title: p.name,
    description: p.description.slice(0, 160),
    openGraph: { title: p.name, description: p.description.slice(0, 160), images: p.images[0] ? [p.images[0].url] : [] },
  };
}

export default async function ProductPage({ params }) {
  const { slug } = await params;
  const p = await getProductBySlug(slug);
  if (!p) notFound();
  const [settings, related] = await Promise.all([
    getSettings(),
    listProducts({ category: p.category_slug, excludeId: p.id, limit: 4 }),
  ]);
  const { shipping, store, orders } = settings;

  // rich results in Google
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.name,
    description: p.description,
    image: p.images.map((i) => i.url),
    brand: { "@type": "Brand", name: store.name },
    offers: {
      "@type": "Offer",
      url: `${siteUrl()}/products/${p.slug}`,
      price: p.final_price,
      priceCurrency: store.currency === "Rs." ? "PKR" : store.currency,
      availability: p.total_stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
    },
  };

  const product = {
    id: p.id, slug: p.slug, name: p.name, description: p.description, category: p.category_name,
    price: p.final_price, was: p.original_price, off: p.off,
    images: p.images, variants: p.variants.map(({ id, size, color, stock }) => ({ id, size, color, stock })),
    lowAt: p.low_stock_threshold, fabric: p.fabric, care: p.care, origin: p.origin,
  };
  const perks = [
    "Cash on delivery: pay when it arrives",
    shipping.free_over > 0 ? `Free delivery over ${money(shipping.free_over, store.currency)} · arrives in ${shipping.eta}` : `Delivery in ${shipping.eta}`,
    "Easy exchange within 7 days",
  ];

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <div className="wrap" style={{ paddingTop: 24 }}>
        <div className="crumbs" data-reveal>
          <Link href="/">Home</Link> / <Link href="/products">Shop</Link>
          {p.category_slug && <> / <Link href={`/products?category=${p.category_slug}`}>{p.category_name}</Link></>} / {p.name}
        </div>
        <ProductDetail product={product} perks={perks} returns={orders.returns} />
      </div>

      <Marquee className="marquee--band" items={[p.name, p.category_name || store.name, "Cash on delivery", `Delivery in ${shipping.eta}`, "Easy 7-day exchange"]} />

      {related.length > 0 && (
        <section className="section">
          <div className="wrap">
            <div className="section__head">
              <div><span className="eyebrow" data-reveal>You may also like</span><h2 data-split>Complete the look</h2></div>
              {p.category_slug && <Link href={`/products?category=${p.category_slug}`} className="link-arrow" data-reveal>More {p.category_name}</Link>}
            </div>
            <div className="grid">{related.map((r) => <ProductCard key={r.id} p={toCard(r)} />)}</div>
          </div>
        </section>
      )}
    </>
  );
}
