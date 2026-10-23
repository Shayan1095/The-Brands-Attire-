"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useMotionValue, useSpring } from "motion/react";
import { Icon } from "../icons";

/*
  The chapter index: big numbered chapter names. On desktop the chapter's cover photo floats beside the
  pointer while you hover a name (off in lite mode and on touch screens). Clicking glides to the chapter.
*/
export function jumpTo(slug) {
  const el = document.getElementById(`chapter-${slug}`);
  if (!el) return;
  if (window.__lenis) window.__lenis.scrollTo(el, { offset: -140 });
  else window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 140, behavior: "smooth" });
}

export default function ChapterIndex({ chapters }) {
  const [hover, setHover] = useState(null);
  const [float, setFloat] = useState(false); // fine pointer and not lite mode
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 260, damping: 30, mass: 0.5 });
  const sy = useSpring(y, { stiffness: 260, damping: 30, mass: 0.5 });

  useEffect(() => {
    setFloat(window.matchMedia("(hover: hover) and (pointer: fine)").matches && document.documentElement.dataset.lite !== "1");
  }, []);

  const move = (e) => {
    const box = e.currentTarget.getBoundingClientRect();
    x.set(e.clientX - box.left);
    y.set(e.clientY - box.top);
  };

  const current = chapters.find((c) => c.slug === hover);

  return (
    <section className="cindex" aria-label="Chapters">
      <div className="wrap">
        <span className="eyebrow" data-reveal>In this lookbook</span>
        <ol className="cindex__list" onPointerMove={float ? move : undefined} onPointerLeave={() => setHover(null)}>
          {chapters.map((c, i) => (
            <li key={c.slug} data-reveal>
              <button
                type="button" className={`cindex__row ${hover && hover !== c.slug ? "is-dim" : ""}`}
                onPointerEnter={() => setHover(c.slug)} onFocus={() => setHover(c.slug)} onBlur={() => setHover(null)}
                onClick={() => jumpTo(c.slug)}
              >
                <span className="cindex__n">{String(i + 1).padStart(2, "0")}</span>
                <span className="cindex__name">{c.name}</span>
                {c.cover && <span className="cindex__thumb" aria-hidden><img src={c.cover} alt="" loading="lazy" decoding="async" /></span>}
                <span className="cindex__meta">{c.frames.length} frames · {c.pieces} {c.pieces === 1 ? "piece" : "pieces"}</span>
                <span className="cindex__go" aria-hidden><Icon name="arrow" /></span>
              </button>
            </li>
          ))}
          {float && (
            <motion.span className="cindex__float" style={{ x: sx, y: sy }} aria-hidden>
              <AnimatePresence>
                {current?.cover && (
                  <motion.img
                    key={current.slug} src={current.cover} alt=""
                    initial={{ opacity: 0, scale: 0.86, rotate: -4 }} animate={{ opacity: 1, scale: 1, rotate: 0 }} exit={{ opacity: 0, scale: 0.92 }}
                    transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                  />
                )}
              </AnimatePresence>
            </motion.span>
          )}
        </ol>
      </div>
    </section>
  );
}
