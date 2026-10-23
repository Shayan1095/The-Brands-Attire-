import Link from "next/link";
import { listProducts, listCategories, toCard } from "@/lib/catalog";
import Lookbook from "@/components/store/Lookbook";
import Subscribe from "@/components/store/Subscribe";
import GalleryCover from "@/components/store/gallery/GalleryCover";
import ChapterIndex from "@/components/store/gallery/ChapterIndex";
import ProductRail from "@/components/store/pdp/ProductRail";
import { getSettings } from "@/lib/settings";
import { showcaseFor } from "@/lib/showcase";

export const metadata = { title: "Gallery" };

// The gallery builds itself from the product photos, one chapter per collection, so it never needs updating by hand.
// The owner can still choose, order and hide a chapter's photos in Admin -> Showcase (first photo = chapter cover).
export default async function LookbookPage() {
  const [products, categories, settings] = await Promise.all([listProducts(), listCategories(), getSettings()]);
  const curated = settings.showcase?.gallery || {};

  let n = 0; // frame number across the whole gallery
  const chapterOf = (name, slug, description, icon, items, href) => {
    // automatic: up to 3 photos of each piece; hand-picked: exactly the owner's photos, in their order
    const all = items.flatMap((p) => p.images.map((image, i) => ({ image, p, auto: i < 3 })));
    const order = Array.isArray(curated[slug]) && curated[slug].length ? curated[slug].map(Number) : null;
    const picked = order
      ? order.map((id) => all.find((f) => f.image.id === id)).filter(Boolean)
      : all.filter((f) => f.auto);
    const frames = (picked.length ? picked : all.filter((f) => f.auto))
      .map(({ image, p }) => ({ n: n++, image, product: { ...toCard(p), desc: p.description } }));
    return { name, slug, description, icon, href, pieces: new Set(frames.map((f) => f.product.id)).size, frames };
  };
  const chapters = categories
    .map((c) => chapterOf(c.name, c.slug, c.description, c.icon, products.filter((p) => p.category_id === c.id), `/products?category=${c.slug}`))
    .filter((c) => c.frames.length);
  const loose = products.filter((p) => !categories.some((c) => c.id === p.category_id));
  if (loose.length) chapters.push(chapterOf("More", "more", "", "", loose, "/products"));
  const frames = chapters.flatMap((c) => c.frames);
  const shown = products.filter((p) => p.images.length);

  return (
    <>
      <GalleryCover photos={frames.map((f) => f.image.thumb)} frames={frames.length} pieces={shown.length} chapters={chapters.length} />

      {chapters.length > 1 && (
        <ChapterIndex chapters={chapters.map(({ slug, name, pieces, frames: f }) => ({ slug, name, pieces, frames: f.map(() => 0), cover: f[0]?.image.thumb }))} />
      )}

      {chapters.length ? (
        <Lookbook chapters={chapters} />
      ) : (
        <div className="empty"><h2>Coming soon</h2><p>New looks are on their way.</p></div>
      )}

      <ProductRail
        showcase="lookbook" eyebrow="Everything in these frames" title="Shop the lookbook" items={(await showcaseFor("lookbook", shown)).map(toCard)}
        link="/products" linkLabel={`All ${products.length} pieces`}
      />

      {/* closing: the same black finale as the home page, flowing into the footer */}
      <section className="close close--compact" aria-label="Get the next drop">
        <span className="close__ghost" data-drift aria-hidden>Wear it yourself ✦ Wear it yourself ✦ Wear it yourself</span>
        <div className="wrap close__grid">
          <div className="close__copy">
            <span className="eyebrow close__eyebrow" data-reveal><span className="hero__pulse" /> Seen enough?</span>
            <h2 className="display close__title" data-split>Wear it <em>yourself</em>.</h2>
            <p className="close__lede" data-reveal>Every piece in these frames is in the shop now. Get the next drop on WhatsApp or by email before it reaches the gallery.</p>
          </div>
          <div className="close__copy">
            <div className="close__form" data-reveal><Subscribe /></div>
            <p className="close__fine" data-reveal>No spam. Unsubscribe any time with one tap.</p>
            <Link href="/products" className="btn btn--light close__shop" data-reveal>Shop the collection <span aria-hidden>→</span></Link>
          </div>
        </div>
      </section>
    </>
  );
}
