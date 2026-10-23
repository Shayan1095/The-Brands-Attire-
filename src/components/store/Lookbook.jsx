"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { motion } from "motion/react";
import "photoswipe/style.css";
import Masonry from "@/components/bits/Masonry/Masonry";
import { variantLabel } from "@/lib/format";
import { useStore } from "./Shell";
import { Icon } from "./icons";
import CategoryIcon from "../CategoryIcon";
import { jumpTo } from "./gallery/ChapterIndex";

/*
  The gallery's chapters.
    Masonry (React Bits)  each chapter as a masonry wall; tiles arrive in a staggered wave
    PhotoSwipe            full-screen viewer with pinch / double-tap / wheel zoom
    Shop panel            a React panel living inside PhotoSwipe: size, stock, add to bag
  Every look has its own address (?look=12) so it can be shared on WhatsApp.

  chapters = [{ slug, name, description, icon, href, pieces, frames: [{ n, image, product }] }]
*/

// tile heights repeat in this rhythm (for a 1200-wide tile) so walls of same-shape photos still look editorial
const RHYTHM = [1500, 1220, 1780, 1380, 1640, 1260];
const STANDARD = { width: 1200, height: 1500 }; // every product photo is stored at this size (lib/images.js)

function ShopPanel({ frame, total, close }) {
  const { fmt, add, toast, store } = useStore();
  const p = frame.product;
  const [variantId, setVariantId] = useState(() => (p.variants.length === 1 && p.variants[0].stock ? p.variants[0].id : null));
  const [added, setAdded] = useState(false);
  const variant = p.variants.find((v) => v.id === variantId);
  const soldOut = p.variants.every((v) => v.stock === 0);

  useEffect(() => { setVariantId(p.variants.length === 1 && p.variants[0].stock ? p.variants[0].id : null); setAdded(false); }, [p.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const addToBag = () => {
    if (!variant) return toast("Pick a size first");
    add({ variantId: variant.id, productId: p.id, slug: p.slug, name: p.name, size: variantLabel(variant), image: p.images[0]?.thumb, price: p.price, max: variant.stock }, 1, { open: false });
    setAdded(true);
    toast(`${p.name} (${variantLabel(variant)}) added to your bag`);
  };

  return (
    <motion.div className="gshop" key={p.id} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}>
      <span className="gshop__look">Look {String(frame.n + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}</span>
      <span className="gshop__cat">{p.category}</span>
      <h3 className="gshop__name">{p.name}</h3>
      <p className="gshop__price">
        <b className={p.was ? "is-sale" : ""}>{fmt(p.price)}</b>
        {p.was && <s>{fmt(p.was)}</s>}
        {p.off > 0 && <em>−{p.off}%</em>}
      </p>
      {p.desc && <p className="gshop__desc">{p.desc}</p>}

      {!soldOut && (
        <div className="gshop__sizes" role="radiogroup" aria-label="Size">
          {p.variants.map((v) => (
            <button
              key={v.id} type="button" role="radio" aria-checked={v.id === variantId} disabled={!v.stock}
              className={`gshop__size ${v.id === variantId ? "is-on" : ""}`} onClick={() => { setVariantId(v.id); setAdded(false); }}
              title={v.stock ? (v.stock <= 3 ? `Only ${v.stock} left` : "In stock") : "Sold out"}
            >
              {variantLabel(v)}
            </button>
          ))}
        </div>
      )}

      <div className="gshop__actions">
        {soldOut ? (
          <Link href={`/products/${p.slug}`} className="btn btn--light" onClick={close}>Sold out: get an alert</Link>
        ) : (
          <button type="button" className={`btn ${added ? "is-added" : ""}`} onClick={addToBag}>
            {added ? <><Icon name="check" /> Added</> : <><Icon name="bag" /> Add to bag</>}
          </button>
        )}
        <Link href={`/products/${p.slug}`} className="gshop__link" onClick={close}>Full details <Icon name="arrow" /></Link>
      </div>
      <p className="gshop__fine">Cash on delivery · {store.shipping?.eta ? `Delivery in ${store.shipping.eta}` : "Nationwide delivery"}</p>
    </motion.div>
  );
}

export default function Lookbook({ chapters }) {
  const { fmt } = useStore();
  const frames = useMemo(() => chapters.flatMap((c) => c.frames), [chapters]);
  const [active, setActive] = useState(chapters[0]?.slug);
  const [lite, setLite] = useState(false);
  const [panel, setPanel] = useState(null); // the DOM node PhotoSwipe gives the shop panel
  const [index, setIndex] = useState(0);
  const lightbox = useRef(null);
  const sizes = useRef({});

  // phones get two narrow masonry columns instead of one very long one
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    setLite(document.documentElement.dataset.lite === "1");
    const mq = window.matchMedia("(max-width: 640px)");
    const sync = () => setNarrow(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  // highlight the chapter being read in the sticky bar
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && setActive(e.target.dataset.chapter)),
      { rootMargin: "-45% 0px -50% 0px" }
    );
    document.querySelectorAll("[data-chapter]").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  const open = useCallback(async (n) => {
    if (!lightbox.current) {
      const { default: PhotoSwipeLightbox } = await import("photoswipe/lightbox");
      const lb = new PhotoSwipeLightbox({
        pswpModule: () => import("photoswipe"),
        bgOpacity: 1, showHideAnimationType: "zoom",
        initialZoomLevel: "fit", secondaryZoomLevel: 2, maxZoomLevel: 4, wheelToZoom: true,
        imageClickAction: "zoom-or-close", tapAction: "toggle-controls", doubleTapAction: "zoom",
        // on wide screens the photo keeps clear of the shop panel on the right
        paddingFn: (viewport) => (viewport.x >= 1000 ? { top: 40, bottom: 40, left: 40, right: 440 } : { top: 56, bottom: 250, left: 0, right: 0 }),
        closeTitle: "Close", zoomTitle: "Zoom", arrowPrevTitle: "Previous look", arrowNextTitle: "Next look",
      });
      // open from, and close back into, the tile on the page
      lb.addFilter("thumbEl", (el, data) => document.querySelector(`.lookbook img[src="${CSS.escape(data.msrc)}"]`) || el);
      lb.addFilter("placeholderSrc", (src, slide) => slide.data.msrc || src);
      lb.on("uiRegister", () => {
        lb.pswp.ui.registerElement({
          name: "shop", order: 9, isButton: false, appendTo: "root",
          onInit: (el, pswp) => {
            setPanel(el);
            const sync = () => {
              setIndex(pswp.currIndex);
              window.history.replaceState(null, "", `${window.location.pathname}?look=${pswp.currIndex + 1}`);
            };
            pswp.on("change", sync);
            sync();
          },
        });
      });
      lb.on("openingAnimationStart", () => window.__lenis?.stop());
      lb.on("destroy", () => {
        window.__lenis?.start();
        setPanel(null);
        window.history.replaceState(null, "", window.location.pathname);
      });
      lb.init();
      lightbox.current = lb;
    }
    lightbox.current.options.dataSource = frames.map((f) => ({
      src: f.image.url, msrc: f.image.thumb, alt: f.product.name, ...(sizes.current[f.n] || STANDARD),
    }));
    lightbox.current.loadAndOpen(n);
  }, [frames]);

  useEffect(() => () => lightbox.current?.destroy(), []);

  // a shared link (?look=12) opens straight on that look
  useEffect(() => {
    const look = Number(new URLSearchParams(window.location.search).get("look"));
    if (look >= 1 && look <= frames.length) setTimeout(() => open(look - 1), 600);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="lookbook" data-showcase="gallery">
      {/* sticky chapter bar */}
      {chapters.length > 1 && (
        <div className="catbar">
          <div className="wrap catbar__inner">
            <div className="rail">
              <div className="rail__scroll" data-lenis-prevent>
                {chapters.map((c, i) => (
                  <button key={c.slug} className={`rail__item ${active === c.slug ? "active" : ""}`} onClick={() => jumpTo(c.slug)}>
                    <span className="rail__thumb"><CategoryIcon name={c.name} icon={c.icon} /></span>
                    <span className="rail__text"><b>{c.name}</b><small>Chapter {String(i + 1).padStart(2, "0")}</small></span>
                    {active === c.slug && <motion.span layoutId="chapter-line" className="rail__line" transition={{ type: "spring", stiffness: 420, damping: 38 }} />}
                  </button>
                ))}
              </div>
            </div>
            <div className="catbar__tools">
              <span className="catbar__count"><b>{frames.length}</b> frames</span>
              <Link href="/products" className="tool"><span>Shop all</span> <Icon name="arrow" /></Link>
            </div>
          </div>
        </div>
      )}

      {chapters.map((c, ci) => {
        const next = chapters[ci + 1];
        const items = c.frames.map((f, i) => ({
          id: f.n, img: f.image.thumb, width: 1200, height: RHYTHM[(f.n + ci) % RHYTHM.length],
          title: f.product.name, description: `${f.product.category || ""} · ${fmt(f.product.price)}`, alt: f.product.name,
        }));
        return (
          <section key={c.slug} className="section chapter" id={`chapter-${c.slug}`} data-chapter={c.slug}>
            <div className="wrap">
              <header className="chapter__head2">
                <span className="chapter__num" aria-hidden>{String(ci + 1).padStart(2, "0")}</span>
                <div className="chapter__title">
                  <span className="eyebrow" data-reveal>Chapter {String(ci + 1).padStart(2, "0")} / {String(chapters.length).padStart(2, "0")}</span>
                  <h2 className="display" data-split>{c.name}</h2>
                </div>
                <div className="chapter__side" data-reveal>
                  <p>{c.description || "A closer look at the pieces, the cloth and the cut."}</p>
                  <Link href={c.href} className="link-arrow">Shop {c.name} · {c.pieces} {c.pieces === 1 ? "piece" : "pieces"}</Link>
                </div>
              </header>

              <Masonry
                items={items}
                columns={narrow ? 2 : "auto"} columnWidth={300} gap={narrow ? 10 : 16} radius={narrow ? 10 : 14}
                animateFrom="bottom" stagger={0.06} duration={0.7} bounce={0.12}
                blurToFocus={!lite} revealOnScroll hoverEffect={lite ? "none" : "lift"} captions="hover"
                parallax={0} lightbox={false} draggable={false}
                onItemClick={(item, i, e) => { e.preventDefault(); open(item.id); }}
              />

              {next && (
                <button type="button" className="nextch" onClick={() => jumpTo(next.slug)} data-reveal>
                  {next.frames[0] && <span className="nextch__img"><img src={next.frames[0].image.thumb} alt="" loading="lazy" decoding="async" /></span>}
                  <span className="nextch__text">
                    <small>Next · Chapter {String(ci + 2).padStart(2, "0")}</small>
                    <b>{next.name}</b>
                  </span>
                  <span className="nextch__go" aria-hidden><Icon name="arrow" /></span>
                </button>
              )}
            </div>
          </section>
        );
      })}

      {panel && frames[index] && createPortal(<ShopPanel frame={frames[index]} total={frames.length} close={() => lightbox.current?.pswp?.close()} />, panel)}
    </div>
  );
}
