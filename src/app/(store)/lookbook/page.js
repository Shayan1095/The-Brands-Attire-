import Link from "next/link";
import { listProducts, listCategories, toCard } from "@/lib/catalog";
import { getSettings } from "@/lib/settings";
import { heroBanner } from "@/lib/banners";
import { PageHero, HERO_IMAGES } from "@/components/store/ui";
import Lookbook from "@/components/store/Lookbook";
import Subscribe from "@/components/store/Subscribe";

export const metadata = { title: "Gallery" };

// The gallery builds itself from the product photos, one chapter per collection, so it never needs updating by hand.
export default async function LookbookPage() {
  const [products, categories, banner, settings] = await Promise.all([
    listProducts(),
    listCategories(),
    heroBanner("lookbook", HERO_IMAGES.lookbook),
    getSettings(),
  ]);

  let n = 0; // frame number across the whole gallery
  const chapterOf = (name, slug, description, icon, items, href) => ({
    name, slug, description, icon, href, pieces: items.length,
    frames: items.flatMap((p) => p.images.slice(0, 3).map((image) => ({ n: n++, image, product: { ...toCard(p), desc: p.description } }))),
  });
  const chapters = categories
    .map((c) => chapterOf(c.name, c.slug, c.description, c.icon, products.filter((p) => p.category_id === c.id), `/products?category=${c.slug}`))
    .filter((c) => c.frames.length);
  const loose = products.filter((p) => !categories.some((c) => c.id === p.category_id));
  if (loose.length) chapters.push(chapterOf("More", "more", "", "", loose, "/products"));
  const frames = n;

  return (
    <>
      <PageHero
        tall crumbs={[["Gallery"]]} title="The" accent="lookbook" ghost="Lookbook" image={banner}
        text="The season, frame by frame. Open any look to see the piece and add your size."
        meta={[[frames, "Frames"], [products.length, "Pieces"], [chapters.length, chapters.length === 1 ? "Chapter" : "Chapters"]]}
        ticker={["Shot close", "Styled simply", "Made to be worn", `${frames} frames`, settings.store.name]}
      />

      <section className="manifesto manifesto--tight">
        <div className="wrap">
          <span className="eyebrow" data-reveal>The edit</span>
          <p className="manifesto__text" data-scrub-text>
            A season in <em>{frames} frames</em>. No studio tricks, just the cloth, the cut and the way it is worn.
          </p>
        </div>
      </section>

      {chapters.length ? (
        <Lookbook chapters={chapters} />
      ) : (
        <div className="empty"><h2>Coming soon</h2><p>New looks are on their way.</p></div>
      )}

      <section className="section">
        <div className="wrap">
          <div className="split" data-reveal>
            <div className="split__media">
              <img src={banner.desktop} alt="" loading="lazy" data-parallax />
            </div>
            <div className="split__text">
              <span className="eyebrow" style={{ color: "var(--signal)" }}>Seen enough?</span>
              <h2 data-split>Wear it <em>yourself</em>.</h2>
              <p>Every piece in these frames is in the shop now. Get the next drop before it reaches the gallery.</p>
              <Link href="/products" className="btn btn--light">Shop the collection <span aria-hidden>→</span></Link>
              <div className="split__subscribe"><Subscribe /></div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
