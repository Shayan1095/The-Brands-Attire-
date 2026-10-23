import Link from "next/link";
import { notFound } from "next/navigation";
import { getProductBySlug, listProducts, toCard } from "@/lib/catalog";
import { showcaseFor } from "@/lib/showcase";
import { getSettings, siteUrl } from "@/lib/settings";
import { money } from "@/lib/format";
import ProductDetail from "@/components/store/ProductDetail";
import ProductRail from "@/components/store/pdp/ProductRail";
import RecentlyViewed from "@/components/store/pdp/RecentlyViewed";
import DetailStory from "@/components/store/pdp/DetailStory";
import ScrollVelocity from "@/components/bits/ScrollVelocity/ScrollVelocity";

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const p = await getProductBySlug(slug);
  if (!p) return { title: "Not found" };
  return {
    title: p.name,
    description: p.description.slice(0, 160),
    // the shared-link picture is made by opengraph-image.js next to this page (photo, name and price)
    openGraph: { title: p.name, description: p.description.slice(0, 160) },
  };
}

export default async function ProductPage({ params }) {
  const { slug } = await params;
  const p = await getProductBySlug(slug);
  if (!p) notFound();
  const [settings, sameCategory] = await Promise.all([
    getSettings(),
    listProducts({ category: p.category_slug, excludeId: p.id, limit: 10 }),
  ]);
  const { shipping, store, orders } = settings;
  // a small category still gets a full row: top up with other pieces
  const related = sameCategory.length >= 4
    ? sameCategory
    : [...sameCategory, ...(await listProducts({ excludeId: p.id, sort: "featured", limit: 10 })).filter((r) => !sameCategory.some((s) => s.id === r.id))].slice(0, 10);
  const shown = await showcaseFor("related", related, { exclude: [p.id] });
  const url = `${siteUrl()}/products/${p.slug}`;

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
      url,
      price: p.final_price,
      priceCurrency: store.currency === "Rs." ? "PKR" : store.currency,
      availability: p.total_stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
    },
  };

  const product = {
    id: p.id, slug: p.slug, name: p.name, description: p.description,
    category: p.category_name, categorySlug: p.category_slug, type: p.product_type, badge: p.badge,
    price: p.final_price, was: p.original_price, off: p.off,
    images: p.images, variants: p.variants.map(({ id, size, color, stock }) => ({ id, size, color, stock })),
    lowAt: p.low_stock_threshold, fabric: p.fabric, care: p.care, origin: p.origin, fitNote: p.fit_note || "",
  };
  // the details story: what the product has filled in, then fit and delivery, which every piece has
  const freeOver = Number(shipping.free_over) || 0;
  const story = [
    p.fabric && { label: "Fabric", value: p.fabric },
    p.care && { label: "Care", value: p.care },
    p.origin && { label: "Made in", value: p.origin, note: "Finished and checked by hand before it ships." },
    { label: "Fit", value: p.fit_note || "True to size. Between sizes? Go down for a closer fit, up for a relaxed one.", note: p.fit_note ? "From what customers told us after wearing it." : "Measurements are in the size guide above." },
    { label: "Delivery & exchange", value: `Cash on delivery, arriving in ${shipping.eta}${freeOver ? `, free over ${money(freeOver, store.currency)}` : ""}.`, note: orders.returns },
  ].filter(Boolean);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <div className="wrap pdp-wrap">
        <nav className="crumbs" aria-label="Breadcrumb" data-reveal>
          <Link href="/">Home</Link> / <Link href="/products">Shop</Link>
          {p.category_slug && <> / <Link href={`/products?category=${p.category_slug}`}>{p.category_name}</Link></>} / <span aria-current="page">{p.name}</span>
        </nav>
        <ProductDetail
          product={product} url={url} returns={orders.returns}
          shipping={{ eta: shipping.eta, fee: shipping.fee, freeOver: Number(shipping.free_over) || 0 }}
        />
      </div>

      {/* the banner speeds up, and leans, with how fast you scroll */}
      <div className="pdv" aria-hidden>
        <ScrollVelocity
          texts={[`${p.name} ✦ ${p.category_name || store.name} ✦`, `Cash on delivery ✦ Delivery in ${shipping.eta} ✦ Easy exchanges ✦`]}
          velocity={42} numCopies={6} className="pdv__text" outlineAlternate skewWithVelocity={4}
          parallaxClassName="pdv__row" scrollerClassName="pdv__scroller"
        />
      </div>

      {p.images.length > 0 && (
        <DetailStory
          name={p.name} rows={story} images={p.images}
          badges={[["check", "Quality checked by hand"], ["refresh", "7-day exchange"], ["cash", "Cash on delivery"]]}
        />
      )}

      <ProductRail
        eyebrow="You may also like" title="Complete the look" items={shown.map(toCard)} showcase="related"
        link={p.category_slug ? `/products?category=${p.category_slug}` : "/products"}
        linkLabel={p.category_slug ? `More ${p.category_name}` : "Shop all"}
      />
      <RecentlyViewed currentId={p.id} />
    </>
  );
}
