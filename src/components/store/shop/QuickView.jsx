"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { variantLabel } from "@/lib/format";
import Gallery from "../pdp/Gallery";
import { flyToBag } from "../flyToBag";
import { useStore } from "../Shell";
import { Icon } from "../icons";

const EASE = [0.16, 1, 0.3, 1];

/** The buying half of the quick view. Remounted per product, so its choices start fresh. */
function Buy({ p, done }) {
  const { fmt, add, toast, wish, toggleWish, openCart, store } = useStore();
  const colors = useMemo(() => [...new Set(p.variants.map((v) => v.color).filter(Boolean))], [p.variants]);
  const [color, setColor] = useState(() => colors.find((c) => p.variants.some((v) => v.color === c && v.stock > 0)) || colors[0] || "");
  const sizes = colors.length ? p.variants.filter((v) => v.color === color) : p.variants;
  const [variantId, setVariantId] = useState(() => (sizes.length === 1 && sizes[0].stock ? sizes[0].id : null));
  const [busy, setBusy] = useState(false);
  const sizesRef = useRef(null);
  const variant = p.variants.find((v) => v.id === variantId);
  const wished = wish.includes(p.id);
  const lowAt = p.lowAt ?? 3;

  const addToBag = async () => {
    if (!variant) {
      sizesRef.current?.animate([{ translate: "0" }, { translate: "-8px" }, { translate: "8px" }, { translate: "-4px" }, { translate: "0" }], { duration: 380 });
      return toast("Please select a size");
    }
    if (busy) return;
    setBusy(true);
    add({ variantId: variant.id, productId: p.id, slug: p.slug, name: p.name, size: variantLabel(variant), image: p.images[0]?.thumb, price: p.price, max: variant.stock }, 1, { open: false });
    await flyToBag(document.querySelector(".qv .pdpg__slide img"), { thumb: p.images[0]?.thumb });
    done();
    openCart();
  };

  const note =
    p.soldOut ? ["out", "Sold out in every size. Open the full details for a back-in-stock alert."]
    : !variant ? ["", ""]
    : variant.stock <= lowAt ? ["low", `Only ${variant.stock} left in ${variantLabel(variant)}`]
    : ["in", "In stock, ready to ship"];

  return (
    <motion.div className="qv__info" initial={{ opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5, ease: EASE }}>
      <div className="qv__top">
        <span className="qv__cat">{p.category}</span>
        {p.badge && <span className="qv__badge">{p.badge}</span>}
      </div>
      <DialogTitle className="qv__name">{p.name}</DialogTitle>
      <p className="qv__price">
        <b className={p.was ? "is-sale" : ""}>{fmt(p.price)}</b>
        {p.was && <s>{fmt(p.was)}</s>}
        {p.off > 0 && <em>Save {p.off}%</em>}
      </p>
      <DialogDescription className="qv__desc">{p.desc || "Cut, sewn and checked by hand."}</DialogDescription>

      {!p.soldOut && (
        <div className="qv__pick" ref={sizesRef}>
          {colors.length > 0 && (
            <div className="qv__group">
              <span className="qv__label">Colour <b>{color}</b></span>
              <div className="swatches" role="radiogroup" aria-label="Colour">
                {colors.map((c) => {
                  const open = p.variants.some((v) => v.color === c && v.stock > 0);
                  return (
                    <button
                      key={c} type="button" role="radio" aria-checked={c === color} aria-label={c} title={open ? c : `${c} (sold out)`}
                      className={`swatch ${c === color ? "is-on" : ""} ${open ? "" : "is-out"}`} onClick={() => { setColor(c); setVariantId(null); }}
                    >
                      <i style={{ "--sw": c.toLowerCase().replace(/\s+/g, "") }} />
                      {c === color && <motion.span layoutId="qv-swatch" className="swatch__ring" transition={{ type: "spring", stiffness: 500, damping: 34 }} />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <div className="qv__group">
            <span className="qv__label">{variant ? <>Size <b>{variant.size}</b></> : "Select a size"}</span>
            <div className="sizes2" role="radiogroup" aria-label="Size">
              {sizes.map((v) => {
                const on = v.id === variantId;
                return (
                  <button
                    key={v.id} type="button" role="radio" aria-checked={on} disabled={!v.stock}
                    className={`size2 ${on ? "is-on" : ""} ${v.stock ? "" : "is-out"}`} onClick={() => setVariantId(v.id)}
                    title={v.stock ? (v.stock <= lowAt ? `Only ${v.stock} left` : "In stock") : "Sold out"}
                  >
                    {on && <motion.span layoutId="qv-size" className="size2__pill" transition={{ type: "spring", stiffness: 520, damping: 38 }} />}
                    <span className="size2__label">{v.size}</span>
                    {v.stock > 0 && v.stock <= lowAt && <i className="size2__low" aria-label="Low stock" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <AnimatePresence mode="wait" initial={false}>
        <motion.p key={note[1]} className={`pdpi__stock ${note[0]}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
          {note[1] && <i aria-hidden />}{note[1]}
        </motion.p>
      </AnimatePresence>

      <div className="qv__actions">
        {p.soldOut ? (
          <Link href={`/products/${p.slug}`} className="btn" onClick={done}>Get a stock alert</Link>
        ) : (
          <button type="button" className="btn" onClick={addToBag} disabled={busy}>
            <Icon name="bag" /> {busy ? "Adding…" : variant ? `Add to bag · ${fmt(p.price)}` : "Add to bag"}
          </button>
        )}
        <motion.button
          type="button" whileTap={{ scale: 0.85 }} className={`qv__wish ${wished ? "is-on" : ""}`}
          aria-pressed={wished} aria-label={wished ? "Remove from saved" : "Save for later"} onClick={() => toggleWish(p.id)}
        >
          <Icon name="heart" />
        </motion.button>
      </div>

      <div className="qv__foot">
        <Link href={`/products/${p.slug}`} className="link-arrow" onClick={done}>Full details, fabric &amp; care</Link>
        <span>Cash on delivery{store.shipping?.eta ? ` · ${store.shipping.eta}` : ""}</span>
      </div>
    </motion.div>
  );
}

/**
 * Quick view: a product's photos and sizes in a window over the grid, so shoppers can add to bag
 * without leaving the list. The arrows step through the products currently shown.
 * The photo slider is the product page's own (Embla); clicking a photo opens the full product page.
 */
export default function QuickView({ list, id, setId }) {
  const router = useRouter();
  const index = list.findIndex((p) => p.id === id);
  const p = index >= 0 ? list[index] : null;
  const step = (d) => setId(list[(index + d + list.length) % list.length].id);
  const close = () => setId(null);

  useEffect(() => {
    if (p) window.__lenis?.stop();
    return () => window.__lenis?.start();
  }, [Boolean(p)]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Dialog open={Boolean(p)} onOpenChange={(o) => !o && close()}>
      <DialogContent className="qv" data-lenis-prevent>
        {p && (
          <>
            <div className="qv__media">
              <Gallery key={p.id} images={p.images} name={p.name} onOpen={() => { close(); router.push(`/products/${p.slug}`); }}>
                <div className="pdpg__badges">
                  {p.soldOut ? <span className="pdp-badge">Sold out</span> : p.off > 0 && <span className="pdp-badge pdp-badge--sale">−{p.off}%</span>}
                </div>
              </Gallery>
            </div>
            <Buy key={p.id} p={p} done={close} />
            {list.length > 1 && (
              <div className="qv__steps">
                <button type="button" onClick={() => step(-1)} aria-label="Previous product"><Icon name="arrow" /></button>
                <span>{String(index + 1).padStart(2, "0")} / {String(list.length).padStart(2, "0")}</span>
                <button type="button" onClick={() => step(1)} aria-label="Next product"><Icon name="arrow" /></button>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
