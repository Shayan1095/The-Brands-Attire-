/**
 * "Added": a picture of the piece lifts, arcs into the bag icon in the header and the bag answers with a bounce and
 * a ring (plus a tiny vibration on phones that allow it).
 *
 *   img    the product photo the piece came from
 *   from   the button that was pressed: the flight starts there when the photo is off screen (or too big, on a phone)
 *   thumb  a small version of the photo (the flying card never needs the full-size image)
 *
 * Only transform and opacity animate (no layout, no border-radius), on a card-sized copy, so it stays smooth on
 * phones. It never keeps the customer waiting: the promise settles when it lands, or after a second at most.
 */
export function flyToBag(img, { from = null, thumb = null } = {}) {
  const bag = document.getElementById("nav-cart-trigger") || document.querySelector('[aria-label^="Open bag"]');
  if (!bag || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return Promise.resolve();
  const b = bag.getBoundingClientRect();
  if (b.bottom < 0 || b.width === 0) return Promise.resolve();
  const vw = window.innerWidth, vh = window.innerHeight;
  const phone = window.matchMedia("(max-width: 900px)").matches;
  const src = thumb || img?.currentSrc || img?.src;
  if (!src) return Promise.resolve();

  // where it starts: the photo while it is on screen (on a phone only when it is card-sized), else the button pressed
  const a = img?.getBoundingClientRect();
  const onScreen = a && a.width > 0 && a.bottom > 60 && a.top < vh - 60;
  let x, y, w, h;
  if (onScreen && !(phone && a.width > vw * 0.6)) {
    ({ left: x, top: y, width: w, height: h } = a);
  } else if (from) {
    const r = from.getBoundingClientRect();
    w = 64; h = 80; x = r.left + r.width / 2 - w / 2; y = r.top + r.height / 2 - h / 2;
  } else if (onScreen) {
    ({ left: x, top: y, width: w, height: h } = a);
  } else {
    return Promise.resolve();
  }
  // a big photo becomes a card first: far less to redraw on every frame
  const cap = phone ? 140 : 260;
  if (w > cap) { const k = cap / w; x += (w - cap) / 2; y += (h - h * k) / 2; h *= k; w = cap; }

  const ghost = document.createElement("div");
  ghost.className = "fly-chip";
  Object.assign(ghost.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px`, backgroundImage: `url("${src}")` });
  document.body.appendChild(ghost);

  const dx = b.left + b.width / 2 - (x + w / 2);
  const dy = b.top + b.height / 2 - (y + h / 2);
  const end = Math.max(0.06, 20 / w);
  const lift = Math.min(130, Math.abs(dy) * 0.22 + 46); // the arc: up, then down into the bag
  const flight = ghost.animate(
    [
      { transform: "translate3d(0, 0, 0) scale(.86)", opacity: 0 },
      { transform: "translate3d(0, -10px, 0) scale(1.04)", opacity: 1, offset: 0.16 },
      { transform: `translate3d(${dx * 0.55}px, ${dy * 0.55 - lift}px, 0) scale(${Math.max(end, 0.5)}) rotate(-5deg)`, opacity: 1, offset: 0.62 },
      { transform: `translate3d(${dx}px, ${dy}px, 0) scale(${end}) rotate(0deg)`, opacity: 0.4 },
    ],
    { duration: phone ? 700 : 780, easing: "cubic-bezier(.45, 0, .2, 1)", fill: "forwards" }
  );
  const landed = Promise.race([flight.finished.catch(() => {}), new Promise((r) => setTimeout(r, 1000))]);
  return landed.then(() => {
    ghost.remove();
    bag.animate([{ transform: "scale(1)" }, { transform: "scale(1.22)" }, { transform: "scale(.94)" }, { transform: "scale(1)" }], { duration: 460, easing: "cubic-bezier(.3, 1.6, .5, 1)" });
    bag.classList.remove("is-landed");
    void bag.offsetWidth; // restart the ring
    bag.classList.add("is-landed");
    setTimeout(() => bag.classList.remove("is-landed"), 700);
    navigator.vibrate?.(8);
  });
}
