"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";

/** Contents list for the policies page: follows the section being read and jumps to any other. */
export default function PolicyNav({ items }) {
  const [active, setActive] = useState(items[0]?.id);

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && setActive(e.target.id)),
      { rootMargin: "-30% 0px -60% 0px" }
    );
    items.forEach(({ id }) => { const el = document.getElementById(id); if (el) io.observe(el); });
    return () => io.disconnect();
  }, [items]);

  const jump = (e, id) => {
    e.preventDefault();
    const el = document.getElementById(id);
    if (!el) return;
    window.history.replaceState(null, "", `#${id}`);
    if (window.__lenis) window.__lenis.scrollTo(el, { offset: -120 });
    else el.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <nav className="toc" aria-label="On this page">
      <span className="eyebrow">On this page</span>
      <ol data-lenis-prevent>
        {items.map(({ id, label }, i) => (
          <li key={id}>
            <a href={`#${id}`} className={active === id ? "active" : ""} onClick={(e) => jump(e, id)} aria-current={active === id ? "true" : undefined}>
              {active === id && <motion.span layoutId="toc-mark" className="toc__mark" transition={{ type: "spring", stiffness: 420, damping: 38 }} />}
              <i>{String(i + 1).padStart(2, "0")}</i>{label}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
