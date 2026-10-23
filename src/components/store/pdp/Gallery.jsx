"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { WheelGesturesPlugin } from "embla-carousel-wheel-gestures";
import { motion, useMotionValue, useSpring } from "motion/react";
import "photoswipe/style.css";
import { Icon } from "../icons";
import { MORPH_NAME } from "../morph";

/*
  Product photos.
    Embla      the slider: drag / swipe / trackpad, with a parallax drift between photos
    thumbnails a second Embla, vertical on desktop, synced both ways
    PhotoSwipe full-screen viewer with pinch, double-tap and wheel zoom; it opens out of the photo you clicked
  Works the same with one photo (no slider controls) or many.
*/

const EASE = [0.16, 1, 0.3, 1];
const PARALLAX = 0.18; // how far each photo drifts against the drag
// every product photo is stored at the site standard (lib/images.js); used until the real size is known
const STANDARD = { width: 1200, height: 1500 };

/** Moves each slide's photo slightly against the scroll, like the official Embla parallax example. */
function useParallax(api) {
  const layers = useRef([]);
  const factor = useRef(0);

  const tween = useCallback((embla, event) => {
    const engine = embla.internalEngine();
    const progress = embla.scrollProgress();
    const inView = embla.slidesInView();
    const scrolling = event === "scroll"; // Embla passes the event name as a string
    embla.scrollSnapList().forEach((snap, snapIndex) => {
      let diff = snap - progress;
      engine.slideRegistry[snapIndex].forEach((slide) => {
        if (scrolling && !inView.includes(slide)) return;
        if (engine.options.loop) {
          for (const point of engine.slideLooper.loopPoints) {
            const target = point.target();
            if (slide === point.index && target !== 0) {
              diff = Math.sign(target) === -1 ? snap - (1 + progress) : snap + (1 - progress);
            }
          }
        }
        const layer = layers.current[slide];
        if (layer) layer.style.transform = `translate3d(${diff * -factor.current * 100}%, 0, 0)`;
      });
    });
  }, []);

  useEffect(() => {
    if (!api) return;
    const setup = (embla) => {
      layers.current = embla.slideNodes().map((n) => n.querySelector(".pdpg__layer"));
      factor.current = PARALLAX * embla.scrollSnapList().length;
    };
    setup(api);
    tween(api);
    api.on("reInit", setup).on("reInit", tween).on("scroll", tween).on("slideFocus", tween);
    return () => {
      api.off("reInit", setup).off("reInit", tween).off("scroll", tween).off("slideFocus", tween);
    };
  }, [api, tween]);
}

