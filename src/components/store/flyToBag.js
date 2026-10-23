/** The product photo flies into the bag icon in the header, then the bag gives a little bounce. */
export function flyToBag(img) {
  const bag = document.querySelector('[aria-label^="Open bag"]');
  if (!img || !bag || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return Promise.resolve();
  const a = img.getBoundingClientRect();
  const b = bag.getBoundingClientRect();
  if (b.bottom < 0 || a.width === 0) return Promise.resolve();
  const ghost = img.cloneNode();
  ghost.removeAttribute("srcset");
  Object.assign(ghost.style, {
    position: "fixed", left: `${a.left}px`, top: `${a.top}px`, width: `${a.width}px`, height: `${a.height}px`,
    margin: 0, objectFit: "cover", borderRadius: "14px", zIndex: 400, pointerEvents: "none",
    boxShadow: "0 30px 60px -20px rgba(0,0,0,.5)", willChange: "transform, opacity",
  });
  document.body.appendChild(ghost);
  const dx = b.left + b.width / 2 - (a.left + a.width / 2);
  const dy = b.top + b.height / 2 - (a.top + a.height / 2);
  const end = Math.max(0.05, 36 / a.width);
  const flight = ghost.animate(
    [
      { transform: "translate(0, 0) scale(1)", opacity: 1 },
      { transform: `translate(${dx * 0.45}px, ${dy * 0.45 - 90}px) scale(${Math.max(end, 0.42)}) rotate(-6deg)`, opacity: 1, borderRadius: "28px", offset: 0.5 },
      { transform: `translate(${dx}px, ${dy}px) scale(${end}) rotate(0deg)`, opacity: 0.35, borderRadius: "50%" },
    ],
    { duration: 820, easing: "cubic-bezier(.55, 0, .25, 1)", fill: "forwards" }
  );
  // never keep the customer waiting on the effect: if the browser throttles it, carry on after 1.2s
  const landed = Promise.race([flight.finished.catch(() => {}), new Promise((r) => setTimeout(r, 1200))]);
  return landed.then(() => {
    ghost.remove();
    bag.animate([{ scale: 1 }, { scale: 1.3 }, { scale: 0.92 }, { scale: 1 }], { duration: 520, easing: "cubic-bezier(.3, 1.6, .5, 1)" });
  });
}
