"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { useStore } from "./Shell";
import { Icon } from "./icons";
import { variantLabel } from "@/lib/format";
import { morphTo, isModified } from "./morph";

const DOUBLE_TAP = 350; // ms between the two finger-downs of a double tap

/**
 * All of a product's photos inside the card (`photos` cards on the shop grid).
 *   mouse: moving across the photo shows the next one (the bars along the bottom follow)
 *   touch: swipe sideways through them (native scroll-snap, so it costs nothing while idle)
 * Only the first photo loads up front; the rest load once the pointer moves over it or a finger touches it.
 */
function CardPhotos({ images, name, eager, imgRef }) {
  const [at, setAt] = useState(0);
  const [armed, setArmed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const strip = useRef(null);

  const scrub = (e) => {
    // a real mouse move (cards sliding under a still pointer while scrolling do not count)
    if (e.pointerType !== "mouse" || (!e.movementX && !e.movementY)) return;
    if (!armed) setArmed(true);
    const box = e.currentTarget.getBoundingClientRect();
    setAt(Math.min(images.length - 1, Math.max(0, Math.floor(((e.clientX - box.left) / box.width) * images.length))));
  };
  const onScroll = () => {
    const el = strip.current;
    setAt(Math.round(el.scrollLeft / el.clientWidth));
  };

  return (
    <span
      className={`cphotos ${loaded ? "is-loaded" : ""}`}
      onTouchStart={() => setArmed(true)} onPointerMove={scrub}
      onPointerLeave={(e) => e.pointerType === "mouse" && setAt(0)}
    >
      <span className="cphotos__strip" ref={strip} onScroll={onScroll}>
        {images.map((im, i) => (
          <span key={im.id ?? i} className={`cphotos__slide ${i === at ? "is-on" : ""}`}>
            {(i === 0 || armed) && (
              <img
                ref={i === at ? imgRef : undefined} src={im.thumb} alt={i === 0 ? name : ""} width="600" height="750" draggable={false}
                loading={i === 0 && eager ? "eager" : "lazy"} decoding="async" onLoad={i === 0 ? () => setLoaded(true) : undefined}
              />
            )}
          </span>
        ))}
      </span>
      <span className="cphotos__bars" aria-hidden>
        {images.map((_, i) => <i key={i} className={i === at ? "is-on" : ""} />)}
      </span>
    </span>
  );
}

/**
 * `p` is the slim card shape from lib/catalog.js `toCard`.
 *   onQuickView  adds a button that opens the quick view
 *   photos       every photo in the card (swipe / pointer scrub) instead of the hover swap
 * Tapping the photo opens the product with the photo growing into place (morph.js); a double tap saves it.
 */
export default function ProductCard({ p, eager = false, reveal = true, onQuickView, photos = false }) {
  const { fmt, add, wish, toggleWish, quickAdd } = useStore();
  const router = useRouter();
  const [picking, setPicking] = useState(false);
  const [burst, setBurst] = useState(null); // { x, y, key } of a double-tap heart
  // the product page loads ahead once the shopper shows intent (pointer rests on the card, or a finger lands)
  const [intent, setIntent] = useState(false);
  const intentTimer = useRef(0);
  const href = `/products/${p.slug}`;
  const image = p.images[0];
  const wished = wish.includes(p.id);
  const imgRef = useRef(null);
  const pointer = useRef("mouse");
  const tap = useRef({ down: 0, prevDown: 0, timer: 0, opening: false });
  const gallery = photos && p.images.length > 1;

  useEffect(() => () => { clearTimeout(tap.current.timer); clearTimeout(intentTimer.current); }, []);
  const want = (now) => {
    if (intent) return;
    clearTimeout(intentTimer.current);
    if (now) setIntent(true);
    else if (!intentTimer.current) intentTimer.current = setTimeout(() => setIntent(true), 120);
  };

  const open = () => {
    if (tap.current.opening) return;
    tap.current.opening = true;
    setTimeout(() => { tap.current.opening = false; }, 1500); // in case the page change is cancelled
    morphTo(router, href, imgRef.current);
  };

  /** Links in the card open the product with the morph; new-tab clicks behave normally. */
  const onLink = (e) => {
    if (isModified(e)) return;
    e.preventDefault();
    open();
  };

  /** The photo: one tap opens, two quick taps save (touch only, so a mouse click never waits). */
  const onPhoto = (e) => {
    if (isModified(e)) return;
    e.preventDefault();
    if (pointer.current !== "touch") return open();
    const t = tap.current;
    if (t.opening) return;
    // timed between finger-downs, which is the rhythm of a real double tap (clicks arrive late and unevenly)
    if (t.timer && t.down - t.prevDown < DOUBLE_TAP) {
      clearTimeout(t.timer);
      t.timer = 0;
      const now = performance.now();
      const box = e.currentTarget.getBoundingClientRect();
      setBurst({ x: e.clientX - box.left, y: e.clientY - box.top, key: now });
      if (!wished) toggleWish(p.id);
      navigator.vibrate?.(12);
      return;
    }
    t.timer = setTimeout(() => { t.timer = 0; open(); }, DOUBLE_TAP);
  };

  const quickAddTap = () => {
    // phones get a bottom sheet with large size buttons; a mouse gets the size row inside the card
    if (pointer.current === "touch" || window.matchMedia("(hover: none)").matches) return quickAdd(p, imgRef.current);
    setPicking(true);
  };
  const pickSize = (v) => {
    add({ variantId: v.id, productId: p.id, slug: p.slug, name: p.name, size: variantLabel(v), image: image?.thumb, price: p.price, max: v.stock });
    setPicking(false);
  };

  return (
    <article
      className={`card ${gallery ? "card--photos" : ""}`} data-reveal={reveal ? "" : undefined}
      onPointerDown={(e) => { pointer.current = e.pointerType; want(true); }}
      // a real mouse movement over the card (cards sliding under a still pointer while scrolling do not count)
      onPointerMove={(e) => e.pointerType === "mouse" && (e.movementX || e.movementY) && want(false)} onPointerLeave={() => { clearTimeout(intentTimer.current); intentTimer.current = 0; }}
    >
      <div className="card__media">
        <a
          href={href} aria-label={p.name} tabIndex={-1} onClick={onPhoto}
          onPointerDown={(e) => {
            if (e.pointerType === "touch") { tap.current.prevDown = tap.current.down; tap.current.down = performance.now(); }
          }}
          draggable={false}
        >
          {gallery ? (
            <CardPhotos images={p.images} name={p.name} eager={eager} imgRef={imgRef} />
          ) : (
            <>
              {image && <img ref={imgRef} src={image.thumb} alt={p.name} width="600" height="750" loading={eager ? "eager" : "lazy"} decoding="async" draggable={false} />}
              {p.images[1] && <img className="card__alt" src={p.images[1].thumb} alt="" width="600" height="750" loading="lazy" decoding="async" draggable={false} />}
            </>
          )}
        </a>

        <AnimatePresence>
          {burst && (
            <motion.span
              key={burst.key} className="card__burst" style={{ left: burst.x, top: burst.y }} aria-hidden
              initial={{ scale: 0, opacity: 0, rotate: -14 }} animate={{ scale: [0, 1.25, 1], opacity: [0, 1, 1], rotate: 0 }} exit={{ scale: 1.5, opacity: 0, y: -30 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              onAnimationComplete={() => setTimeout(() => setBurst(null), 350)}
            >
              <Icon name="heart" />
              {[0, 1, 2, 3, 4, 5].map((n) => <i key={n} style={{ "--a": `${n * 60}deg` }} />)}
            </motion.span>
          )}
        </AnimatePresence>

        {p.soldOut ? <span className="card__tag card__tag--out">Sold out</span>
          : p.off ? <span className="card__tag card__tag--sale">−{p.off}%</span>
          : p.badge ? <span className="card__tag">{p.badge}</span> : null}

        <motion.button
          className={`card__wish ${wished ? "active" : ""}`} whileTap={{ scale: 0.8 }}
          aria-label={wished ? "Remove from wishlist" : "Save to wishlist"} aria-pressed={wished} onClick={() => toggleWish(p.id)}
        >
          {wished ? "♥" : "♡"}
        </motion.button>

        {onQuickView && (
          <button className="card__quick" aria-label={`Quick view: ${p.name}`} title="Quick view" onClick={() => onQuickView(p.id)}>
            <Icon name="eye" />
          </button>
        )}

        {!p.soldOut && !picking && (
          <button className="card__add" aria-label={`Add ${p.name} to bag`} onClick={quickAddTap}>
            <Icon name="bag" /><span>Add to bag</span>
          </button>
        )}

        <AnimatePresence>
          {picking && (
            <motion.div
              className="card__sizes"
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 420, damping: 38 }}
            >
              <header>Select size <button aria-label="Close size picker" onClick={() => setPicking(false)}>✕</button></header>
              <div>
                {p.variants.map((v) => (
                  <button key={v.id} disabled={!v.stock} onClick={() => pickSize(v)}>{variantLabel(v)}</button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="card__body">
        <div className="card__head">
          <div className="card__accent" />
          <span className="card__world">{p.category}</span>
          <Link href={href} className="card__name" onClick={onLink} prefetch={intent ? true : false}>{p.name}</Link>
        </div>
        <div className="card__foot">
          <div className="card__price">
            <span className={`now ${p.was ? "sale" : ""}`}>{fmt(p.price)}</span>
            {p.was && <span className="was">{fmt(p.was)}</span>}
          </div>
          <Link href={href} className="card__details" aria-label={`Details: ${p.name}`} onClick={onLink}>
            <em style={{ fontStyle: "normal" }}>Details</em>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden><path d="M5 12h14M13 6l6 6-6 6" /></svg>
          </Link>
        </div>
      </div>
    </article>
  );
}
