/*
  Card -> product page: the tapped photo grows into the product page's main photo (View Transitions API).

  The clicked card photo and the product page's first photo share one view-transition-name for the duration
  of the change; the browser animates between the two snapshots while the rest of the page cross-fades.
  The product page's slider (pdp/Gallery.jsx) picks the name up through `window.__tbaMorph` and skips its own
  opening animation, so the photo lands exactly where it ends up.

  Browsers without the API, lite mode and reduced motion get a normal page change.
*/
export const MORPH_NAME = "tba-photo";

const plain = () =>
  typeof document === "undefined" || !document.startViewTransition ||
  document.documentElement.dataset.lite === "1" ||
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Open a product page from a card photo. `router` is next/navigation's router. */
export function morphTo(router, href, img) {
  if (plain() || !img || !img.complete || img.getBoundingClientRect().bottom < 0) return router.push(href);
  img.style.viewTransitionName = MORPH_NAME;
  window.__tbaMorph = true;
  const ready = () => new Promise((resolve) => {
    router.push(href);
    const started = performance.now();
    const check = () => {
      const target = document.querySelector("img[data-morph]");
      if (target) return (target.decode ? target.decode().catch(() => {}) : Promise.resolve()).then(resolve);
      // a slow connection must never hold the screen frozen: give up on the effect and just show the page
      if (performance.now() - started > 1800) return resolve();
      setTimeout(check, 30);
    };
    // (a timer, not requestAnimationFrame: the browser pauses frames while it waits for this update)
    setTimeout(check, 30);
  });
  const vt = document.startViewTransition(ready);
  vt.finished.finally(() => {
    window.__tbaMorph = false;
    img.style.viewTransitionName = "";
    document.querySelectorAll("img[data-morph]").forEach((el) => { el.style.viewTransitionName = ""; el.removeAttribute("data-morph"); });
  });
}

/** True for a click that should open normally (new tab, download, middle button...). */
export const isModified = (e) => e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0;
