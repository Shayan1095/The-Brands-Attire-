import Link from "next/link";
import { getSettings } from "@/lib/settings";
import { listProducts, listCategories, toCard } from "@/lib/catalog";
import { money } from "@/lib/format";
import ProductCard from "@/components/store/ProductCard";
import Subscribe from "@/components/store/Subscribe";
import { Marquee } from "@/components/store/ui";
import HeroSlider from "@/components/store/HeroSlider";
import { getBanners } from "@/lib/banners";
import { Icon } from "@/components/store/icons";

export default async function Home() {
  const [settings, products, categories, banners] = await Promise.all([getSettings(), listProducts(), listCategories(), getBanners("home")]);
  // no slides uploaded yet: fall back to the single picture from Settings
  const slides = banners.length ? banners : [{ id: 0, image_url: settings.hero.image, device: "both" }];
  const { hero, shipping, store } = settings;
  const onSale = products.filter((p) => p.off > 0);
  const topOff = Math.max(0, ...onSale.map((p) => p.off));
  const ticker = hero.ticker.split("·").map((t) => t.trim()).filter(Boolean);

  return (
    <>
      {/* 1. HERO: slideshow (Admin -> Banners) with moving text banner (Admin -> Settings) */}
      <header className="hero" data-hero>
        <HeroSlider slides={slides} fallback={hero} saleLink={onSale.length > 0 ? "/products?sale=1" : null} />
        {ticker.length > 0 && <Marquee items={ticker} className="hero__marquee" />}
      </header>

      {/* 2. TRUST */}
      <section className="trust" aria-label="Why shop with us">
        <div className="wrap trust__grid">
          <div className="trust__item" data-reveal><Icon name="cash" /><div><b>Cash on delivery</b><span>Pay when it arrives</span></div></div>
          <div className="trust__item" data-reveal><Icon name="truck" /><div><b>{shipping.free_over > 0 ? `Free delivery over ${money(shipping.free_over, store.currency)}` : "Nationwide delivery"}</b><span>Arrives in {shipping.eta}</span></div></div>
          <div className="trust__item" data-reveal><Icon name="refresh" /><div><b>Easy exchange</b><span>Within 7 days of delivery</span></div></div>
          <div className="trust__item" data-reveal><Icon name="chat" /><div><b>WhatsApp support</b><span>Real people, quick replies</span></div></div>
        </div>
      </section>

      {/* 3. CATEGORIES */}
      {categories.length > 0 && (
        <section className="section">
          <div className="wrap">
            <div className="section__head">
              <div><span className="eyebrow" data-reveal>Shop by category</span><h2 data-split>{categories.length === 3 ? "Three worlds. One point of view." : "Find your world"}</h2></div>
              <Link href="/products" className="link-arrow" data-reveal>View all</Link>
            </div>
            <div className="cats">
              {categories.map((c, i) => (
                <Link key={c.id} href={`/products?category=${c.slug}`} className="cat" data-clip>
                  <div className="cat__img">{c.image_url && <img src={c.image_url} alt="" loading="lazy" decoding="async" data-parallax />}</div>
                  <span className="cat__num">/ {String(i + 1).padStart(2, "0")}</span>
                  <div className="cat__label">
                    <div><h3>{c.name}</h3><small>{c.product_count} {c.product_count === 1 ? "piece" : "pieces"}</small></div>
                    <span className="cat__go" aria-hidden><Icon name="arrow" /></span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* 4. NEW ARRIVALS: sideways run driven by scroll */}
      <section className="hscroll section--bone" data-hscroll aria-label="New arrivals">
        <div className="hscroll__pin" data-hscroll-pin>
          <div className="hscroll__track" data-hscroll-track>
            <div className="hscroll__intro">
              <div>
                <span className="eyebrow">Just landed</span>
                <h2 className="display">New<br />arrivals</h2>
                <p>The latest pieces, fresh off the cutting table. Sizes go quickly.</p>
              </div>
              <span className="hscroll__hint"><span className="on-desktop">Keep scrolling</span><span className="on-mobile">Swipe</span></span>
            </div>
            {products.slice(0, 8).map((p, i) => <ProductCard key={p.id} p={toCard(p)} eager={i < 3} reveal={false} />)}
            <Link href="/products" className="hscroll__more">
              <span>The full collection</span>
              <b>View all {products.length} pieces →</b>
            </Link>
          </div>
        </div>
      </section>

      {/* 5. MANIFESTO: words light up as you scroll */}
      <section className="manifesto">
        <div className="wrap">
          <span className="eyebrow" data-reveal>The ethos</span>
          <p className="manifesto__text" data-scrub-text>
            We make clothes for people who <em>mean it</em>. Cut with intent. Finished by hand. Priced without the theatre.
          </p>
          <div className="manifesto__foot" data-reveal>
            <span className="muted">{store.tagline}</span>
            <Link href="/lookbook" className="link-arrow">See how it is worn</Link>
          </div>
        </div>
      </section>

      {/* 6. SALE */}
      {onSale.length > 0 && (
        <section className="section--ink sale-band">
          <Marquee dir={-1} className="marquee--xl" items={[onSale[0].sale_name || "Sale", `Up to ${topOff}% off`, "Limited time"]} />
          <div className="wrap">
            <div className="section__head">
              <div><span className="eyebrow" style={{ color: "var(--signal)" }} data-reveal>Limited time</span><h2 data-split>{onSale[0].sale_name || "On sale now"}</h2></div>
              <Link href="/products?sale=1" className="link-arrow" data-reveal>All offers</Link>
            </div>
            <div className="grid">
              {onSale.slice(0, 4).map((p) => <ProductCard key={p.id} p={toCard(p)} />)}
            </div>
          </div>
        </section>
      )}

      {/* 7. EDITORIAL */}
      <section className="section">
        <div className="wrap">
          <div className="split" data-reveal>
            <div className="split__media">
              <img src="https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=1400&q=75" alt="" loading="lazy" data-parallax />
            </div>
            <div className="split__text">
              <span className="eyebrow" style={{ color: "var(--signal)" }}>The lookbook</span>
              <h2 data-split>The <em>technique</em> behind the seam.</h2>
              <p>Every piece is cut with intent and finished by hand. See how the season comes together, then shop any look straight from the frame.</p>
              <Link href="/lookbook" className="btn btn--light">See the lookbook <span aria-hidden>→</span></Link>
              <div className="split__stats">
                <div><b>{products.length}</b>Pieces</div>
                <div><b>{categories.length}</b>Collections</div>
                <div><b>7</b>Day exchange</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 8. NEWSLETTER */}
      <section className="section section--bone center newsletter-block">
        <div className="wrap">
          <span className="eyebrow" data-reveal>Stay in the loop</span>
          <h2 className="display" data-split>Get the drops <em>first</em>.</h2>
          <p className="muted" style={{ marginTop: 12 }} data-reveal>New arrivals and offers, by email or WhatsApp. No spam.</p>
          <div data-reveal><Subscribe /></div>
        </div>
      </section>
    </>
  );
}
