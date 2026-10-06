"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import { useGSAP } from "@gsap/react";
import Lenis from "lenis";

gsap.registerPlugin(ScrollTrigger, SplitText, useGSAP);
ScrollTrigger.config({ ignoreMobileResize: true }); // phone address bars resize the viewport constantly

/*
  The motion layer for the whole shop. Pages stay plain markup and opt in with attributes:

    data-split            headline: lines slide up from a mask
    data-reveal           fades / rises in when scrolled into view
    data-clip             image tile wipes open from the bottom
    data-parallax         <img> inside an overflow:hidden box drifts with scroll
    data-drift            large background text slides sideways with scroll
    data-grow             a line that draws itself left-to-right as its section scrolls by
    data-scrub-text       words light up one by one as you scroll through
    data-marquee="1|-1"   endless ticker that speeds up with scroll velocity
    data-hscroll          pinned section whose track scrolls sideways (desktop)
    data-hero / -img / -content   home hero zoom-out + parallax

  Everything is skipped for visitors who prefer reduced motion.
*/
export default function Motion({ paused }) {
  const pathname = usePathname();
  const [tick, setTick] = useState(0);
  const lenis = useRef(null);

  // smooth scrolling, driven by GSAP's ticker so scroll and animation share one clock
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const instance = new Lenis({ lerp: 0.12, anchors: true });
    lenis.current = instance;
    window.__lenis = instance;
    instance.on("scroll", ScrollTrigger.update);
    const tick = (time) => instance.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);
    return () => {
      gsap.ticker.remove(tick);
      instance.destroy();
      lenis.current = null;
      window.__lenis = null;
    };
  }, []);

  // a component that replaces animated markup without a navigation asks for a fresh setup:
  //   window.dispatchEvent(new Event("tba:motion"))
  useEffect(() => {
    const again = () => setTick((t) => t + 1);
    window.addEventListener("tba:motion", again);
    return () => window.removeEventListener("tba:motion", again);
  }, []);

  // freeze the page behind the cart / search / menu
  useEffect(() => {
    if (paused) lenis.current?.stop();
    else lenis.current?.start();
  }, [paused]);

  // new page: start at the top (unless the link points at an #anchor)
  useEffect(() => {
    if (!window.location.hash) lenis.current?.scrollTo(0, { immediate: true, force: true });
  }, [pathname]);

  useGSAP(
    () => {
      const splits = [];
      const mm = gsap.matchMedia();

      mm.add({ motion: "(prefers-reduced-motion: no-preference)", desktop: "(min-width: 901px)" }, (ctx) => {
        const { motion, desktop } = ctx.conditions;
        if (!motion) return;
        const all = (sel) => gsap.utils.toArray(sel);

        /* sideways product run, pinned while it scrolls (desktop only; phones swipe it).
           This MUST be set up first: pinning adds scroll length, and every trigger further down the
           page has to be measured with that extra length included, or it fires in the wrong place. */
        if (desktop) {
          all("[data-hscroll]").forEach((section) => {
            const pin = section.querySelector("[data-hscroll-pin]");
            const track = section.querySelector("[data-hscroll-track]");
            const distance = () => Math.max(0, track.scrollWidth - window.innerWidth);
            gsap.set(pin, { overflow: "hidden" });
            gsap.to(track, {
              x: () => -distance(), ease: "none",
              scrollTrigger: { trigger: pin, start: "top top", end: () => `+=${distance()}`, pin: true, scrub: 0.6, anticipatePin: 1, invalidateOnRefresh: true },
            });
          });
        }

        /* headlines */
        all("[data-split]").forEach((el) => {
          splits.push(
            SplitText.create(el, {
              type: "lines", mask: "lines", linesClass: "line", autoSplit: true,
              onSplit: (self) =>
                gsap.from(self.lines, {
                  yPercent: 115, duration: 1.1, ease: "expo.out", stagger: 0.09,
                  scrollTrigger: { trigger: el, start: "top 92%", once: true },
                }),
            })
          );
        });

        /* fade-up reveals, staggered per row */
        const reveals = all("[data-reveal]");
        if (reveals.length) gsap.set(reveals, { opacity: 0, y: 28 });
        ScrollTrigger.batch(reveals, {
          start: "top 94%", once: true,
          onEnter: (batch) => gsap.to(batch, { opacity: 1, y: 0, duration: 0.75, ease: "power3.out", stagger: 0.06, overwrite: true, clearProps: "transform,opacity" }),
        });

        /* image tiles wipe open */
        const clips = all("[data-clip]");
        if (clips.length) gsap.set(clips, { clipPath: "inset(100% 0% 0% 0% round 12px)" });
        ScrollTrigger.batch(clips, {
          start: "top 90%", once: true,
          // the clip is removed once open, so it can never interfere with hover effects afterwards
          onEnter: (batch) => gsap.to(batch, { clipPath: "inset(0% 0% 0% 0% round 12px)", duration: 1.2, ease: "expo.out", stagger: 0.12, overwrite: true, clearProps: "clipPath" }),
        });

        /* parallax images */
        all("[data-parallax]").forEach((img) => {
          gsap.fromTo(img, { yPercent: -8, scale: 1.22 }, {
            yPercent: 8, scale: 1.22, ease: "none", force3D: true,
            scrollTrigger: { trigger: img.closest("[data-parallax-box]") || img.parentElement, start: "top bottom", end: "bottom top", scrub: true },
          });
        });

        /* background text drifting sideways */
        all("[data-drift]").forEach((el) => {
          gsap.to(el, { xPercent: -28, ease: "none", scrollTrigger: { trigger: el.parentElement, start: "top bottom", end: "bottom top", scrub: 0.6 } });
        });

        /* lines that draw themselves */
        all("[data-grow]").forEach((el) => {
          gsap.fromTo(el, { scaleX: 0 }, { scaleX: 1, ease: "none", scrollTrigger: { trigger: el.parentElement, start: "top 82%", end: "top 35%", scrub: 0.5 } });
        });

        /* words light up as you read */
        all("[data-scrub-text]").forEach((el) => {
          const split = SplitText.create(el, { type: "words" });
          splits.push(split);
          gsap.fromTo(split.words, { opacity: 0.14 }, {
            opacity: 1, ease: "none", stagger: 0.1,
            scrollTrigger: { trigger: el, start: "top 82%", end: "bottom 48%", scrub: true },
          });
        });

        /* tickers: constant drift, pushed faster (and reversed) by scroll velocity */
        const loops = all("[data-marquee]").map((el) => {
          const base = Number(el.dataset.marquee) || 1;
          const loop = gsap.to(el.firstElementChild, { xPercent: -50, duration: 36, ease: "none", repeat: -1, force3D: true });
          loop.totalTime(36 * 50); // room to play backwards
          loop.timeScale(base);
          // off-screen tickers do no work
          ScrollTrigger.create({ trigger: el, start: "top bottom", end: "bottom top", onToggle: (self) => loop.paused(!self.isActive) });
          return { loop, base };
        });
        // one scroll listener + one per-frame easing step for all tickers (no tweens created while scrolling)
        let push = 0, eased = 0, dir = 1;
        ScrollTrigger.create({ onUpdate: (self) => { push = gsap.utils.clamp(-6, 6, self.getVelocity() / 350); } });
        const stepTickers = () => {
          eased += (push - eased) * 0.1;
          push *= 0.9;
          if (Math.abs(eased) > 0.05) dir = eased < 0 ? -1 : 1;
          for (const { loop, base } of loops) loop.timeScale(base * dir * (1 + Math.abs(eased)));
        };
        if (loops.length) gsap.ticker.add(stepTickers);

        /* home hero */
        const hero = document.querySelector("[data-hero]");
        if (hero) {
          gsap.to("[data-hero-img]", { yPercent: 16, ease: "none", force3D: true, scrollTrigger: { trigger: hero, start: 0, end: "bottom top", scrub: true } });
          gsap.to("[data-hero-content]", { yPercent: -14, opacity: 0, ease: "none", scrollTrigger: { trigger: hero, start: 0, end: "bottom 35%", scrub: true } });
        }

        /* footer wordmark rises into place */
        all("[data-rise]").forEach((el) => {
          gsap.from(el, { yPercent: 70, ease: "none", scrollTrigger: { trigger: el.parentElement, start: "top bottom", end: "bottom bottom", scrub: 0.4 } });
        });

        /* reading progress line under the nav */
        gsap.to("[data-progress]", { scaleX: 1, ease: "none", scrollTrigger: { start: 0, end: "max", scrub: 0.3 } });

        return () => gsap.ticker.remove(stepTickers);
      });

      // content is hidden by CSS until this point so nothing flashes before it animates
      document.documentElement.dataset.motion = "1";
      return () => splits.forEach((s) => s.revert());
    },
    { dependencies: [pathname, tick], revertOnUpdate: true }
  );

  return null;
}
