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
    data-ethosb           pinned "MEAN IT" with a photo inside the letters that zooms open
    data-speed="s"        element drifts at its own speed while its section scrolls by (desktop)
    data-expand           framed photo grows to full width; its [data-expand-img] settles from a zoom
    data-chat             phone preview: [data-chat-msg]s pop in after a [data-chat-typing] beat, once in view
    data-rise             footer wordmark: letters rise into place as the page ends
    data-marquee="1|-1"   endless ticker that speeds up with scroll velocity
    data-hscroll          pinned section whose track scrolls sideways (desktop)
    data-stack            pinned section that deals [data-stack-card]s onto a stack as you scroll (desktop)
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
    // lite mode (set in the layout's boot script for devices drawing without the graphics card): native scrolling
    if (document.documentElement.dataset.lite === "1") return;
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

  // when the page changes height after it was measured (the product grid filling in, recent orders, an empty
  // bag, photos without a set size), every scroll animation below that point would fire in the wrong place,
  // and the footer could stay hidden because its start point was further down than the page now reaches.
  // So re-measure whenever the page height settles at a new value.
  // A re-measure is heavy, so it never runs mid-scroll: it waits until the page has been still for a moment.
  useEffect(() => {
    let height = document.documentElement.scrollHeight;
    let timer = 0;
    let lastScroll = 0;
    const onScroll = () => { lastScroll = performance.now(); };
    const settle = () => {
      clearTimeout(timer);
      const idle = performance.now() - lastScroll;
      timer = setTimeout(() => {
        if (performance.now() - lastScroll < 250) return settle(); // still scrolling: try again shortly
        if (Math.abs(document.documentElement.scrollHeight - height) < 2) return;
        height = document.documentElement.scrollHeight;
        ScrollTrigger.refresh();
      }, Math.max(160, 300 - idle));
    };
    const ro = new ResizeObserver(() => {
      if (Math.abs(document.documentElement.scrollHeight - height) >= 2) settle();
    });
    ro.observe(document.body);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { ro.disconnect(); clearTimeout(timer); window.removeEventListener("scroll", onScroll); };
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
        // lite: keep one-time reveals and the card deal, drop every continuous scroll-linked effect
        const lite = document.documentElement.dataset.lite === "1";
        // phones and small tablets: the one-time entrance animations and the pinned "MEAN IT" zoom stay, but effects
        // that redraw big photos on every scroll frame (parallax, scrubbed zooms, wipes) are left out. On a phone
        // they caused the hitch when a section scrolled into view, and a thumb scroll is smoother without them.
        const rich = desktop && !lite;

        /* sideways product run, pinned while it scrolls (desktop only; phones swipe it).
           This MUST be set up first: pinning adds scroll length, and every trigger further down the
           page has to be measured with that extra length included, or it fires in the wrong place. */
        const stackSyncs = [];
        if (desktop) {
          /* new arrivals deck: the section holds while scrolling deals each card in from the right
             onto a stack; the ones beneath slip back, shrink, tilt and darken, and fade out 3 deep.
             Only transform and opacity are animated (no filters, no layout), so it stays on the GPU. */
          all("[data-stack]").forEach((section) => {
            const pin = section.querySelector("[data-stack-pin]");
            const stage = section.querySelector("[data-stack-stage]");
            const cards = gsap.utils.toArray(section.querySelectorAll("[data-stack-card]"));
            const shades = cards.map((c) => c.querySelector("[data-stack-shade]"));
            const count = section.querySelector("[data-stack-count]");
            const bar = section.querySelector("[data-stack-bar]");
            const products = cards.length - 1; // the last card is "view the full collection"
            if (cards.length < 2) return;

            // how far right a card waits before it is dealt: just past the edge of the screen
            const offstage = () => window.innerWidth - stage.getBoundingClientRect().left + 40;
            const DEPTH = 3; // cards visible underneath the top one

            const tl = gsap.timeline({ defaults: { ease: "none" } });
            cards.forEach((card, s) => {
              if (s === 0) return;
              const at = s - 1;
              tl.fromTo(card, { x: offstage, y: 46, rotation: lite ? 0 : 8 }, { x: 0, y: 0, rotation: 0, duration: 1, ease: "power2.out", force3D: true }, at);
              for (let d = 1; d <= DEPTH + 1; d++) {
                const j = s - d;
                if (j < 0) break;
                tl.to(cards[j], { x: -d * 34, y: -d * 12, scale: lite ? 1 : 1 - d * 0.06, rotation: lite ? 0 : -d * 2.4, opacity: d > DEPTH ? 0 : 1, duration: 1, force3D: true }, at);
                if (shades[j]) tl.to(shades[j], { opacity: Math.min(0.62, d * 0.2), duration: 1 }, at);
              }
            });
            tl.to({}, { duration: 0.45 }); // a beat on the last card before the page moves on

            // counter and progress line follow the (smoothed) animation, not the raw scroll.
            // A scrubbed timeline does not fire its own update callback, so this runs each frame,
            // but only while the section is pinned on screen.
            let shown = -1;
            const sync = () => {
              const i = Math.min(products, Math.round(tl.time()) + 1);
              if (i !== shown && count) { count.textContent = String(i).padStart(2, "0"); shown = i; }
              if (bar) bar.style.transform = `scaleX(${tl.progress().toFixed(4)})`;
            };
            stackSyncs.push(sync);

            ScrollTrigger.create({
              trigger: pin, start: "top top", end: () => `+=${Math.round(window.innerHeight * 0.62 * (cards.length - 1))}`,
              pin: true, scrub: 0.9, anticipatePin: 1, invalidateOnRefresh: true, animation: tl,
              onToggle: (self) => {
                gsap.ticker.remove(sync);
                if (self.isActive) gsap.ticker.add(sync);
              },
              onScrubComplete: sync,
            });
            section.dataset.stackReady = "1";
          });

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

        /* ethos option B: the section holds while "MEAN IT" zooms in around the stroke of the I until
           the photo inside the letters fills the screen, then the sentence fades in over it.
           A pin, so it is set up here, before every trigger further down the page. */
        // lite: the section simply shows its finished state (photo + sentence), no pin and no blended zoom
        if (!lite) all("[data-ethosb]").forEach((section) => {
          const pin = section.querySelector("[data-ethosb-pin]");
          const knock = section.querySelector("[data-ethosb-knock]");
          const anchor = section.querySelector("[data-ethosb-anchor]");
          const photo = section.querySelector("[data-ethosb-photo] img");
          const copy = gsap.utils.toArray(section.querySelectorAll("[data-ethosb-copy]"));
          // zoom towards the middle of the I's stroke (layout position, so earlier scaling never skews it)
          const origin = () => `${anchor.offsetLeft + anchor.offsetWidth / 2}px ${anchor.offsetTop + anchor.offsetHeight * 0.52}px`;

          const tl = gsap.timeline({ defaults: { ease: "none" } });
          tl.fromTo(knock, { scale: 1, autoAlpha: 1, transformOrigin: origin }, { scale: 46, duration: 1, ease: "power3.in", force3D: true }, 0.12)
            .fromTo(photo, { scale: 1.32 }, { scale: 1, duration: 1.2, force3D: true }, 0)
            .to(knock, { autoAlpha: 0, duration: 0.08 }, 1.04) // autoAlpha: once gone it is hidden, so the browser stops blending it
            .fromTo(copy, { opacity: 0, y: 36 }, { opacity: 1, y: 0, stagger: 0.07, duration: 0.32, ease: "power2.out" }, 1.08)
            .to({}, { duration: 0.3 });

          ScrollTrigger.create({
            trigger: pin, start: "top top", end: () => `+=${Math.round(window.innerHeight * (desktop ? 1.8 : 1.3))}`,
            pin: true, scrub: 0.8, anticipatePin: 1, invalidateOnRefresh: true, animation: tl,
          });
        });

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
        const clips = rich ? all("[data-clip]") : [];
        if (clips.length) gsap.set(clips, { clipPath: "inset(100% 0% 0% 0% round 12px)" });
        ScrollTrigger.batch(clips, {
          start: "top 90%", once: true,
          // the clip is removed once open, so it can never interfere with hover effects afterwards
          onEnter: (batch) => gsap.to(batch, { clipPath: "inset(0% 0% 0% 0% round 12px)", duration: 1.2, ease: "expo.out", stagger: 0.12, overwrite: true, clearProps: "clipPath" }),
        });

        /* parallax images */
        if (rich) all("[data-parallax]").forEach((img) => {
          gsap.fromTo(img, { yPercent: -8, scale: 1.22 }, {
            yPercent: 8, scale: 1.22, ease: "none", force3D: true,
            scrollTrigger: { trigger: img.closest("[data-parallax-box]") || img.parentElement, start: "top bottom", end: "bottom top", scrub: true },
          });
        });

        /* background text drifting sideways */
        if (rich) all("[data-drift]").forEach((el) => {
          gsap.to(el, { xPercent: -28, ease: "none", scrollTrigger: { trigger: el.parentElement, start: "top bottom", end: "bottom top", scrub: 0.6 } });
        });

        /* lines that draw themselves */
        all("[data-grow]").forEach((el) => {
          gsap.fromTo(el, { scaleX: 0 }, { scaleX: 1, ease: "none", scrollTrigger: { trigger: el.parentElement, start: "top 82%", end: "top 35%", scrub: 0.5 } });
        });

        /* words light up as you read */
        if (rich) all("[data-scrub-text]").forEach((el) => {
          const split = SplitText.create(el, { type: "words" });
          splits.push(split);
          gsap.fromTo(split.words, { opacity: 0.14 }, {
            opacity: 1, ease: "none", stagger: 0.1,
            scrollTrigger: { trigger: el, start: "top 82%", end: "bottom 48%", scrub: true },
          });
        });

        /* columns that drift at their own speed while the section scrolls by (desktop) */
        if (desktop && !lite) {
          all("[data-speed]").forEach((el) => {
            const s = Number(el.dataset.speed) || 0;
            gsap.fromTo(el, { yPercent: -s * 100 }, {
              yPercent: s * 100, ease: "none", force3D: true,
              scrollTrigger: { trigger: el.parentElement, start: "top bottom", end: "bottom top", scrub: true },
            });
          });
        }

        /* a framed photo that grows to full width as it scrolls in, while the photo inside settles.
           Scale only (no clip-path), so the graphics card does all the work. */
        if (!lite) all("[data-expand]").forEach((frame) => {
          const img = frame.querySelector("[data-expand-img]");
          const st = { trigger: frame, start: "top 92%", end: "top 12%", scrub: 0.6 };
          gsap.fromTo(frame, { scale: desktop ? 0.82 : 0.92 }, { scale: 1, ease: "none", force3D: true, scrollTrigger: st });
          if (img) gsap.fromTo(img, { scale: 1.3 }, { scale: 1.02, ease: "none", force3D: true, scrollTrigger: { ...st, end: "bottom top" } });
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
        if (loops.length && !lite) gsap.ticker.add(stepTickers); // lite: tickers drift at a steady speed

        /* home hero */
        const hero = document.querySelector("[data-hero]");
        if (hero && rich) {
          gsap.to("[data-hero-img]", { yPercent: 16, ease: "none", force3D: true, scrollTrigger: { trigger: hero, start: 0, end: "bottom top", scrub: true } });
          gsap.to("[data-hero-content]", { yPercent: -14, opacity: 0, ease: "none", scrollTrigger: { trigger: hero, start: 0, end: "bottom 35%", scrub: true } });
        }

        /* footer wordmark rises into place letter by letter as the page ends */
        if (!lite) all("[data-rise]").forEach((el) => {
          const split = SplitText.create(el, { type: "chars", charsClass: "rise-char" });
          splits.push(split);
          // force3D "auto": a letter only has its own layer while it moves (17 permanent layers made every page heavier)
          if (desktop) {
            gsap.from(split.chars, {
              yPercent: 105, rotation: 4, ease: "none", stagger: 0.035, force3D: "auto",
              // ends just before the very bottom of the page, so every letter has landed when scrolling stops
              scrollTrigger: { trigger: el.parentElement, start: "top bottom", end: "bottom 103%", scrub: 0.5 },
            });
          } else {
            // phones: the letters rise once as the footer comes into view, then stay still
            gsap.from(split.chars, {
              yPercent: 105, rotation: 4, duration: 0.9, ease: "expo.out", stagger: 0.03, force3D: "auto",
              scrollTrigger: { trigger: el.parentElement, start: "top 92%", once: true },
            });
          }
        });

        /* WhatsApp preview: once the phone is in view, each message arrives after a "typing…" beat */
        all("[data-chat]").forEach((phone) => {
          const msgs = gsap.utils.toArray(phone.querySelectorAll("[data-chat-msg]"));
          const typing = phone.querySelector("[data-chat-typing]");
          gsap.set(msgs, { autoAlpha: 0, y: 26, scale: 0.92, transformOrigin: "0% 100%" });
          if (typing) gsap.set(typing, { autoAlpha: 0 });
          const tl = gsap.timeline({ paused: true, delay: 0.2 });
          msgs.forEach((m) => {
            if (typing) tl.to(typing, { autoAlpha: 1, duration: 0.18 }).to(typing, { autoAlpha: 0, duration: 0.12 }, "+=0.85");
            tl.to(m, { autoAlpha: 1, y: 0, scale: 1, duration: 0.6, ease: "back.out(1.7)", force3D: true }, typing ? "<" : ">0.3");
          });
          ScrollTrigger.create({ trigger: phone, start: "top 72%", once: true, onEnter: () => tl.play() });
        });

        /* reading progress line under the nav */
        gsap.to("[data-progress]", { scaleX: 1, ease: "none", scrollTrigger: { start: 0, end: "max", scrub: 0.3 } });

        return () => {
          gsap.ticker.remove(stepTickers);
          stackSyncs.forEach((fn) => gsap.ticker.remove(fn));
        };
      });

      // big photos are decoded in the background while still a couple of screens away, so they never
      // have to be unpacked in the middle of a scroll frame (the main cause of hitches on slow computers)
      const predecode = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.querySelectorAll("img").forEach((img) => img.decode?.().catch(() => {}));
          predecode.unobserve(entry.target);
        }
      }, { rootMargin: "200% 0px" });
      document.querySelectorAll("[data-stack], [data-ethosb], [data-expand], .panels, .saleb__cards, [data-chat]").forEach((el) => predecode.observe(el));

      // content is hidden by CSS until this point so nothing flashes before it animates
      document.documentElement.dataset.motion = "1";
      return () => {
        predecode.disconnect();
        splits.forEach((s) => s.revert());
      };
    },
    { dependencies: [pathname, tick], revertOnUpdate: true }
  );

  return null;
}
