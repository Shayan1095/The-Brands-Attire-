"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { stockAlertAction } from "@/lib/store-actions";
import { variantLabel, waLink } from "@/lib/format";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import Counter from "@/components/bits/Counter/Counter";
import ShinyText from "@/components/bits/ShinyText/ShinyText";
import Magnet from "@/components/bits/Magnet/Magnet";
import Gallery from "./pdp/Gallery";
import { flyToBag } from "./flyToBag";
import { arrival } from "./arrival";
import { useStore } from "./Shell";
import { Icon } from "./icons";

const SIZE_GUIDE = [
  ["XS", "32–34", "26–28"], ["S", "35–37", "29–31"], ["M", "38–40", "32–34"],
  ["L", "41–43", "35–37"], ["XL", "44–46", "38–40"], ["XXL", "47–49", "41–43"],
];
const EASE = [0.16, 1, 0.3, 1];


const rise = {
  hidden: { opacity: 0, y: 26 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: EASE } },
};

export default function ProductDetail({ product: p, shipping, returns, url }) {
  const { fmt, add, toast, markViewed, wish, toggleWish, openCart, store } = useStore();
  const [shot, setShot] = useState(0);
  const [variantId, setVariantId] = useState(() => (p.variants.length === 1 && p.variants[0].stock ? p.variants[0].id : null));
  const [qty, setQty] = useState(1);
  const [guide, setGuide] = useState(false);
  const [alert, setAlert] = useState({ contact: "", state: "idle" });
  const [added, setAdded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [barVisible, setBarVisible] = useState(false);
  const [eta, setEta] = useState(null);
  const actionsRef = useRef(null);
  const sizesRef = useRef(null);
  const barImg = useRef(null);

  // colours are optional: a product without them shows sizes only
  const colors = useMemo(() => [...new Set(p.variants.map((v) => v.color).filter(Boolean))], [p.variants]);
  const [color, setColor] = useState(() => colors.find((c) => p.variants.some((v) => v.color === c && v.stock > 0)) || colors[0] || "");
  const sizes = colors.length ? p.variants.filter((v) => v.color === color) : p.variants;
  const variant = p.variants.find((v) => v.id === variantId);
  const soldOutAll = p.variants.every((v) => v.stock === 0);
  const wished = wish.includes(p.id);
  const total = p.price * qty;
  const toFree = shipping.freeOver > 0 ? shipping.freeOver - total : 0;

  // remembered for the "Recently viewed" rows
  // (deferred one tick: on a direct page load this effect runs before the shell above has finished mounting)
  useEffect(() => {
    const t = setTimeout(() => markViewed(p.id), 0);
    return () => clearTimeout(t);
  }, [p.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // the dates depend on today, so they are worked out in the browser (no mismatch with the server's clock)
  useEffect(() => setEta(arrival(shipping.eta)), [shipping.eta]);

  // floating buy bar: appears once the main button has scrolled out of view
  useEffect(() => {
    const el = actionsRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setBarVisible(!entry.isIntersecting && entry.boundingClientRect.top < 0));
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    document.body.classList.toggle("has-buybar", barVisible);
    return () => document.body.classList.remove("has-buybar");
  }, [barVisible]);

  // smooth scrolling pauses while the size guide is open, so the guide itself scrolls
  useEffect(() => {
    if (guide) window.__lenis?.stop(); else window.__lenis?.start();
  }, [guide]);

  const pick = (v) => { setVariantId(v.id); setQty(1); setAlert({ contact: "", state: "idle" }); };

  const addToBag = async (from, button = null) => {
    if (!variant) {
      toast("Please select a size");
      sizesRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      sizesRef.current?.animate([{ translate: "0" }, { translate: "-8px" }, { translate: "8px" }, { translate: "-4px" }, { translate: "0" }], { duration: 380 });
      return;
    }
    if (!variant.stock) return toast("This size is sold out");
    if (busy) return;
    setBusy(true);
    add({ variantId: variant.id, productId: p.id, slug: p.slug, name: p.name, size: variantLabel(variant), image: p.images[0]?.thumb, price: p.price, max: variant.stock }, qty, { open: false });
    setAdded(true);
    const img = from === "bar" ? barImg.current : document.querySelector(`.pdpg [data-shot="${shot}"] img`) || document.querySelector(".pdpg img");
    navigator.vibrate?.(12);
    await flyToBag(img, { from: button, thumb: p.images[0]?.thumb });
    openCart();
    setBusy(false);
    setTimeout(() => setAdded(false), 1600);
  };

  const requestAlert = async (e) => {
    e.preventDefault();
    setAlert((a) => ({ ...a, state: "sending" }));
    const res = await stockAlertAction(variant.id, alert.contact);
    setAlert((a) => ({ ...a, state: res.ok ? "done" : "idle", error: res.error }));
  };

  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: p.name, url });
      else { await navigator.clipboard.writeText(url); toast("Link copied"); }
    } catch {}
  };

  const stockNote =
    soldOutAll ? ["", "Sold out. Pick your size to get a back-in-stock alert."]
    : !variant ? ["", ""]
    : variant.stock === 0 ? ["out", "This size is sold out"]
    : variant.stock <= p.lowAt ? ["low", `Hurry, only ${variant.stock} left in ${variantLabel(variant)}`]
    : ["in", "In stock, ready to ship"];

  return (
    <div className="pdp2">
      <Gallery images={p.images} name={p.name} onChange={setShot}>
        <div className="pdpg__badges">
          {p.off > 0 && <span className="pdp-badge pdp-badge--sale">−{p.off}%</span>}
          {p.badge && <span className="pdp-badge">{p.badge}</span>}
        </div>
      </Gallery>

      <motion.div className="pdpi" initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.07, delayChildren: 0.15 } } }}>
        <motion.div className="pdpi__top" variants={rise}>
          {p.categorySlug ? <Link href={`/products?category=${p.categorySlug}`} className="pdpi__cat">{p.category}</Link> : <span className="pdpi__cat">{p.category}</span>}
          {p.type && <span className="pdpi__type">{p.type}</span>}
        </motion.div>

        <h1 className="pdpi__name" data-split>{p.name}</h1>

        <motion.div className="pdpi__price" variants={rise}>
          <Counter
            value={p.price} prefix={`${store.currency} `} fontSize="inherit" fontWeight="inherit"
            duration={0.9} stagger={0.05} className={p.was ? "is-sale" : ""}
          />
          {p.was && (
            <>
              <s>{fmt(p.was)}</s>
              <span className="pdpi__save"><ShinyText text={`Save ${p.off}%`} color="#ffffff" shineColor="#ffd9d6" speed={2.6} /></span>
            </>
          )}
        </motion.div>

        <motion.p className="pdpi__lede" variants={rise}>{p.description}</motion.p>

        <motion.div variants={rise} ref={sizesRef} className="pdpi__pick">
          {colors.length > 0 && (
            <div className="pdpi__group">
              <div className="pdpi__label"><span>Colour <b>{color}</b></span></div>
              <div className="swatches" role="radiogroup" aria-label="Colour">
                {colors.map((c) => {
                  const open = p.variants.some((v) => v.color === c && v.stock > 0);
                  return (
                    <button
                      key={c} type="button" role="radio" aria-checked={c === color} aria-label={c} title={open ? c : `${c} (sold out)`}
                      className={`swatch ${c === color ? "is-on" : ""} ${open ? "" : "is-out"}`}
                      onClick={() => { setColor(c); setVariantId(null); setQty(1); }}
                    >
                      <i style={{ "--sw": c.toLowerCase().replace(/\s+/g, "") }} />
                      {c === color && <motion.span layoutId={`swatch-ring-${p.id}`} className="swatch__ring" transition={{ type: "spring", stiffness: 500, damping: 34 }} />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="pdpi__group">
            <div className="pdpi__label">
              <span>{variant ? <>Size <b>{variant.size}</b></> : "Select a size"}</span>
              <button type="button" className="pdpi__guide" onClick={() => setGuide(true)}><Icon name="rows" /> Size guide</button>
            </div>
            {p.fitNote && <p className="pdpi__fit"><Icon name="star" /><span><b>Fit tip</b> {p.fitNote}</span></p>}
            <div className="sizes2" role="radiogroup" aria-label="Size">
              {sizes.map((v) => {
                const on = v.id === variantId;
                const low = v.stock > 0 && v.stock <= p.lowAt;
                return (
                  <button
                    key={v.id} type="button" role="radio" aria-checked={on}
                    className={`size2 ${on ? "is-on" : ""} ${v.stock ? "" : "is-out"}`}
                    onClick={() => pick(v)} title={v.stock ? (low ? `Only ${v.stock} left` : "In stock") : "Sold out: tap for an alert"}
                  >
                    {on && <motion.span layoutId={`size-pill-${p.id}`} className="size2__pill" transition={{ type: "spring", stiffness: 520, damping: 38 }} />}
                    <span className="size2__label">{v.size}</span>
                    {low && <i className="size2__low" aria-label="Low stock" />}
                  </button>
                );
              })}
            </div>
          </div>

          <AnimatePresence mode="wait" initial={false}>
            <motion.p
              key={stockNote[1]} className={`pdpi__stock ${stockNote[0]}`}
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.25 }}
            >
              {stockNote[1] && <i aria-hidden />}{stockNote[1]}
            </motion.p>
          </AnimatePresence>
        </motion.div>

        <motion.div variants={rise} ref={actionsRef}>
          {variant && variant.stock === 0 ? (
            <div className="notify">
              {alert.state === "done" ? (
                <p className="form-ok">Done. We will message you the moment size {variantLabel(variant)} is back.</p>
              ) : (
                <>
                  <b>Want {variantLabel(variant)}?</b>
                  <p className="fine">Leave your email or WhatsApp number and we will tell you when it is back.</p>
                  <form onSubmit={requestAlert}>
                    <input className="input" required value={alert.contact} onChange={(e) => setAlert({ contact: e.target.value, state: "idle" })} placeholder="Email or WhatsApp number" aria-label="Email or WhatsApp number" />
                    <button className="btn" disabled={alert.state === "sending"}>Notify me</button>
                  </form>
                  {alert.error && <p className="fine" style={{ color: "var(--signal)", marginTop: 8 }}>{alert.error}</p>}
                </>
              )}
            </div>
          ) : (
            <div className="pdpi__buy">
              <div className="qty">
                <button type="button" aria-label="Decrease quantity" onClick={() => setQty((q) => Math.max(1, q - 1))}>−</button>
                <span aria-live="polite">{qty}</span>
                <button type="button" aria-label="Increase quantity" onClick={() => setQty((q) => Math.min(variant?.stock || 10, q + 1))}>+</button>
              </div>
              <Magnet padding={40} magnetStrength={6} wrapperClassName="pdpi__magnet" innerClassName="pdpi__magnet-inner" disabled={soldOutAll} style={{ display: "flex", flex: 1 }}>
                <button type="button" className={`btn pdpi__add ${added ? "is-added" : ""}`} onClick={(e) => addToBag("page", e.currentTarget)} disabled={soldOutAll}>
                  <AnimatePresence mode="wait" initial={false}>
                    {soldOutAll ? (
                      <motion.span key="out">Sold out</motion.span>
                    ) : added ? (
                      <motion.span key="done" initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -16, opacity: 0 }}><Icon name="check" /> Added to bag</motion.span>
                    ) : (
                      <motion.span key="add" className="pdpi__add-label" initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -16, opacity: 0 }}>
                        <Icon name="bag" /> Add to bag <em aria-hidden>·</em>
                        <Counter value={total} prefix={`${store.currency} `} fontSize="inherit" intro={false} duration={0.6} />
                      </motion.span>
                    )}
                  </AnimatePresence>
                </button>
              </Magnet>
              <motion.button
                type="button" className={`pdpi__wish ${wished ? "is-on" : ""}`} whileTap={{ scale: 0.82 }}
                aria-label={wished ? "Remove from saved" : "Save for later"} aria-pressed={wished}
                onClick={() => { toggleWish(p.id); toast(wished ? "Removed from saved" : "Saved for later"); }}
              >
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.span key={wished ? "on" : "off"} initial={{ scale: 0.3, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.3, opacity: 0 }} transition={{ type: "spring", stiffness: 600, damping: 22 }}>
                    <Icon name="heart" />
                  </motion.span>
                </AnimatePresence>
              </motion.button>
            </div>
          )}
        </motion.div>

        <motion.div className="pdpi__ship" variants={rise}>
          <div className="pdpi__ship-row">
            <span className="pdpi__ship-icon"><Icon name="truck" /></span>
            <div>
              <b>{eta ? <>Arrives {eta}</> : <>Delivery in {shipping.eta}</>}</b>
              <span>Order today · cash on delivery · confirm by WhatsApp first</span>
            </div>
          </div>
          {shipping.freeOver > 0 && (
            <div className="pdpi__free">
              <span>{toFree > 0 ? <>{fmt(toFree)} away from free delivery</> : <>Free delivery on this order <Icon name="check" /></>}</span>
              <i><motion.b initial={false} animate={{ scaleX: Math.min(1, total / shipping.freeOver) }} transition={{ duration: 0.8, ease: EASE }} /></i>
            </div>
          )}
          <div className="pdpi__ship-row pdpi__ship-row--small">
            <span className="pdpi__ship-icon"><Icon name="refresh" /></span>
            <div><b>Easy exchanges</b><span>Swap the size within the exchange window if it does not fit.</span></div>
          </div>
        </motion.div>

        <motion.div className="pdpi__help" variants={rise}>
          {store.whatsapp && (
            <a href={waLink(store.whatsapp, `Hi, I have a question about ${p.name}: ${url}`)} target="_blank" rel="noopener noreferrer">
              <Icon name="whatsapp" /> Ask about this piece
            </a>
          )}
          <button type="button" onClick={share}><Icon name="share" /> Share</button>
        </motion.div>

        <motion.div variants={rise}>
          <Accordion type="single" collapsible defaultValue={p.fabric || p.care ? "fabric" : "delivery"} className="pdpacc">
            {(p.fabric || p.care || p.origin) && (
              <AccordionItem value="fabric">
                <AccordionTrigger>Fabric &amp; care</AccordionTrigger>
                <AccordionContent>
                  <dl className="pdpacc__specs">
                    {p.fabric && <><dt>Fabric</dt><dd>{p.fabric}</dd></>}
                    {p.care && <><dt>Care</dt><dd>{p.care}</dd></>}
                    {p.origin && <><dt>Made in</dt><dd>{p.origin}</dd></>}
                  </dl>
                </AccordionContent>
              </AccordionItem>
            )}
            <AccordionItem value="fit">
              <AccordionTrigger>Size &amp; fit</AccordionTrigger>
              <AccordionContent>
                <p>Between sizes? Size down for a fitted look, up for relaxed. For jeans and trousers the size is the waist in inches.</p>
                <button type="button" className="pdpi__guide" onClick={() => setGuide(true)}><Icon name="rows" /> Open the size guide</button>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="delivery">
              <AccordionTrigger>Delivery &amp; exchanges</AccordionTrigger>
              <AccordionContent>
                <p>Delivered in {shipping.eta} anywhere in the country. Pay the rider in cash when it arrives.</p>
                <p>{returns}</p>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </motion.div>
      </motion.div>

      <Dialog open={guide} onOpenChange={setGuide}>
        <DialogContent className="sizeguide" data-lenis-prevent>
          <DialogTitle className="sizeguide__title">Size guide</DialogTitle>
          <DialogDescription className="sizeguide__sub">Body measurements in inches. Measure over a light layer.</DialogDescription>
          <table className="sizeguide__table">
            <thead><tr><th>Size</th><th>Chest</th><th>Waist</th></tr></thead>
            <tbody>
              {SIZE_GUIDE.map(([s, c, w]) => (
                <tr key={s} className={variant?.size === s ? "is-on" : ""}><td>{s}</td><td>{c}</td><td>{w}</td></tr>
              ))}
            </tbody>
          </table>
          <ol className="sizeguide__how">
            <li><b>Chest</b> Around the fullest part, under the arms.</li>
            <li><b>Waist</b> Around your natural waistline, where you wear your trousers.</li>
          </ol>
          <p className="fine">Still unsure? Message us on WhatsApp with your height and usual size and we will advise.</p>
        </DialogContent>
      </Dialog>

      <AnimatePresence>
        {barVisible && !soldOutAll && (
          <motion.div className="buybar" initial={{ y: "110%" }} animate={{ y: 0 }} exit={{ y: "110%" }} transition={{ type: "spring", stiffness: 380, damping: 36 }}>
            <div className="wrap buybar__inner">
              {p.images[0] && <img ref={barImg} src={p.images[0].thumb} alt="" width="48" height="60" />}
              <div className="buybar__text">
                <b>{p.name}</b>
                <span>{variant ? variantLabel(variant) : "Select a size"} · {fmt(total)}</span>
              </div>
              <button className="btn" onClick={(e) => (variant ? addToBag("bar", e.currentTarget) : addToBag())}>{added ? "Added ✓" : variant ? "Add to bag" : "Choose size"}</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
