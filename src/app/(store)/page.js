import Link from "next/link";
import { getSettings } from "@/lib/settings";
import { listProducts, listCategories, toCard, getActiveSales } from "@/lib/catalog";
import { money } from "@/lib/format";
import ProductCard from "@/components/store/ProductCard";
import Subscribe from "@/components/store/Subscribe";
import { Marquee } from "@/components/store/ui";
import HeroSlider from "@/components/store/HeroSlider";
import { getBanners } from "@/lib/banners";
import { showcaseFor, showcasePhoto } from "@/lib/showcase";
import { Icon } from "@/components/store/icons";
import ArrivalsCarousel from "@/components/store/home/ArrivalsCarousel";
import ArrivalsStack from "@/components/store/home/ArrivalsStack";
import CategoryPanels from "@/components/store/home/CategoryPanels";
import EthosReveal from "@/components/store/home/EthosReveal";
import ChatPreview from "@/components/store/home/ChatPreview";
import { SaleCountdown, StatCounter } from "@/components/store/home/Counters";

export default async function Home() {
  const [settings, products, categories, banners, sales] = await Promise.all([getSettings(), listProducts(), listCategories(), getBanners("home"), getActiveSales()]);
  // no slides uploaded yet: fall back to the single picture from Settings
  const slides = banners.length ? banners : [{ id: 0, image_url: settings.hero.image, device: "both" }];
  const { hero, shipping, store } = settings;
  const onSale = products.filter((p) => p.off > 0);
  // what the curated sections show (Admin -> Showcase), automatic unless the owner hand-picked them
  const [arrivals, salePicks, ethosPhoto, lookPhoto] = await Promise.all([
    showcaseFor("arrivals", products), showcaseFor("sale", onSale, { filter: (p) => p.off > 0 }),
    showcasePhoto("ethos"), showcasePhoto("look"),
  ]);
  const topOff = Math.max(0, ...onSale.map((p) => p.off));
  const ticker = hero.ticker.split("·").map((t) => t.trim()).filter(Boolean);
  // the countdown follows the sale the featured offer belongs to, when that sale has an end date
  const sale = sales.find((x) => x.name === onSale[0]?.sale_name);
  const saleEnds = sale?.ends_at ? new Date(sale.ends_at).toISOString() : null;

  return (
    <>
      {/* 1. HERO: slideshow (Admin -> Banners) with moving text banner (Admin -> Settings) */}
      <header className="hero" data-hero data-showcase="photo-hero">
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
            <CategoryPanels categories={categories} />
          </div>
        </section>
      )}

      {/* 4. NEW ARRIVALS: desktop deals a stack of cards as you scroll; phones swipe a carousel */}
      <ArrivalsStack items={arrivals.map(toCard)} total={products.length} />
      <ArrivalsCarousel items={arrivals.map(toCard)} total={products.length} />

      {/* 5. ETHOS: a giant "MEAN IT" with the photo inside the letters, zooming open as you scroll */}
      <EthosReveal tagline={store.tagline} photo={ethosPhoto} />

      {/* 6. SALE: the offer on the left stays in view; cards drift past in two staggered columns */}
      {onSale.length > 0 && (
        <section className="section--ink saleb" data-showcase="sale" aria-label="Sale">
          <Marquee dir={-1} className="marquee--offer" items={[onSale[0].sale_name || "Sale", `Up to ${topOff}% off`, "Limited time"]} />
          <div className="wrap saleb__grid">
            <div className="saleb__intro">
              <span className="eyebrow saleb__eyebrow" data-reveal><span className="hero__pulse" /> Limited time</span>
              <h2 className="saleb__name" data-split>{onSale[0].sale_name || "On sale now"}</h2>
              <p className="saleb__big" data-reveal>Up to <b><StatCounter value={topOff} suffix="%" /></b> off</p>
              <p className="saleb__lede" data-reveal>{onSale.length} {onSale.length === 1 ? "piece" : "pieces"} reduced. The prices you see already include the discount.</p>
              {saleEnds && <div data-reveal><SaleCountdown endsAt={saleEnds} /></div>}
              <div className="saleb__cta" data-reveal>
                <Link href="/products?sale=1" className="btn btn--light">Shop the sale <span aria-hidden>→</span></Link>
              </div>
            </div>
            <div className="saleb__cards">
              {[0, 1].map((col) => (
                <div key={col} className={`saleb__col saleb__col--${col}`} data-speed={col ? "0.14" : "-0.06"}>
                  {salePicks.filter((_, i) => i % 2 === col).map((p) => <ProductCard key={p.id} p={toCard(p)} />)}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* 7. LOOKBOOK: the photo grows from an inset frame to full width as you scroll */}
      <section className="look" data-showcase="photo-look" aria-label="The lookbook">
        <div className="look__frame" data-expand>
          <img
            className="look__img" data-expand-img alt=""
            src={lookPhoto || "https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=2000&q=72"}
            srcSet={lookPhoto ? undefined : "https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=900&q=72 900w, https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=2000&q=72 2000w"}
            sizes="100vw" loading="lazy" decoding="async"
          />
          <div className="look__shade" aria-hidden />
          <div className="wrap look__content">
            <div className="look__card">
              <span className="eyebrow look__eyebrow" data-reveal>The lookbook</span>
              <h2 className="look__title" data-split>The <em>technique</em> behind the seam.</h2>
              <p data-reveal>Every piece is cut with intent and finished by hand. See how the season comes together, then shop any look straight from the frame.</p>
              <div className="look__row" data-reveal>
                <Link href="/lookbook" className="btn btn--light">See the lookbook <span aria-hidden>→</span></Link>
                <div className="look__stats">
                  <div><b><StatCounter value={products.length} /></b>Pieces</div>
                  <div><b><StatCounter value={categories.length} /></b>Collections</div>
                  <div><b><StatCounter value={7} /></b>Day exchange</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 8. CLOSING: sign up, with a live preview of the WhatsApp updates; flows straight into the footer */}
      <section className="close" aria-label="Get the drops first">
        <span className="close__ghost" data-drift aria-hidden>Get the drops first ✦ Get the drops first ✦ Get the drops first</span>
        <div className="wrap close__grid">
          <div className="close__copy">
            <span className="eyebrow close__eyebrow" data-reveal><span className="hero__pulse" /> Stay in the loop</span>
            <h2 className="display close__title" data-split>Get the drops <em>first</em>.</h2>
            <p className="close__lede" data-reveal>New arrivals and offers reach your WhatsApp or inbox before anyone else hears about them. This is exactly what it looks like.</p>
            <ul className="close__perks">
              <li data-reveal><span>01</span>Early access to every new arrival</li>
              <li data-reveal><span>02</span>Offers before they go public</li>
              <li data-reveal><span>03</span>Email or WhatsApp: your choice</li>
            </ul>
            <div className="close__form" data-reveal><Subscribe /></div>
            <p className="close__fine" data-reveal>No spam. Unsubscribe any time with one tap.</p>
          </div>
          <div className="close__stage">
            <ChatPreview
              storeName={store.name} fmt={(n) => money(n, store.currency)}
              product={products[0] ? { name: products[0].name, price: products[0].final_price, was: products[0].original_price, image: products[0].images[0]?.thumb } : null}
              sale={onSale.length ? { name: onSale[0].sale_name || "The sale", off: topOff } : null}
            />
          </div>
        </div>
      </section>
    </>
  );
}
