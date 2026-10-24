"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { RingText } from "./ui";
import { Icon } from "./icons";
import { srcSetOf, PHONE_FULL } from "@/lib/img-src";

const EASE = [0.16, 1, 0.3, 1];
const HOLD = 6500; // ms each slide stays

/**
 * "Cut with *intent*." -> [[Cut], [with], [intent(red), "."]]
 * Each word is a list of pieces, so punctuation touching a starred word stays attached to it.
 */
function words(title) {
  const parts = title.split("*");
  const out = [];
  parts.forEach((part, i) => {
    const touchesPrevious = i > 0 && !/^\s/.test(part) && !/\s$/.test(parts[i - 1]);
    part.split(/\s+/).filter(Boolean).forEach((text, k) => {
      const piece = { text, accent: i % 2 === 1 };
      if (k === 0 && touchesPrevious && out.length) out.at(-1).push(piece);
      else out.push([piece]);
    });
  });
  return out;
}

/**
 * Home hero slideshow. `slides` come from Admin -> Banners; each is tagged desktop / mobile / both,
 * and only the ones that suit the visitor's screen are shown. Slides without their own text use `fallback`.
 */
export default function HeroSlider({ slides, fallback, saleLink }) {
  // unknown until mounted: the server-rendered <picture> below covers first paint for both screen types
  const [mobile, setMobile] = useState(null);
  // lite mode (slow devices) and phones: slides crossfade without the slow zoom. The zoom redraws the whole photo
  // on every frame, which competes with the thumb scroll on a phone (and is costly without a graphics card)
  const [lite, setLite] = useState(false);
  useEffect(() => setLite(document.documentElement.dataset.lite === "1" || window.matchMedia("(max-width: 900px), (pointer: coarse)").matches), []);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 760px)");
    const sync = () => { setMobile(mq.matches); setIndex(0); };
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const firstFor = (device) => slides.find((s) => s.device === device) || slides.find((s) => s.device === "both") || slides[0];
  const list = useMemo(() => {
    if (mobile === null) return [];
    const fit = slides.filter((s) => s.device === (mobile ? "mobile" : "desktop") || s.device === "both");
    return fit.length ? fit : slides;
  }, [slides, mobile]);

  const current = list[index] || firstFor("desktop");
  const next = list.length > 1 ? list[(index + 1) % list.length] : null;
  const mediaRef = useRef(null);

  // phones: swipe the hero sideways to change slide
  useEffect(() => {
    const hero = mediaRef.current?.closest("[data-hero]");
    if (!hero || list.length < 2) return;
    let x0 = null, y0 = 0;
    const down = (e) => { if (e.pointerType !== "mouse") { x0 = e.clientX; y0 = e.clientY; } };
    const up = (e) => {
      if (x0 === null) return;
      const dx = e.clientX - x0, dy = e.clientY - y0;
      x0 = null;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.4) setIndex((i) => (i + (dx < 0 ? 1 : -1) + list.length) % list.length);
    };
    hero.addEventListener("pointerdown", down, { passive: true });
    hero.addEventListener("pointerup", up, { passive: true });
    return () => { hero.removeEventListener("pointerdown", down); hero.removeEventListener("pointerup", up); };
  }, [list.length]);

  useEffect(() => {
    if (list.length < 2) return;
    new Image().src = list[(index + 1) % list.length].image_url; // warm the next photo
    const timer = setTimeout(() => setIndex((i) => (i + 1) % list.length), HOLD);
    return () => clearTimeout(timer);
  }, [index, list]);

  const text = {
    eyebrow: current?.eyebrow || fallback.eyebrow,
    title: current?.title || fallback.title,
    subtitle: current?.subtitle || fallback.subtitle,
    cta_text: current?.cta_text || fallback.cta_text,
    cta_link: current?.cta_link || fallback.cta_link || "/products",
  };

  return (
    <>
      <div className="hero__media" data-hero-img ref={mediaRef}>
        {/* first paint, before JavaScript: right photo for each screen type */}
        <picture>
          <source media="(max-width: 760px)" srcSet={srcSetOf(firstFor("mobile")?.image_url) || firstFor("mobile")?.image_url} sizes={PHONE_FULL} />
          <img className="hero__img" src={firstFor("desktop")?.image_url} alt="" fetchPriority="high" />
        </picture>
        <AnimatePresence initial={false}>
          {list.length > 0 && (
            <motion.img
              key={current.id} className="hero__img hero__img--slide" src={current.image_url} srcSet={srcSetOf(current.image_url)} sizes={PHONE_FULL} alt=""
              initial={{ opacity: 0, scale: lite ? 1 : 1.12 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
              transition={{ opacity: { duration: 1.4, ease: "easeInOut" }, scale: { duration: HOLD / 1000 + 1.5, ease: "linear" } }}
            />
          )}
        </AnimatePresence>
      </div>

      <div className="wrap hero__content" data-hero-content>
        <AnimatePresence mode="wait">
          <motion.div key={`${text.title}|${text.subtitle}`} exit={{ opacity: 0, y: -16 }} transition={{ duration: 0.35 }}>
            <motion.span className="eyebrow hero__eyebrow" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6 }}>
              <span className="hero__pulse" />{text.eyebrow}
            </motion.span>
            <h1 className="display hero__title" aria-label={text.title.replace(/\*/g, "")}>
              {words(text.title).map((w, i) => (
                <span className="hero__word" key={i} aria-hidden>
                  <motion.span initial={{ y: "110%" }} animate={{ y: 0 }} transition={{ duration: 1, ease: EASE, delay: 0.08 + i * 0.07 }}>
                    {w.map((piece, k) => (piece.accent ? <em key={k}>{piece.text}</em> : piece.text))}
                  </motion.span>
                </span>
              ))}
            </h1>
            <motion.div className="hero__row" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: EASE, delay: 0.45 }}>
              <p className="hero__sub">{text.subtitle}</p>
              <div className="hero__cta">
                <Link href={text.cta_link} className="btn btn--light">{text.cta_text} <span aria-hidden>→</span></Link>
                {saleLink && text.cta_link !== saleLink && <Link href={saleLink} className="btn btn--outline-light">Shop the sale</Link>}
              </div>
            </motion.div>
          </motion.div>
        </AnimatePresence>

        <Link href="/products" className="hero__badge" aria-label="Shop new arrivals">
          <RingText text="NEW SEASON ✦ SHOP THE DROP ✦ " size={128}>
            <span className="hero__badge-core"><Icon name="arrow" /></span>
          </RingText>
        </Link>

        {list.length > 1 && (
          <div className="hero__foot">
            <div className="hero__dots" role="tablist" aria-label="Slides">
              <span className="hero__count">{String(index + 1).padStart(2, "0")} / {String(list.length).padStart(2, "0")}</span>
              {list.map((s, i) => (
                <button key={s.id} role="tab" aria-selected={i === index} aria-label={`Slide ${i + 1}`} className={i === index ? "active" : ""} onClick={() => setIndex(i)}>
                  {i === index && <i key={index} style={{ animationDuration: `${HOLD}ms` }} />}
                </button>
              ))}
            </div>

            {next && (
              <button type="button" className="hero__next" onClick={() => setIndex((i) => (i + 1) % list.length)} aria-label="Show the next slide">
                <span className="hero__next-img"><img key={next.id} src={next.image_url} alt="" loading="lazy" /></span>
                <span className="hero__next-text">
                  <small>Up next</small>
                  <b>{(next.title || fallback.title).replace(/\*/g, "")}</b>
                </span>
                <svg className="hero__next-ring" viewBox="0 0 36 36" aria-hidden>
                  <circle cx="18" cy="18" r="16" />
                  <circle key={index} cx="18" cy="18" r="16" className="hero__next-progress" style={{ animationDuration: `${HOLD}ms` }} />
                </svg>
              </button>
            )}
          </div>
        )}
      </div>
    </>
  );
}
