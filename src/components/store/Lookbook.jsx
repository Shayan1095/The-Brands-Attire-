"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useStore } from "./Shell";
import { Marquee } from "./ui";
import { Icon } from "./icons";
import CategoryIcon from "../CategoryIcon";
import { variantLabel } from "@/lib/format";

const EASE = [0.16, 1, 0.3, 1];
// tile shapes repeat in this order so every chapter gets a varied, magazine-like layout
const SHAPES = ["big", "tall", "", "", "wide", "", "tall", ""];

/**
 * The gallery. `chapters` = [{ slug, name, description, icon, frames: [{ n, image, product }] }]
 * where `n` is the frame's number across the whole lookbook. Frames open in a viewer you can shop from.
 */
export default function Lookbook({ chapters }) {
  const { fmt, add } = useStore();
  const frames = chapters.flatMap((c) => c.frames);
  const [open, setOpen] = useState(null); // index into `frames`
  const [active, setActive] = useState(chapters[0]?.slug);

  const go = useCallback((dir) => setOpen((i) => (i === null ? i : (i + dir + frames.length) % frames.length)), [frames.length]);

  // viewer: lock the page behind it, and listen for Esc / arrow keys
  useEffect(() => {
    if (open === null) return;
    document.body.classList.add("locked");
    window.__lenis?.stop();
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(null);
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.classList.remove("locked");
      window.__lenis?.start();
      window.removeEventListener("keydown", onKey);
    };
  }, [open === null, go]); // eslint-disable-line react-hooks/exhaustive-deps

  // highlight the chapter being read in the sticky bar
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && setActive(e.target.dataset.chapter)),
      { rootMargin: "-45% 0px -50% 0px" }
    );
    document.querySelectorAll("[data-chapter]").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  const jump = (slug) => {
    const el = document.getElementById(`chapter-${slug}`);
    if (!el) return;
    if (window.__lenis) window.__lenis.scrollTo(el, { offset: -150 });
    else el.scrollIntoView({ behavior: "smooth" });
  };

  const current = open === null ? null : frames[open];

  return (
    <>
      {/* chapter bar */}
      {chapters.length > 1 && (
        <div className="catbar">
          <div className="wrap catbar__inner">
            <div className="rail">
              <div className="rail__scroll" data-lenis-prevent>
                {chapters.map((c, i) => (
                  <button key={c.slug} className={`rail__item ${active === c.slug ? "active" : ""}`} onClick={() => jump(c.slug)}>
                    <span className="rail__thumb"><CategoryIcon name={c.name} icon={c.icon} /></span>
                    <span className="rail__text"><b>{c.name}</b><small>Chapter {String(i + 1).padStart(2, "0")}</small></span>
                    {active === c.slug && <motion.span layoutId="chapter-line" className="rail__line" transition={{ type: "spring", stiffness: 420, damping: 38 }} />}
                  </button>
                ))}
              </div>
            </div>
            <div className="catbar__tools">
              <span className="catbar__count"><b>{frames.length}</b> frames</span>
              <Link href="/products" className="tool"><span>Shop all</span> <Icon name="arrow" /></Link>
            </div>
          </div>
        </div>
      )}

      {chapters.map((c, ci) => (
        <div key={c.slug}>
          <section className="section chapter" id={`chapter-${c.slug}`} data-chapter={c.slug}>
            <div className="wrap">
              <header className="chapter__head">
                <div>
                  <span className="eyebrow" data-reveal>Chapter {String(ci + 1).padStart(2, "0")} / {String(chapters.length).padStart(2, "0")}</span>
                  <h2 className="display" data-split>{c.name}</h2>
                </div>
                <div className="chapter__side" data-reveal>
                  <p>{c.description || "A closer look at the pieces, the cloth and the cut."}</p>
                  <Link href={c.href} className="link-arrow">Shop {c.name} · {c.pieces} {c.pieces === 1 ? "piece" : "pieces"}</Link>
                </div>
              </header>

              <div className="bento">
                {c.frames.map((f, i) => (
                  <button key={f.n} className={`frame ${SHAPES[i % SHAPES.length] ? `frame--${SHAPES[i % SHAPES.length]}` : ""}`} data-clip onClick={() => setOpen(f.n)} aria-label={`Open look ${f.n + 1}: ${f.product.name}`}>
                    <img src={f.image.thumb} srcSet={`${f.image.thumb} 600w, ${f.image.url} 1200w`} sizes="(max-width: 800px) 50vw, (max-width: 1200px) 34vw, 25vw" alt={f.product.name} loading="lazy" decoding="async" />
                    <span className="frame__num">{String(f.n + 1).padStart(2, "0")}</span>
                    <span className="frame__cap">
                      <small>{f.product.category}</small>
                      <b>{f.product.name}</b>
                      <i>{fmt(f.product.price)}</i>
                    </span>
                    <span className="frame__open" aria-hidden><Icon name="plus" /></span>
                  </button>
                ))}
              </div>
            </div>
          </section>

          {ci < chapters.length - 1 && (
            <div className="section--ink chapter__break">
              <Marquee dir={ci % 2 ? 1 : -1} className="marquee--xl" items={[chapters[ci + 1].name, "Next chapter", `${chapters[ci + 1].frames.length} frames`]} />
            </div>
          )}
        </div>
      ))}

      {/* shop-the-look viewer */}
      <AnimatePresence>
        {current && (
          <motion.div className="lightbox" role="dialog" aria-modal="true" aria-label={current.product.name} data-lenis-prevent initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
            <div className="lightbox__stage" onClick={(e) => e.target === e.currentTarget && setOpen(null)}>
              <AnimatePresence mode="wait" initial={false}>
                <motion.img
                  key={current.n} src={current.image.url} alt={current.product.name}
                  initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.35, ease: EASE }}
                />
              </AnimatePresence>
              {frames.length > 1 && (
                <>
                  <button className="lightbox__arrow lightbox__arrow--prev" aria-label="Previous look" onClick={() => go(-1)}><Icon name="arrow" /></button>
                  <button className="lightbox__arrow lightbox__arrow--next" aria-label="Next look" onClick={() => go(1)}><Icon name="arrow" /></button>
                </>
              )}
              <span className="lightbox__count">{String(open + 1).padStart(2, "0")} / {String(frames.length).padStart(2, "0")}</span>
            </div>

            <motion.aside className="lightbox__info" initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 40, opacity: 0 }} transition={{ duration: 0.4, ease: EASE }}>
              <button className="icon-btn lightbox__close" aria-label="Close" onClick={() => setOpen(null)}><Icon name="close" /></button>
              <AnimatePresence mode="wait" initial={false}>
                <motion.div key={current.product.id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
                  <span className="eyebrow" style={{ color: "var(--signal)" }}>Shop the look · {current.product.category}</span>
                  <h3 className="display">{current.product.name}</h3>
                  <div className="price">
                    <span className={current.product.was ? "sale" : ""}>{fmt(current.product.price)}</span>
                    {current.product.was && <s>{fmt(current.product.was)}</s>}
                  </div>
                  <p className="muted">{current.product.desc}</p>

                  <span className="label">{current.product.soldOut ? "Sold out" : "Add your size"}</span>
                  <div className="sizes">
                    {current.product.variants.map((v) => (
                      <motion.button
                        key={v.id} whileTap={{ scale: 0.92 }} className={`size ${v.stock ? "" : "out"}`} disabled={!v.stock}
                        onClick={() => {
                          const p = current.product;
                          setOpen(null);
                          add({ variantId: v.id, productId: p.id, slug: p.slug, name: p.name, size: variantLabel(v), image: p.images[0]?.thumb, price: p.price, max: v.stock });
                        }}
                      >
                        {variantLabel(v)}
                      </motion.button>
                    ))}
                  </div>
                  <Link href={`/products/${current.product.slug}`} className="btn btn--block">View full details <span aria-hidden>→</span></Link>
                  <p className="fine" style={{ marginTop: 12 }}>Tip: use ← → to move between looks.</p>
                </motion.div>
              </AnimatePresence>
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
