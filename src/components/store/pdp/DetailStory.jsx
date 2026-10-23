"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Icon } from "../icons";

const EASE = [0.16, 1, 0.3, 1];
const STEP = 4800; // ms each detail stays up while the section is on screen
// where each close-up zooms in on the photo, so every detail shows a different part of the piece
const FOCUS = ["50% 30%", "30% 65%", "70% 55%", "45% 80%", "60% 20%", "35% 40%"];

/**
 * "Inside the piece": the product's details as a short story. Each row has its own close-up (a crop of the
 * product photos, zooming slowly towards a different spot). It plays through by itself while on screen;
 * pointing at or tapping a row jumps to it and stops the autoplay.
 *
 * rows = [{ label, value, note? }], images = [{ url }]
 */
export default function DetailStory({ name, rows, images, badges }) {
  const [at, setAt] = useState(0);
  const [auto, setAuto] = useState(true);
  const [visible, setVisible] = useState(false);
  const [lite, setLite] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    setLite(document.documentElement.dataset.lite === "1" || window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.35 });
    io.observe(ref.current);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!auto || !visible || rows.length < 2) return;
    const t = setTimeout(() => setAt((i) => (i + 1) % rows.length), STEP);
    return () => clearTimeout(t);
  }, [at, auto, visible, rows.length]);

  const pick = (i) => { setAuto(false); setAt(i); };
  const photo = images[(at + 1) % images.length] || images[0];
  const focus = FOCUS[at % FOCUS.length];

  return (
    <section className="section dstory" ref={ref} aria-label={`Details of the ${name}`}>
      <div className="wrap dstory__grid">
        <div className="dstory__copy">
          <span className="eyebrow" data-reveal>The details</span>
          <h2 className="display" data-split>Inside the <em>{name}</em></h2>

          <ol className="dstory__rows">
            {rows.map((r, i) => {
              const on = i === at;
              return (
                <li key={r.label} className={on ? "is-on" : ""}>
                  <button type="button" aria-expanded={on} onClick={() => pick(i)} onMouseEnter={() => pick(i)} onFocus={() => pick(i)}>
                    <span className="dstory__n">{String(i + 1).padStart(2, "0")}</span>
                    <span className="dstory__label">{r.label}</span>
                    <span className="dstory__plus" aria-hidden><Icon name="plus" /></span>
                  </button>
                  <AnimatePresence initial={false}>
                    {on && (
                      <motion.div className="dstory__body" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.45, ease: EASE }}>
                        <p>{r.value}</p>
                        {r.note && <small>{r.note}</small>}
                      </motion.div>
                    )}
                  </AnimatePresence>
                  {/* the line under the open row fills while it is up (autoplay only) */}
                  {on && auto && visible && rows.length > 1 && <i className="dstory__timer" key={`t${at}`} style={{ animationDuration: `${STEP}ms` }} aria-hidden />}
                </li>
              );
            })}
          </ol>

          {badges?.length > 0 && (
            <ul className="dstory__badges" data-reveal>
              {badges.map(([icon, text]) => <li key={text}><Icon name={icon} /> {text}</li>)}
            </ul>
          )}
        </div>

        <figure className="dstory__media" data-clip>
          <AnimatePresence initial={false}>
            <motion.img
              key={`${at}-${photo.url}`} src={photo.url} alt={`${name}: ${rows[at].label.toLowerCase()}`} width="1200" height="1500" decoding="async"
              style={{ transformOrigin: focus }}
              initial={{ opacity: 0, scale: lite ? 1.25 : 1.12 }}
              animate={{ opacity: 1, scale: lite ? 1.25 : 1.38, transition: { opacity: { duration: 0.7, ease: EASE }, scale: { duration: lite ? 0 : STEP / 1000 + 1.5, ease: "linear" } } }}
              exit={{ opacity: 0, transition: { duration: 0.6 } }}
            />
          </AnimatePresence>
          <figcaption>
            <span>Close-up · {rows[at].label}</span>
            <b>{String(at + 1).padStart(2, "0")} / {String(rows.length).padStart(2, "0")}</b>
          </figcaption>
          {rows.length > 1 && (
            <div className="dstory__dots" role="tablist" aria-label="Details">
              {rows.map((r, i) => <button key={r.label} type="button" role="tab" aria-selected={i === at} aria-label={r.label} className={i === at ? "is-on" : ""} onClick={() => pick(i)} />)}
            </div>
          )}
        </figure>
      </div>
    </section>
  );
}
