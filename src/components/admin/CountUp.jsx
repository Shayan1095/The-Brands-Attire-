"use client";

import { useEffect, useRef } from "react";

/**
 * Shows an already formatted figure ("Rs. 115,912", "24") and counts its number up from zero once, when the
 * page opens. The server text is the final value, so it reads correctly without JavaScript or with reduced motion.
 */
export default function CountUp({ value, duration = 900 }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    const text = String(value);
    const m = text.match(/\d[\d,]*/);
    if (!el || !m || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const target = Number(m[0].replace(/,/g, ""));
    if (!target) return;
    const grouped = m[0].includes(",");
    const show = (n) => { el.textContent = text.replace(m[0], grouped ? n.toLocaleString("en-US") : String(n)); };
    let raf = 0;
    const t0 = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - t0) / duration);
      show(p < 1 ? Math.round(target * (1 - Math.pow(2, -10 * p))) : target); // fast start, soft landing
      if (p < 1) raf = requestAnimationFrame(step);
    };
    show(0);
    raf = requestAnimationFrame(step);
    return () => { cancelAnimationFrame(raf); el.textContent = text; };
  }, [value, duration]);

  return <span className="countup" ref={ref}>{value}</span>;
}
