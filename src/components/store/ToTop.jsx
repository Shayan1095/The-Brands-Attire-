"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Icon } from "./icons";

const R = 20;
const C = 2 * Math.PI * R;

/**
 * Back to top, above the chat button. Appears after the first screen; its ring fills as the page is read.
 * The ring is written straight to the DOM on scroll (no React render per frame).
 */
export default function ToTop() {
  const pathname = usePathname();
  const [shown, setShown] = useState(false);
  const ring = useRef(null);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const y = window.scrollY;
      setShown(y > window.innerHeight * 1.2);
      if (ring.current) ring.current.style.strokeDashoffset = String(C * (1 - (max > 0 ? Math.min(1, y / max) : 0)));
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => { window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); cancelAnimationFrame(frame); };
  }, [pathname]);

  const up = () => (window.__lenis ? window.__lenis.scrollTo(0, { duration: 1.4 }) : window.scrollTo({ top: 0, behavior: "smooth" }));

  return (
    <AnimatePresence>
      {shown && (
        <motion.button
          type="button" className="totop" onClick={up} aria-label="Back to top"
          initial={{ opacity: 0, scale: 0.6, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.6, y: 12 }}
          whileTap={{ scale: 0.88 }} transition={{ type: "spring", stiffness: 420, damping: 30 }}
        >
          <svg viewBox="0 0 48 48" aria-hidden>
            <circle cx="24" cy="24" r={R} className="totop__track" />
            <circle ref={ring} cx="24" cy="24" r={R} className="totop__ring" strokeDasharray={C} strokeDashoffset={C} />
          </svg>
          <Icon name="arrow" />
        </motion.button>
      )}
    </AnimatePresence>
  );
}