/** `onOpen(i)` replaces the full-screen viewer (the quick view uses it to go to the product page instead). */
export default function Gallery({ images, name, onChange, onOpen, children }) {
  const many = images.length > 1;
  // arriving from a card photo (morph.js): the photo is already flying into place, so skip the opening animation
  const [morph] = useState(() => typeof window !== "undefined" && Boolean(window.__tbaMorph));
  const [selected, setSelected] = useState(0);
  const [hover, setHover] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [mainRef, main] = useEmblaCarousel({ loop: many, duration: 28, watchDrag: many }, many ? [WheelGesturesPlugin()] : []);
  const [thumbRef, thumbs] = useEmblaCarousel({
    containScroll: "keepSnaps", dragFree: true, axis: "x",
    breakpoints: { "(min-width: 1025px)": { axis: "y" } },
  });
  const lightbox = useRef(null);
  const sizes = useRef({}); // real pixel size of each photo once it has loaded
  useParallax(main);

  // the floating "View / Drag" label that follows the pointer on desktop
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const cx = useSpring(x, { stiffness: 420, damping: 38, mass: 0.6 });
  const cy = useSpring(y, { stiffness: 420, damping: 38, mass: 0.6 });
  const move = (e) => {
    const box = e.currentTarget.getBoundingClientRect();
    x.set(e.clientX - box.left);
    y.set(e.clientY - box.top);
  };

  useEffect(() => {
    if (!main) return;
    const onSelect = () => {
      const i = main.selectedScrollSnap();
      setSelected(i);
      onChange?.(i);
      thumbs?.scrollTo(i);
    };
    const down = () => setDragging(true);
    const up = () => setDragging(false);
    onSelect();
    main.on("select", onSelect).on("reInit", onSelect).on("pointerDown", down).on("pointerUp", up).on("settle", up);
    return () => { main.off("select", onSelect).off("reInit", onSelect).off("pointerDown", down).off("pointerUp", up).off("settle", up); };
  }, [main, thumbs]); // eslint-disable-line react-hooks/exhaustive-deps

  // full-screen viewer, loaded only when first opened
  const open = useCallback(async (index) => {
    // (a click that ends a drag never gets here: Embla swallows it)
    if (!lightbox.current) {
      const { default: PhotoSwipeLightbox } = await import("photoswipe/lightbox");
      const lb = new PhotoSwipeLightbox({
        pswpModule: () => import("photoswipe"),
        bgOpacity: 1,
        showHideAnimationType: "zoom",
        initialZoomLevel: "fit",
        secondaryZoomLevel: 2,
        maxZoomLevel: 4,
        wheelToZoom: true,
        padding: { top: 72, bottom: 96, left: 16, right: 16 },
        imageClickAction: "zoom-or-close",
        tapAction: "toggle-controls",
        doubleTapAction: "zoom",
        closeTitle: "Close", zoomTitle: "Zoom", arrowPrevTitle: "Previous photo", arrowNextTitle: "Next photo",
      });
      // open from, and close back into, the photo that is on screen right now
      lb.addFilter("thumbEl", (el, data, i) => mainRef.current?.closest(".pdpg")?.querySelector(`[data-shot="${i}"] img`) || el);
      lb.addFilter("placeholderSrc", (src, slide) => slide.data.msrc || src);
      lb.on("uiRegister", () => {
        lb.pswp.ui.registerElement({
          name: "tba-caption", order: 9, isButton: false, appendTo: "root",
          onInit: (el, pswp) => {
            const update = () => {
              el.innerHTML = `<span>${name.replace(/</g, "&lt;")}</span><b>${String(pswp.currIndex + 1).padStart(2, "0")} / ${String(pswp.getNumItems()).padStart(2, "0")}</b>`;
            };
            pswp.on("change", update);
            update();
          },
        });
      });
      // when the viewer closes, the slider waits on the photo that was last looked at
      lb.on("change", () => main?.scrollTo(lb.pswp.currIndex, true));
      lb.on("openingAnimationStart", () => window.__lenis?.stop());
      lb.on("destroy", () => window.__lenis?.start());
      lb.init();
      lightbox.current = lb;
    }
    lightbox.current.options.dataSource = images.map((im, i) => ({
      src: im.url, msrc: im.thumb, alt: `${name}, photo ${i + 1}`,
      ...(sizes.current[i] || STANDARD),
    }));
    lightbox.current.loadAndOpen(index);
  }, [images, main, mainRef, name]);

  useEffect(() => () => lightbox.current?.destroy(), []);

  const onKey = (e) => {
    if (e.key === "ArrowRight") { e.preventDefault(); main?.scrollNext(); }
    if (e.key === "ArrowLeft") { e.preventDefault(); main?.scrollPrev(); }
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen ? onOpen(selected) : open(selected); }
  };

  if (!images.length) return <div className="pdpg pdpg--empty">{children}</div>;

  return (
    <div className={`pdpg ${many ? "" : "pdpg--single"}`}>
      {many && (
        <div className="pdpg__thumbs" ref={thumbRef}>
          <div className="pdpg__thumbs-track">
            {images.map((im, i) => (
              <button
                key={im.id ?? i} type="button" className={`pdpg__thumb ${i === selected ? "is-on" : ""}`}
                onClick={() => main?.scrollTo(i)} aria-label={`Show photo ${i + 1}`} aria-current={i === selected}
              >
                <img src={im.thumb} alt="" width="120" height="150" loading="lazy" />
              </button>
            ))}
          </div>
        </div>
      )}

      <motion.div
        className={`pdpg__stage ${hover ? "is-hover" : ""} ${dragging ? "is-dragging" : ""}`}
        initial={morph ? false : { clipPath: "inset(0 0 100% 0 round 14px)" }}
        animate={{ clipPath: "inset(0 0 0% 0 round 14px)" }}
        transition={{ duration: 1.1, ease: EASE }}
        onPointerMove={move} onPointerEnter={() => setHover(true)} onPointerLeave={() => setHover(false)}
      >
        <div
          className="pdpg__viewport" ref={mainRef} tabIndex={0} onKeyDown={onKey}
          role="region" aria-roledescription="carousel" aria-label={`${name} photos. Arrow keys change photo, Enter opens full screen.`}
        >
          <div className="pdpg__track">
            {images.map((im, i) => (
              <div className="pdpg__slide" key={im.id ?? i} data-shot={i} role="group" aria-roledescription="slide" aria-label={`${i + 1} of ${images.length}`}>
                <button type="button" className="pdpg__open" onClick={() => (onOpen ? onOpen(i) : open(i))} aria-label={onOpen ? `${name}: full details` : `Open photo ${i + 1} full screen`}>
                  <span className="pdpg__layer">
                    <motion.img
                      src={im.url} alt={`${name}, photo ${i + 1}`} width="1200" height="1500"
                      fetchPriority={i === 0 ? "high" : "auto"} loading={i === 0 ? "eager" : "lazy"} decoding="async" draggable={false}
                      initial={i === 0 && !morph ? { scale: 1.18 } : false}
                      data-morph={morph && i === 0 ? "" : undefined} style={morph && i === 0 ? { viewTransitionName: MORPH_NAME } : undefined} animate={{ scale: 1 }} transition={{ duration: 1.6, ease: EASE }}
                      onLoad={(e) => { sizes.current[i] = { width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight }; }}
                    />
                  </span>
                </button>
              </div>
            ))}
          </div>
        </div>

        {children /* badges laid over the photo */}

        {many && (
          <>
            {/* story-style progress segments (phones) */}
            <div className="pdpg__bars" aria-hidden>
              {images.map((_, i) => <i key={i} className={i === selected ? "is-on" : i < selected ? "is-past" : ""} />)}
            </div>
            <div className="pdpg__nav">
              <button type="button" aria-label="Previous photo" onClick={() => main?.scrollPrev()}><Icon name="arrow" /></button>
              <span aria-live="polite">{String(selected + 1).padStart(2, "0")}<em> / {String(images.length).padStart(2, "0")}</em></span>
              <button type="button" aria-label="Next photo" onClick={() => main?.scrollNext()}><Icon name="arrow" /></button>
            </div>
          </>
        )}
        <span className="pdpg__hint" aria-hidden><Icon name="plus" /> Tap to zoom</span>

        <motion.span className="pdpg__cursor" style={{ x: cx, y: cy }} aria-hidden>
          <span>{dragging ? "Drag" : onOpen ? (many ? "Details · Drag" : "Details") : many ? "View · Drag" : "View"}</span>
        </motion.span>
      </motion.div>
    </div>
  );
}
