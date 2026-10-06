import Link from "next/link";

/** Endless ticker. Motion.jsx animates it; without JS it is a static strip. `dir` -1 runs right-to-left reversed. */
export function Marquee({ items, dir = 1, className = "" }) {
  // repeat enough that one row is always wider than the screen
  const list = Array.from({ length: Math.max(2, Math.ceil(12 / items.length)) }, () => items).flat();
  const row = (hidden) => (
    <div className="marquee__row" aria-hidden={hidden || undefined}>
      {list.map((text, i) => <span key={i}>{text}<i>✦</i></span>)}
    </div>
  );
  return (
    <div className={`marquee ${className}`} data-marquee={dir}>
      <div className="marquee__track">{row(false)}{row(true)}</div>
    </div>
  );
}

/**
 * Hero for inner pages: parallax photo, masked headline, giant outlined word drifting behind.
 * `crumbs` is [[label, href?], ...]; `meta` is [[value, label], ...] shown bottom-right.
 * Children are shown as a card beside the headline (the track page puts its form there).
 * `tall` makes it fill the screen like the home hero; `ticker` adds the moving text strip along its base.
 * `image` is a URL, or { desktop, mobile } from lib/banners.js so each screen type gets a photo that suits it.
 */
export function PageHero({ crumbs = [], title, accent, text, image, ghost, meta = [], tall = false, ticker, children }) {
  const photo = typeof image === "string" ? { desktop: image, mobile: image } : image;
  return (
    <section className={`page-hero ${tall ? "page-hero--tall" : ""}`}>
      {photo?.desktop && (
        <div className="page-hero__media" data-parallax-box>
          <picture>
            <source media="(max-width: 760px)" srcSet={photo.mobile} />
            <img src={photo.desktop} alt="" data-parallax fetchPriority="high" />
          </picture>
        </div>
      )}
      <span className="page-hero__ghost" data-drift aria-hidden>{ghost || title}</span>
      <div className={`wrap ${children ? "page-hero__split" : ""}`}>
        <div>
        <div className="crumbs" data-reveal>
          <Link href="/">Home</Link>
          {crumbs.map(([label, href]) => <span key={label}> / {href ? <Link href={href}>{label}</Link> : label}</span>)}
        </div>
        <h1 data-split>{title}{accent && <> <em>{accent}</em></>}</h1>
        <div className="page-hero__row">
          {text && <p data-reveal>{text}</p>}
          {meta.length > 0 && (
            <div className="page-hero__meta" data-reveal>
              {meta.map(([value, label]) => <div key={label}><b>{value}</b>{label}</div>)}
            </div>
          )}
        </div>
        </div>
        {children && <div className="page-hero__aside" data-reveal>{children}</div>}
      </div>
      {ticker?.length > 0 && <Marquee items={ticker} className="hero__marquee" />}
    </section>
  );
}

const U = (id, w = 1800) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=70`;
export const HERO_IMAGES = {
  shop: U("photo-1490481651871-ab68de25d43d"),
  sale: U("photo-1483985988355-763728e1935b"),
  lookbook: U("photo-1539533018447-63fcce2678e3"),
  contact: U("photo-1556905055-8f358a7a47b2"),
  track: U("photo-1551028719-00167b16eac5"),
  policies: U("photo-1620799140408-edc6dcb6d633"),
};
