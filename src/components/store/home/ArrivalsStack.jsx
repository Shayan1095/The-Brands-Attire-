import Link from "next/link";
import ProductCard from "../ProductCard";
import { Icon } from "../icons";

/*
  New arrivals on desktop: a deck that is dealt as you scroll.
  The section holds still while scrolling deals the next card in from the right onto the stack;
  the cards beneath slip back, shrink, tilt and darken, and the oldest fade away. Scrolling up
  takes them back off. The animation itself lives in Motion.jsx ([data-stack]); this is only markup.
  Phones (and visitors who prefer less motion) get the swipeable carousel instead.
*/
export default function ArrivalsStack({ items, total }) {
  if (items.length < 2) return null;
  const n = String(items.length).padStart(2, "0");
  return (
    <section className="stack section--bone" data-stack data-showcase="arrivals" id="new-arrivals" aria-label="New arrivals">
      <div className="stack__pin" data-stack-pin>
        <div className="wrap stack__grid">
          <div className="stack__intro">
            <span className="eyebrow">Just landed · {n} new pieces</span>
            <h2 className="display stack__title">New <em>arrivals</em></h2>
            <p className="stack__lede">The latest pieces, fresh off the cutting table. Sizes go quickly.</p>
            <div className="stack__meter" aria-hidden>
              <span className="stack__count"><b data-stack-count>01</b> / {n}</span>
              <i><b data-stack-bar /></i>
            </div>
            <div className="stack__actions">
              <Link href="/products" className="btn">View all {total} pieces <span aria-hidden>→</span></Link>
              <span className="stack__hint" aria-hidden><span className="stack__mouse" /> Scroll to deal</span>
            </div>
          </div>

          <div className="stack__stage" data-stack-stage>
            {items.map((p, i) => (
              <div className="stack__card" data-stack-card key={p.id} style={{ zIndex: i + 1 }}>
                {/* eager: cards wait off-screen, where lazy loading would only fetch the photo mid-deal */}
                <ProductCard p={p} reveal={false} eager />
                <span className="stack__shade" data-stack-shade aria-hidden />
              </div>
            ))}
            <Link href="/products" className="stack__card stack__more" data-stack-card style={{ zIndex: items.length + 1 }}>
              <span className="stack__more-top">The full collection</span>
              <b>All {total} pieces</b>
              <span className="stack__more-go">Shop now <Icon name="arrow" /></span>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
