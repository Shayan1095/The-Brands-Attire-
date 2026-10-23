"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import useEmblaCarousel from "embla-carousel-react";
import { WheelGesturesPlugin } from "embla-carousel-wheel-gestures";
import ProductCard from "../ProductCard";
import { Icon } from "../icons";

/** A draggable row of product cards with arrows and a progress line. Trackpads scroll it sideways too. */
export default function ProductRail({ eyebrow, title, items, link, linkLabel, id, showcase }) {
  const [ref, api] = useEmblaCarousel({ align: "start", containScroll: "trimSnaps", dragFree: true, duration: 24 }, [WheelGesturesPlugin()]);
  const [edges, setEdges] = useState({ prev: false, next: false });
  const bar = useRef(null);

  const update = useCallback((embla) => {
    setEdges({ prev: embla.canScrollPrev(), next: embla.canScrollNext() });
  }, []);
  // the progress line is written straight to the DOM: it changes every frame while dragging
  const progress = useCallback((embla) => {
    if (bar.current) bar.current.style.transform = `scaleX(${Math.max(0.08, Math.min(1, embla.scrollProgress()))})`;
  }, []);

  useEffect(() => {
    if (!api) return;
    update(api);
    progress(api);
    api.on("select", update).on("reInit", update).on("scroll", progress).on("reInit", progress);
    return () => { api.off("select", update).off("reInit", update).off("scroll", progress).off("reInit", progress); };
  }, [api, update, progress]);

  if (!items.length) return null;
  const scrollable = edges.prev || edges.next;

  return (
    <section className="section prail" id={id} data-showcase={showcase}>
      <div className="wrap">
        <div className="section__head">
          <div><span className="eyebrow" data-reveal>{eyebrow}</span><h2 data-split>{title}</h2></div>
          <div className="prail__tools" data-reveal>
            {link && <Link href={link} className="link-arrow">{linkLabel}</Link>}
            {scrollable && (
              <div className="prail__arrows">
                <button type="button" aria-label="Scroll back" disabled={!edges.prev} onClick={() => api?.scrollPrev()}><Icon name="arrow" /></button>
                <button type="button" aria-label="Scroll forward" disabled={!edges.next} onClick={() => api?.scrollNext()}><Icon name="arrow" /></button>
              </div>
            )}
          </div>
        </div>
        <div className="prail__viewport" ref={ref} data-reveal>
          <div className="prail__track">
            {items.map((p) => (
              <div className="prail__slide" key={p.id}><ProductCard p={p} reveal={false} /></div>
            ))}
          </div>
        </div>
        {scrollable && <div className="prail__progress" aria-hidden><i ref={bar} /></div>}
      </div>
    </section>
  );
}
