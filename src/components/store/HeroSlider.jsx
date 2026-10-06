"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";

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
      <div className="hero__media" data-hero-img>
        {/* first paint, before JavaScript: right photo for each screen type */}
        <picture>
          <source media="(max-width: 760px)" srcSet={firstFor("mobile")?.image_url} />
          <img className="hero__img" src={firstFor("desktop")?.image_url} alt="" fetchPriority="high" />
        </picture>
        <AnimatePresence initial={false}>
          {list.length > 0 && (
            <motion.img
              key={current.id} className="hero__img hero__img--slide" src={current.image_url} alt=""
              initial={{ opacity: 0, scale: 1.12 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
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

        {list.length > 1 && (
          <div className="hero__dots" role="tablist" aria-label="Slides">
            <span className="hero__count">{String(index + 1).padStart(2, "0")} / {String(list.length).padStart(2, "0")}</span>
            {list.map((s, i) => (
              <button key={s.id} role="tab" aria-selected={i === index} aria-label={`Slide ${i + 1}`} className={i === index ? "active" : ""} onClick={() => setIndex(i)}>
                {i === index && <i key={index} style={{ animationDuration: `${HOLD}ms` }} />}
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
