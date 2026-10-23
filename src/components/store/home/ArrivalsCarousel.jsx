"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import useEmblaCarousel from "embla-carousel-react";
import Autoplay from "embla-carousel-autoplay";
import { WheelGesturesPlugin } from "embla-carousel-wheel-gestures";
import ProductCard from "../ProductCard";
import { Icon } from "../icons";

/*
  New arrivals, as an endless carousel.
  The card in the middle is full size; the others ease down in size and fade as they move away,
  updated every frame from Embla's scroll position. It moves on by itself and pauses while the
  pointer is over it or someone is dragging. Arrow keys, arrows, drag, swipe and trackpad all work.
*/

const SHRINK = 0.15; // how much smaller the furthest visible cards get
const DIM = 0.5;     // how much they fade

export default function ArrivalsCarousel({ items, total }) {
  const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const [ref, api] = useEmblaCarousel(
    { loop: true, align: "center", duration: 32, skipSnaps: false, breakpoints: { "(min-width: 901px)": { active: !!reduce } } },
    [
      WheelGesturesPlugin(),
      // on desktop this carousel is hidden behind the scroll-dealt stack, so it must not keep playing there
      ...(reduce ? [] : [Autoplay({ delay: 3600, stopOnInteraction: false, stopOnMouseEnter: true, stopOnFocusIn: true, breakpoints: { "(min-width: 901px)": { active: false } } })]),
    ]
  );
  const [selected, setSelected] = useState(0);
  const [playing, setPlaying] = useState(!reduce);
  const nodes = useRef([]);

  // scale + fade by distance from the centre (same maths as Embla's official "scale" example)
  const tween = useCallback((embla, event) => {
    const engine = embla.internalEngine();
    const progress = embla.scrollProgress();
    const inView = embla.slidesInView();
    const factor = 0.5 * embla.scrollSnapList().length;
    embla.scrollSnapList().forEach((snap, snapIndex) => {
      let diff = snap - progress;
      engine.slideRegistry[snapIndex].forEach((slide) => {
        if (event === "scroll" && !inView.includes(slide)) return;
        if (engine.options.loop) {
          for (const point of engine.slideLooper.loopPoints) {
            const target = point.target();
            if (slide === point.index && target !== 0) diff = Math.sign(target) === -1 ? snap - (1 + progress) : snap + (1 - progress);
          }
        }
        const away = Math.min(1, Math.abs(diff * factor));
        const node = nodes.current[slide];
        if (!node) return;
        node.style.transform = `scale(${1 - away * SHRINK})`;
        node.style.opacity = String(1 - away * DIM);
      });
    });
  }, []);

  useEffect(() => {
    if (!api) return;
    nodes.current = api.slideNodes().map((n) => n.querySelector(".arr__inner"));
    const onSelect = () => setSelected(api.selectedScrollSnap());
    const autoplay = api.plugins?.()?.autoplay; // empty while the carousel is switched off (desktop)
    const onPlay = () => setPlaying(true);
    const onStop = () => setPlaying(false);
    onSelect();
    tween(api);
    api.on("select", onSelect).on("reInit", onSelect).on("scroll", tween).on("reInit", tween).on("slideFocus", tween);
    if (autoplay) api.on("autoplay:play", onPlay).on("autoplay:stop", onStop);
    return () => {
      api.off("select", onSelect).off("reInit", onSelect).off("scroll", tween).off("reInit", tween).off("slideFocus", tween);
      if (autoplay) api.off("autoplay:play", onPlay).off("autoplay:stop", onStop);
    };
  }, [api, tween]);

  const toggle = () => {
    const autoplay = api?.plugins?.()?.autoplay;
    if (!autoplay) return;
    if (autoplay.isPlaying()) autoplay.stop(); else autoplay.play();
  };

  const onKey = (e) => {
    if (e.key === "ArrowRight") { e.preventDefault(); api?.scrollNext(); }
    if (e.key === "ArrowLeft") { e.preventDefault(); api?.scrollPrev(); }
  };

  if (!items.length) return null;

  return (
    <section className="arr arr--swipe section--bone" data-showcase="arrivals" aria-label="New arrivals">
      <div className="wrap arr__head">
        <div>
          <span className="eyebrow" data-reveal>Just landed · {String(items.length).padStart(2, "0")} new pieces</span>
          <h2 className="display arr__title" data-split>New <em>arrivals</em></h2>
        </div>
        <div className="arr__tools" data-reveal>
          <span className="arr__count" aria-live="polite">
            <b>{String(selected + 1).padStart(2, "0")}</b> / {String(items.length).padStart(2, "0")}
          </span>
          {api?.plugins?.()?.autoplay && (
            <button type="button" className="arr__btn arr__btn--play" onClick={toggle} aria-label={playing ? "Pause the carousel" : "Play the carousel"}>
              {playing ? <span className="arr__pause" aria-hidden /> : <span className="arr__playicon" aria-hidden />}
            </button>
          )}
          <button type="button" className="arr__btn" aria-label="Previous piece" onClick={() => api?.scrollPrev()}><Icon name="arrow" /></button>
          <button type="button" className="arr__btn" aria-label="Next piece" onClick={() => api?.scrollNext()}><Icon name="arrow" /></button>
        </div>
      </div>

      <div className="arr__viewport" ref={ref} tabIndex={0} onKeyDown={onKey} role="region" aria-roledescription="carousel" aria-label="New arrivals. Use the arrow keys to move." data-reveal>
        <div className="arr__track">
          {items.map((p, i) => (
            <div className="arr__slide" key={p.id} role="group" aria-roledescription="slide" aria-label={`${i + 1} of ${items.length}`}>
              <div className="arr__inner"><ProductCard p={p} reveal={false} eager={i < 3} /></div>
            </div>
          ))}
        </div>
      </div>

      <div className="wrap arr__foot">
        <div className="arr__dots" role="tablist" aria-label="Choose a piece">
          {items.map((p, i) => (
            <button
              key={p.id} type="button" role="tab" aria-selected={i === selected} aria-label={`Show ${p.name}`}
              className={i === selected ? "is-on" : ""} onClick={() => api?.scrollTo(i)}
            >
              {i === selected && playing && <i key={selected} />}
            </button>
          ))}
        </div>
        <Link href="/products" className="link-arrow">View all {total} pieces</Link>
      </div>
    </section>
  );
}
