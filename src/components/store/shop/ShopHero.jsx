"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
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
              transition={{ duration: 0.8, ease: EASE, delay: 0.04 + n++ * 0.024 }}
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
 * The top of the shop: compact, so the first products are on the first screen. The photo, title, line and
 * facts belong to the collection being browsed and change with it (the photo wipes across). Collections are
 * switched from the shop bar right below.
 *
 * meta   = [{ label, tone? }]  short facts in one line ("13 pieces", "from Rs 2,117", "6 on sale")
 * worlds = [{ image: { desktop, mobile } }]  only used to fetch the other collections' photos ahead of time
 */
export default function ShopHero({ worlds, title, crumbs, text, image, meta = [], note = null }) {
  // fetch the other collections' photos once the page is idle, so switching never shows an empty frame
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
              key={image.desktop} className="shero__img shero__wipe"
              initial={{ x: "100%" }} animate={{ x: "0%" }}
              exit={{ opacity: 0, transition: { duration: 0.3, delay: 0.75 } }}
              transition={{ duration: 0.95, ease: EASE }}
            >
              <motion.picture className="shero__img" initial={{ x: "-100%" }} animate={{ x: "0%" }} transition={{ duration: 0.95, ease: EASE }}>
                <source media="(max-width: 760px)" srcSet={srcSetOf(image.mobile) || image.mobile} sizes={PHONE_FULL} />
                <img src={image.desktop} alt="" fetchPriority="high" decoding="async" />
              </motion.picture>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      <div className="wrap shero__copy">
        <nav className="crumbs" aria-label="Breadcrumb">
          <Link href="/">Home</Link>
          {crumbs.map(([label, href]) => <span key={label}> / {href ? <Link href={href}>{label}</Link> : label}</span>)}
        </nav>
        <Title key={title.map((w) => w.text).join(" ")} words={title} />
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={text} className="shero__under"
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.45, ease: EASE }}
          >
            <p className="shero__lede">{text}</p>
            {meta.length > 0 && (
              <ul className="shero__meta" aria-label="About this collection">
                {meta.map((m) => <li key={m.label} className={m.tone || ""}>{m.label}</li>)}
                {note && <li className="is-note">{note}</li>}
              </ul>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
}
