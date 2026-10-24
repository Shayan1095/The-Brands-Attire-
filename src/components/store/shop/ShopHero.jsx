"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import Counter from "@/components/bits/Counter/Counter";
import { Marquee } from "../ui";
import { srcSetOf, PHONE_FULL } from "@/lib/img-src";

const EASE = [0.16, 1, 0.3, 1];

/** Each word's letters rise out of a mask; a new title (another collection) plays it again. */
function Title({ words }) {
  let n = 0;
  return (
    <h1 className="shero__title" aria-label={words.map((w) => w.text).join(" ")}>
      {words.map((w, wi) => (
        <span key={`${w.text}-${wi}`} className={`shero__word ${w.accent ? "is-accent" : ""}`} aria-hidden>
          {Array.from(w.text).map((ch, ci) => (
            <motion.span
              key={ci} className="shero__char"
              initial={{ y: "108%" }} animate={{ y: "0%" }}
              transition={{ duration: 0.9, ease: EASE, delay: 0.05 + n++ * 0.028 }}
            >
              {ch}
            </motion.span>
          ))}
        </span>
      ))}
    </h1>
  );
}

/**
 * The top of the shop. The photo, title and numbers belong to the collection being browsed and change with it
 * (the photo wipes across). On desktop the collections are listed large on the right: pointing at one previews
 * its photo, clicking opens it without a page load.
 *
 * worlds = [{ key, label, count, image: { desktop, mobile }, active, pick }]
 */
export default function ShopHero({ worlds, title, crumbs, text, image, stats, ticker, currency }) {
  const [peek, setPeek] = useState(null);
  const shown = peek || image;

  // fetch the other collections' photos once the page is idle, so a preview never shows an empty frame
  useEffect(() => {
    // a phone fetches the copy it will show (see img-src.js), a desktop the full photo
    const phone = window.matchMedia("(max-width: 760px)").matches;
    const load = () => worlds.forEach((w) => {
      const src = phone ? w.image?.mobile : w.image?.desktop;
      if (!src) return;
      const im = new Image();
      if (phone) { im.sizes = PHONE_FULL; im.srcset = srcSetOf(src) || ""; }
      im.src = src;
      im.decode?.().catch(() => {}); // decoded ahead too, so switching collection does not wait for it
    });
    const id = "requestIdleCallback" in window ? requestIdleCallback(load, { timeout: 3000 }) : setTimeout(load, 1500);
    return () => ("cancelIdleCallback" in window ? cancelIdleCallback(id) : clearTimeout(id));
  }, [worlds.length]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section className="shero">
      <div className="shero__media" data-parallax-box aria-hidden>
        <div className="shero__layer" data-parallax>
          <AnimatePresence initial={false}>
            {/* the new photo wipes in from the right: a frame slides left while the photo inside slides back the
                same distance, so it looks like a clip but only moves layers (smooth on phones, no repainting) */}
            <motion.div
              key={shown.desktop} className="shero__img shero__wipe"
              initial={{ x: "100%" }} animate={{ x: "0%" }}
              exit={{ opacity: 0, transition: { duration: 0.3, delay: 0.75 } }}
              transition={{ duration: 0.95, ease: EASE }}
            >
              <motion.picture className="shero__img" initial={{ x: "-100%" }} animate={{ x: "0%" }} transition={{ duration: 0.95, ease: EASE }}>
                <source media="(max-width: 760px)" srcSet={srcSetOf(shown.mobile) || shown.mobile} sizes={PHONE_FULL} />
                <img src={shown.desktop} alt="" fetchPriority="high" decoding="async" />
              </motion.picture>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      <div className="wrap shero__grid">
        <div className="shero__copy">
          <div className="crumbs">
            <Link href="/">Home</Link>
            {crumbs.map(([label, href]) => <span key={label}> / {href ? <Link href={href}>{label}</Link> : label}</span>)}
          </div>
          <Title key={title.map((w) => w.text).join(" ")} words={title} />
          <AnimatePresence mode="wait" initial={false}>
            <motion.p
              key={text} className="shero__lede"
              initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.45, ease: EASE }}
            >
              {text}
            </motion.p>
          </AnimatePresence>
        </div>

        {worlds.length > 2 && (
          <nav className="shero__index" aria-label="Collections" onMouseLeave={() => setPeek(null)}>
            <span className="shero__index-label">Collections</span>
            {worlds.map((w, i) => (
              <button
                key={w.key} type="button" className={`shero__world ${w.active ? "is-on" : ""} ${w.tone || ""}`}
                aria-pressed={w.active} onClick={w.pick}
                onMouseEnter={() => w.image?.desktop && setPeek(w.image)} onFocus={() => w.image?.desktop && setPeek(w.image)} onBlur={() => setPeek(null)}
              >
                <span className="shero__num">{String(i + 1).padStart(2, "0")}</span>
                <b>{w.label}</b>
                <sup>{w.count}</sup>
                {w.active && <motion.i layoutId="shero-mark" className="shero__mark" transition={{ type: "spring", stiffness: 380, damping: 34 }} />}
              </button>
            ))}
          </nav>
        )}
      </div>

      <div className="wrap shero__stats">
        {stats.map(([value, label, money]) => (
          <div key={label} className="shero__stat">
            <b>
              {money && <span className="shero__cur">{currency}</span>}
              <Counter value={value} fontSize="inherit" duration={0.9} stagger={0.05} intro={false} />
            </b>
            <span>{label}</span>
          </div>
        ))}
      </div>

      {ticker?.length > 0 && <Marquee items={ticker} className="hero__marquee" />}
    </section>
  );
}
