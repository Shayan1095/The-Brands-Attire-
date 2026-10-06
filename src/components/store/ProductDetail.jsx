"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { stockAlertAction } from "@/lib/store-actions";
import { useStore } from "./Shell";
import { Icon } from "./icons";
import { variantLabel } from "@/lib/format";

const SIZE_GUIDE = [
  ["XS", "32–34", "26–28"], ["S", "35–37", "29–31"], ["M", "38–40", "32–34"],
  ["L", "41–43", "35–37"], ["XL", "44–46", "38–40"], ["XXL", "47–49", "41–43"],
];
const EASE = [0.16, 1, 0.3, 1];

export default function ProductDetail({ product: p, perks, returns }) {
  const { fmt, add, toast, markViewed } = useStore();
  const [shot, setShot] = useState(0);
  const [variantId, setVariantId] = useState(() => (p.variants.length === 1 && p.variants[0].stock ? p.variants[0].id : null));
  const [qty, setQty] = useState(1);
  const [guide, setGuide] = useState(false);
  const [alert, setAlert] = useState({ contact: "", state: "idle" });
  const [added, setAdded] = useState(false);
  const [barVisible, setBarVisible] = useState(false);
  const mainRef = useRef(null);
  const actionsRef = useRef(null);
  const sizesRef = useRef(null);

  // colours are optional: a product without them shows sizes only
  const colors = [...new Set(p.variants.map((v) => v.color).filter(Boolean))];
  const [color, setColor] = useState(() => colors.find((c) => p.variants.some((v) => v.color === c && v.stock > 0)) || colors[0] || "");
  const sizes = colors.length ? p.variants.filter((v) => v.color === color) : p.variants;
  const variant = p.variants.find((v) => v.id === variantId);
  const soldOutAll = p.variants.every((v) => v.stock === 0);
  const many = p.images.length > 1;

  // remembered for the "Recently viewed" row on the products page
  // (deferred one tick: on a direct page load this effect runs before the shell above has finished mounting)
  useEffect(() => {
    const t = setTimeout(() => markViewed(p.id), 0);
    return () => clearTimeout(t);
  }, [p.id]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const pick = (v) => { setVariantId(v.id); setQty(1); setAlert({ contact: "", state: "idle" }); };
  const step = (dir) => setShot((s) => (s + dir + p.images.length) % p.images.length);

  const addToBag = () => {
    if (!variant) {
      toast("Please select a size");
      sizesRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (!variant.stock) return toast("This size is sold out");
    add({ variantId: variant.id, productId: p.id, slug: p.slug, name: p.name, size: variantLabel(variant), image: p.images[0]?.thumb, price: p.price, max: variant.stock }, qty);
    setAdded(true);
    setTimeout(() => setAdded(false), 1800);
  };

  const requestAlert = async (e) => {
    e.preventDefault();
    setAlert((a) => ({ ...a, state: "sending" }));
    const res = await stockAlertAction(variant.id, alert.contact);
    setAlert((a) => ({ ...a, state: res.ok ? "done" : "idle", error: res.error }));
  };

  // desktop: the photo zooms towards the cursor (CSS reads these two variables)
  const zoom = (e) => {
    const box = mainRef.current.getBoundingClientRect();
    mainRef.current.style.setProperty("--zx", `${((e.clientX - box.left) / box.width) * 100}%`);
    mainRef.current.style.setProperty("--zy", `${((e.clientY - box.top) / box.height) * 100}%`);
  };

  return (
    <div className="pdp">
      <div className="pdp__gallery">
        {many && (
          <div className="pdp__thumbs">
            {p.images.map((im, i) => (
              <button key={im.id ?? i} className={`pdp__thumb ${i === shot ? "active" : ""}`} onClick={() => setShot(i)} aria-label={`Photo ${i + 1}`} aria-pressed={i === shot}>
                <img src={im.thumb} alt="" width="120" height="150" />
              </button>
            ))}
          </div>
        )}
        <div className="pdp__main" ref={mainRef} onMouseMove={zoom} style={many ? undefined : { gridColumn: "1 / -1" }}>
          <AnimatePresence initial={false}>
            <motion.div
              key={shot} className="pdp__shot"
              initial={{ opacity: 0, scale: 1.06 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.6, ease: EASE }}
            >
              {p.images[shot] && <img src={p.images[shot].url} alt={p.name} width="1200" height="1500" fetchPriority="high" />}
            </motion.div>
          </AnimatePresence>
          {p.off > 0 && <span className="card__tag card__tag--sale">−{p.off}%</span>}
          {many && (
            <div className="pdp__nav">
              <button aria-label="Previous photo" onClick={() => step(-1)}><Icon name="arrow" /></button>
              <span>{String(shot + 1).padStart(2, "0")} / {String(p.images.length).padStart(2, "0")}</span>
              <button aria-label="Next photo" onClick={() => step(1)}><Icon name="arrow" /></button>
            </div>
          )}
        </div>
      </div>

      <div className="pdp__info">
        <span className="pdp__cat" data-reveal>{p.category}</span>
        <h1 className="pdp__name" data-split>{p.name}</h1>
        <div className="price pdp__price" data-reveal>
          <span className={p.was ? "sale" : ""}>{fmt(p.price)}</span>
          {p.was && <><s>{fmt(p.was)}</s><span className="pdp__off">Save {p.off}%</span></>}
        </div>
        <p className="pdp__desc" data-reveal>{p.description}</p>

        <div data-reveal ref={sizesRef}>
          {colors.length > 0 && (
            <>
              <div className="pdp__label"><span className="label" style={{ margin: 0 }}>Colour: {color}</span></div>
              <div className="sizes" style={{ marginBottom: 20 }}>
                {colors.map((c) => (
                  <motion.button key={c} whileTap={{ scale: 0.92 }} className={`size ${c === color ? "active" : ""}`} aria-pressed={c === color} onClick={() => { setColor(c); setVariantId(null); setQty(1); }}>
                    {c}
                  </motion.button>
                ))}
              </div>
            </>
          )}
          <div className="pdp__label">
            <span className="label" style={{ margin: 0 }}>{variant ? `Size: ${variant.size}` : "Select size"}</span>
            <button onClick={() => setGuide(true)}>Size guide</button>
          </div>
          <div className="sizes">
            {sizes.map((v) => (
              <motion.button
                key={v.id} whileTap={{ scale: 0.92 }}
                className={`size ${v.id === variantId ? "active" : ""} ${v.stock ? "" : "out"}`} onClick={() => pick(v)} aria-pressed={v.id === variantId}
              >
                {v.size}
              </motion.button>
            ))}
          </div>
          <p className={`stock-note ${variant?.stock ? (variant.stock <= p.lowAt ? "low" : "in") : ""}`}>
            {soldOutAll ? "Sold out. Pick your size to get a back-in-stock alert."
              : !variant ? ""
              : variant.stock === 0 ? "This size is sold out"
              : variant.stock <= p.lowAt ? `Hurry, only ${variant.stock} left`
              : "In stock, ready to ship"}
          </p>
        </div>

        <div data-reveal ref={actionsRef}>
          {variant && variant.stock === 0 ? (
            <div className="notify">
              {alert.state === "done" ? (
                <p className="form-ok">Done. We will message you the moment size {variant.size} is back.</p>
              ) : (
                <>
                  <b>Want size {variant.size}?</b>
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
            <div className="pdp__actions">
              <div className="qty">
                <button aria-label="Decrease quantity" onClick={() => setQty((q) => Math.max(1, q - 1))}>−</button>
                <span aria-live="polite">{qty}</span>
                <button aria-label="Increase quantity" onClick={() => setQty((q) => Math.min(variant?.stock || 10, q + 1))}>+</button>
              </div>
              <motion.button className={`btn ${added ? "btn--added" : ""}`} whileTap={{ scale: 0.97 }} onClick={addToBag} disabled={soldOutAll}>
                <AnimatePresence mode="wait" initial={false}>
                  <motion.span key={added ? "done" : "add"} initial={{ y: 14, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -14, opacity: 0 }} transition={{ duration: 0.2 }}>
                    {soldOutAll ? "Sold out" : added ? "Added to bag ✓" : <>Add to bag · {fmt(p.price * qty)}</>}
                  </motion.span>
                </AnimatePresence>
              </motion.button>
            </div>
          )}
        </div>

        <ul className="pdp__perks" data-reveal>
          {perks.map((t) => <li key={t}><Icon name="check" />{t}</li>)}
        </ul>

        <div data-reveal>
          {(p.fabric || p.care || p.origin) && (
            <details className="acc" open>
              <summary>Fabric &amp; care</summary>
              <div>
                <ul>
                  {p.fabric && <li><strong>Fabric:</strong> {p.fabric}</li>}
                  {p.care && <li><strong>Care:</strong> {p.care}</li>}
                  {p.origin && <li><strong>Origin:</strong> {p.origin}</li>}
                </ul>
              </div>
            </details>
          )}
          <details className="acc">
            <summary>Delivery &amp; returns</summary>
            <div>{returns}</div>
          </details>
        </div>
      </div>

      <AnimatePresence>
        {barVisible && !soldOutAll && (
          <motion.div className="buybar" initial={{ y: "110%" }} animate={{ y: 0 }} exit={{ y: "110%" }} transition={{ type: "spring", stiffness: 380, damping: 36 }}>
            <div className="wrap buybar__inner">
              {p.images[0] && <img src={p.images[0].thumb} alt="" width="48" height="60" />}
              <div className="buybar__text">
                <b>{p.name}</b>
                <span>{variant ? variantLabel(variant) : "Select a size"} · {fmt(p.price)}</span>
              </div>
              <button className="btn" onClick={addToBag}>{added ? "Added ✓" : variant ? "Add to bag" : "Choose size"}</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {guide && (
          <motion.div
            className="modal" role="dialog" aria-modal="true" aria-label="Size guide" data-lenis-prevent
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={(e) => e.target === e.currentTarget && setGuide(false)}
          >
            <motion.div className="modal__box" initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }} transition={{ duration: 0.35, ease: EASE }}>
              <div className="modal__head">
                <h3>Size guide</h3>
                <button className="icon-btn" aria-label="Close" onClick={() => setGuide(false)}><Icon name="close" /></button>
              </div>
              <table className="table">
                <thead><tr><th>Size</th><th>Chest (in)</th><th>Waist (in)</th></tr></thead>
                <tbody>{SIZE_GUIDE.map(([s, c, w]) => <tr key={s}><td>{s}</td><td>{c}</td><td>{w}</td></tr>)}</tbody>
              </table>
              <p className="fine" style={{ marginTop: 16 }}>For jeans and trousers the size is the waist in inches. Between sizes? Size down for a fitted look, up for relaxed.</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
