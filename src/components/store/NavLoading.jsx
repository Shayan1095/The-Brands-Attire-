"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";

/*
  Feedback while the next page loads (slow phones, slow connections).

  Next.js keeps the old page on screen until the new one is ready, which on a slow phone feels like a dead tap.
  So: the moment an inside link is tapped a red line runs along the top, and if the page has not arrived after
  a moment, a shimmering outline of the page being opened (shop grid, product, gallery, or a plain page) covers
  the old one. Both go away as soon as the new page is in.

  Done this way rather than with route loading.js files: those wrap every page in a Suspense boundary, which
  lets the scroll-animation layer (Motion.jsx) run before the page has hydrated, and that breaks headlines.

  Code that navigates without a link click (search on Enter) can call: window.dispatchEvent(new CustomEvent("tba:navigate", { detail: href }))
*/

const DELAY = 220; // ms before the outline shows (fast pages never flash it)
const GIVE_UP = 12000; // ms: never leave it up if a navigation silently fails
export const FINISH = 240; // ms the line takes to run to the end once the page is in (the page fades in after it: template.js)

/** Which outline suits a destination. */
function kindOf(path) {
  if (/^\/products\/[^/]+/.test(path)) return "product";
  if (path.startsWith("/products")) return "shop";
  if (path.startsWith("/lookbook")) return "gallery";
  if (path === "/") return "home";
  return "page";
}

const Bar = ({ w = "100%", h = 14, r = 6, style }) => <i className="skel__b" style={{ width: w, height: h, borderRadius: r, ...style }} />;
const Card = () => (
  <div className="skel__card">
    <i className="skel__b skel__img" />
    <Bar w="40%" h={10} />
    <Bar w="75%" />
    <Bar w="35%" h={16} />
  </div>
);

function Outline({ kind }) {
  if (kind === "product") {
    return (
      <div className="wrap skel__pdp">
        <i className="skel__b skel__gallery" />
        <div className="skel__stack">
          <Bar w="22%" h={10} />
          <Bar w="70%" h={46} r={8} />
          <Bar w="30%" h={22} />
          <Bar w="90%" /><Bar w="80%" />
          <div className="skel__row">{[0, 1, 2, 3, 4].map((i) => <Bar key={i} w={56} h={50} r={8} />)}</div>
          <Bar w="100%" h={56} r={8} />
          <Bar w="100%" h={110} r={14} />
        </div>
      </div>
    );
  }
  if (kind === "shop" || kind === "home") {
    return (
      <>
        <i className="skel__b skel__hero" />
        <div className="wrap">
          <div className="skel__row skel__chips">{[0, 1, 2, 3, 4].map((i) => <Bar key={i} w={120} h={46} r={999} />)}</div>
          <div className="skel__grid">{Array.from({ length: 8 }, (_, i) => <Card key={i} />)}</div>
        </div>
      </>
    );
  }
  if (kind === "gallery") {
    return (
      <div className="wrap">
        <Bar w="45%" h={60} r={8} style={{ margin: "40px 0 28px" }} />
        <div className="skel__masonry">{[320, 240, 380, 280, 260, 340, 300, 220].map((h, i) => <i key={i} className="skel__b" style={{ height: h }} />)}</div>
      </div>
    );
  }
  return (
    <>
      <i className="skel__b skel__hero skel__hero--short" />
      <div className="wrap skel__text">
        <Bar w="18%" h={10} />
        <Bar w="55%" h={40} r={8} />
        <Bar w="100%" /><Bar w="92%" /><Bar w="70%" />
        <div className="skel__grid skel__grid--3">{[0, 1, 2].map((i) => <i key={i} className="skel__b" style={{ height: 180, borderRadius: 16 }} />)}</div>
      </div>
    </>
  );
}

export default function NavLoading() {
  const pathname = usePathname();
  const [state, setState] = useState(null); // null | { kind, show }
  const timers = useRef([]);
  const bar = useRef(null);
  const run = useRef(null); // the running animation of the line while a page loads
  const clear = () => { timers.current.forEach(clearTimeout); timers.current = []; };

  // the new page is in: the line runs to the end and fades; the page fades in after it (template.js waits FINISH ms)
  useEffect(() => {
    clear();
    setState(null);
    const el = bar.current;
    if (!run.current || !el) return;
    const now = getComputedStyle(el).transform;
    run.current.cancel();
    run.current = null;
    el.animate([{ transform: now === "none" ? "scaleX(0)" : now }, { transform: "scaleX(1)" }], { duration: FINISH, easing: "cubic-bezier(.3, 0, .2, 1)", fill: "forwards" })
      .finished.then(() => el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, delay: 60, fill: "forwards" }).finished)
      .then(() => { el.getAnimations().forEach((a) => a.cancel()); el.style.opacity = "0"; })
      .catch(() => {});
    setTimeout(() => { window.__tbaNav = false; }, FINISH + 50);
  }, [pathname]);

  useEffect(() => {
    const start = (href) => {
      let url;
      try { url = new URL(href, window.location.href); } catch { return; }
      if (url.origin !== window.location.origin || url.pathname.startsWith("/admin") || url.pathname.startsWith("/api")) return;
      if (url.pathname === window.location.pathname) return; // same page, other filters: the page handles it itself
      clear();
      // the red line: quick at first, then slowing as it nears the end (it only finishes when the page is in)
      const el = bar.current;
      if (el) {
        el.getAnimations().forEach((a) => a.cancel());
        el.style.opacity = "1";
        run.current = el.animate(
          [{ transform: "scaleX(0)" }, { transform: "scaleX(.35)", offset: 0.1 }, { transform: "scaleX(.7)", offset: 0.4 }, { transform: "scaleX(.92)" }],
          { duration: 8000, easing: "cubic-bezier(.1, .8, .2, 1)", fill: "forwards" }
        );
      }
      window.__tbaNav = true;
      const kind = kindOf(url.pathname);
      // the outline sits just under the header, wherever the header is right now
      const top = Math.max(0, Math.round(document.querySelector(".nav")?.getBoundingClientRect().bottom || 0));
      setState({ kind, top, show: false });
      timers.current.push(setTimeout(() => setState((s) => (s ? { ...s, show: true } : s)), DELAY));
      timers.current.push(setTimeout(() => {
        setState(null);
        run.current?.cancel();
        run.current = null;
        if (bar.current) bar.current.style.opacity = "0";
        window.__tbaNav = false;
      }, GIVE_UP));
    };
    const onClick = (e) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target.closest?.("a[href]");
      if (!a || a.target === "_blank" || a.hasAttribute("download") || a.dataset.noLoading !== undefined) return;
      // product cards open with their own photo transition (morph.js), which already covers the wait
      if (a.closest(".card")) return;
      start(a.getAttribute("href"));
    };
    const onNav = (e) => start(e.detail);
    document.addEventListener("click", onClick, true);
    window.addEventListener("tba:navigate", onNav);
    return () => { document.removeEventListener("click", onClick, true); window.removeEventListener("tba:navigate", onNav); clear(); };
  }, []);

  return (
    <>
      <span className="navbar-load" ref={bar} aria-hidden />
      <AnimatePresence>
        {state?.show && (
          <motion.div
            className={`skel skel--${state.kind}`} style={{ top: state.top }} role="status" aria-live="polite" aria-label="Loading the page"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.25 } }} transition={{ duration: 0.2 }}
          >
            <Outline kind={state.kind} />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
