"use client";

import { useEffect, useRef } from "react";
import { Caveat } from "next/font/google";
import gsap from "gsap";
import { Icon } from "./icons";

const hand = Caveat({ weight: "600", subsets: ["latin"], display: "swap" });

const TILTS = [-6, 5, -4, 6, -5]; // each tag settles at its own slight angle, like real swing tags
const NS = "http://www.w3.org/2000/svg";

/** A smooth curve through the points (Catmull-Rom turned into cubic Béziers). */
function curveThrough(pts) {
  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    d += ` C${c1.x},${c1.y} ${c2.x},${c2.y} ${p2.x},${p2.y}`;
  }
  return d;
}

/**
 * The order journey as swing tags on a thread (track page).
 * Scrolling draws a red thread from tag to tag while a small parcel rides along it at the reading line; each tag
 * drops onto the thread as it comes into view and swings until it settles. Scrolling back lifts them off again. The thread is
 * drawn through the tags' real eyelet positions, so any layout (zig-zag on desktop, a column on phones) works.
 * Lite mode and reduced motion: everything is shown hung and drawn, nothing moves.
 *
 * stages = [[icon, title, text], ...]
 */
export default function TagTrail({ stages }) {
  const root = useRef(null);

  useEffect(() => {
    const box = root.current;
    const svg = box.querySelector(".tt__svg");
    const base = box.querySelector(".tt__base");
    const line = box.querySelector(".tt__line");
    const parcel = box.querySelector(".tt__parcel");
    const stamp = box.querySelector(".tt__stamp");
    const cards = [...box.querySelectorAll(".tt__card")];
    const still = document.documentElement.dataset.lite === "1" || window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let L = 1, hung = cards.map(() => false), last = -1;
    let lut = []; // points along the thread, every 2px: the parcel reads from here instead of measuring the path each frame
    let lastOffset = -1, lastParcel = "";
    let boxTop = 0, eyeY = [], reach = [];

    // rebuild the thread through where the eyelets actually are right now
    const layout = () => {
      const b = box.getBoundingClientRect();
      svg.setAttribute("viewBox", `0 0 ${b.width} ${b.height}`);
      const at = (el) => { const r = el.getBoundingClientRect(); return { x: r.left - b.left + r.width / 2, y: r.top - b.top + r.height / 2 }; };
      const eyes = cards.map((c) => at(c.querySelector(".tt__eyelet")));
      const end = at(box.querySelector(".tt__endpoint"));
      const start = { x: eyes[0].x - Math.min(160, b.width * 0.2), y: Math.max(0, eyes[0].y - 90) };
      const pts = [start, ...eyes, end];
      const d = curveThrough(pts);
      base.setAttribute("d", d);
      line.setAttribute("d", d);
      L = line.getTotalLength();
      line.style.strokeDasharray = `${L}`;
      lut = [];
      for (let s = 0; s <= L; s += 2) lut.push(line.getPointAtLength(s));
      lut.push(line.getPointAtLength(L));
      lastOffset = -1; lastParcel = "";
      boxTop = b.top + window.scrollY;
      eyeY = eyes.map((e) => e.y);
      // the thread winds sideways, so for each point keep the lowest height reached so far: a height then maps to one place on it
      reach = [];
      let low = -Infinity;
      for (const pt of lut) { low = Math.max(low, pt.y); reach.push(low); }
    };

    const swingIn = (i) => {
      const tilt = TILTS[i % TILTS.length];
      cards[i].animate(
        [
          { transform: "translateY(-70px) rotate(-26deg)", opacity: 0 },
          { transform: `translateY(6px) rotate(${tilt + 16}deg)`, opacity: 1, offset: 0.42 },
          { transform: `translateY(0) rotate(${tilt - 9}deg)`, offset: 0.62 },
          { transform: `rotate(${tilt + 4}deg)`, offset: 0.8 },
          { transform: `rotate(${tilt - 1.5}deg)`, offset: 0.92 },
          { transform: `rotate(${tilt}deg)`, opacity: 1 },
        ],
        { duration: 1700, easing: "cubic-bezier(.3, .7, .3, 1)", fill: "forwards" }
      );
      cards[i].classList.add("is-hung");
    };
    const liftOff = (i) => {
      const tilt = TILTS[i % TILTS.length];
      cards[i].animate([{ transform: `rotate(${tilt}deg)`, opacity: 1 }, { transform: "translateY(-50px) rotate(-20deg)", opacity: 0 }], { duration: 380, easing: "cubic-bezier(.5, 0, .75, 0)", fill: "forwards" });
      cards[i].classList.remove("is-hung");
    };

    const render = (p) => {
      // only touch the page when something visibly changed (half a pixel of thread, or a moved parcel)
      const offset = Math.round(L * (1 - p) * 2) / 2;
      if (offset !== lastOffset) { line.style.strokeDashoffset = `${offset}`; lastOffset = offset; }
      const i = Math.min(lut.length - 1, Math.round((L * p) / 2));
      const pt = lut[i], ahead = lut[Math.min(lut.length - 1, i + 3)];
      const angle = (Math.atan2(ahead.y - pt.y, ahead.x - pt.x) * 180) / Math.PI;
      const tf = `translate3d(${(pt.x - 23).toFixed(1)}px, ${(pt.y - 23).toFixed(1)}px, 0) rotate(${Math.max(-35, Math.min(35, angle * 0.35)).toFixed(1)}deg)`;
      if (tf !== lastParcel) { parcel.style.transform = tf; lastParcel = tf; }
      const show = p > 0.005 && p < 0.995 ? "1" : "0";
      if (parcel.style.opacity !== show) parcel.style.opacity = show;
      const done = p >= 0.985;
      if (done !== (last >= 0.985)) {
        stamp.classList.toggle("is-on", done);
        if (done) navigator.vibrate?.(14);
      }
      last = p;
    };

    layout();
    if (still) {
      box.classList.add("is-still");
      line.style.strokeDashoffset = "0";
      cards.forEach((c, i) => { c.style.transform = `rotate(${TILTS[i % TILTS.length]}deg)`; c.style.opacity = "1"; c.classList.add("is-hung"); });
      stamp.classList.add("is-on");
      const ro = new ResizeObserver(layout);
      ro.observe(box);
      return () => ro.disconnect();
    }

    cards.forEach((c) => { c.style.opacity = "0"; });

    /*
      Following the scroll: the tip of the thread (and the parcel) sits at the reading line, a little above the
      middle of the screen, so it moves at the speed of the scroll instead of racing along the whole zig-zag.
      It eases towards that point every frame, so it glides. Each tag hangs as it comes into comfortable view,
      just before the thread reaches it, and lifts off again when scrolled back above it.
    */
    const READ = 0.55; // the reading line, as a share of the screen height
    const LEAD = 0.18; // tags hang this much of a screen ahead of the reading line
    let shown = 0, target = 0, near = false;
    const targetFor = () => {
      const readY = window.scrollY + window.innerHeight * READ - boxTop;
      if (!reach.length || readY <= reach[0]) return { p: 0, readY };
      let lo = 0, hi = reach.length - 1;
      if (readY >= reach[hi]) return { p: 1, readY };
      while (lo < hi) { const mid = (lo + hi) >> 1; if (reach[mid] < readY) lo = mid + 1; else hi = mid; }
      return { p: lo / (reach.length - 1), readY };
    };
    const tick = (time, delta) => {
      if (!near) return;
      const { p, readY } = targetFor();
      target = p;
      // ease towards the target, the same speed at any frame rate
      const k = 1 - Math.pow(1 - 0.08, (delta || 16.7) / 16.7); // a soft glide behind the scroll
      shown = Math.abs(target - shown) < 0.0004 ? target : shown + (target - shown) * k;
      render(shown);
      const hangLine = readY + window.innerHeight * LEAD;
      eyeY.forEach((y, i) => {
        if (y <= hangLine && !hung[i]) { hung[i] = true; swingIn(i); }
        else if (y > hangLine + 80 && hung[i]) { hung[i] = false; liftOff(i); }
      });
    };
    gsap.ticker.add(tick);
    // only work while the section is on (or near) the screen
    const io = new IntersectionObserver(([e]) => { near = e.isIntersecting; }, { rootMargin: "40% 0px 40% 0px" });
    io.observe(box);
    render(0);
    // re-measure when the section or anything above it changes size (photos loading, fonts, the window)
    const ro = new ResizeObserver(() => { layout(); render(shown); });
    ro.observe(box);
    ro.observe(document.body);
    return () => { gsap.ticker.remove(tick); io.disconnect(); ro.disconnect(); };
  }, []);

  return (
    <div className="tt" ref={root}>
      <svg className="tt__svg" aria-hidden preserveAspectRatio="none">
        <path className="tt__base" />
        <path className="tt__line" />
      </svg>

      <ol className="tt__tags">
        {stages.map(([icon, title, text], i) => (
          <li key={title} className={`tt__slot tt__slot--${i % 2 ? "r" : "l"}`}>
            <article className="tt__card" style={{ "--tilt": `${TILTS[i % TILTS.length]}deg` }}>
              <span className="tt__eyelet" aria-hidden />
              <span className="tt__num">{String(i + 1).padStart(2, "0")}</span>
              <span className="tt__icon" aria-hidden><Icon name={icon} /></span>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          </li>
        ))}
      </ol>

      <div className="tt__end">
        <span className="tt__endpoint" aria-hidden />
        <span className={`tt__note ${hand.className}`}>Ready to be delivered!</span>
        <span className="tt__stamp" aria-hidden><Icon name="check" /> Delivered</span>
      </div>

      <span className="tt__parcel" aria-hidden><Icon name="box" /></span>
    </div>
  );
}
