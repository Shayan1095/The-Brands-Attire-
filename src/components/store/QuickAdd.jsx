"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { variantLabel } from "@/lib/format";
import { flyToBag } from "./flyToBag";
import { Icon } from "./icons";

/**
 * Phones: "Add to bag" on a card opens this sheet from the bottom (vaul, so it can be pulled down to close).
 * Big size buttons, colour if the product has them; on adding, the sheet drops away and the card's own
 * photo flies into the bag, with a short buzz on phones that support it.
 *
 * `item` = { p, img } (img: the card photo the flight starts from)
 */
export default function QuickAdd({ item, close, add, fmt, toast }) {
  const p = item?.p;
  const [last, setLast] = useState(item); // keeps the content on screen while the sheet slides away
  useEffect(() => { if (item) setLast(item); }, [item]);
  const shown = item || last;

  useEffect(() => {
    if (item) window.__lenis?.stop(); else window.__lenis?.start();
  }, [Boolean(item)]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Drawer open={Boolean(p)} onOpenChange={(o) => !o && close()}>
      <DrawerContent className="qadd" data-lenis-prevent>
        {shown && <Picker key={shown.p.id} item={shown} close={close} add={add} fmt={fmt} toast={toast} />}
      </DrawerContent>
    </Drawer>
  );
}

function Picker({ item, close, add, fmt, toast }) {
  const { p, img } = item;
  const colors = useMemo(() => [...new Set(p.variants.map((v) => v.color).filter(Boolean))], [p.variants]);
  const [color, setColor] = useState(() => colors.find((c) => p.variants.some((v) => v.color === c && v.stock > 0)) || colors[0] || "");
  const sizes = colors.length ? p.variants.filter((v) => v.color === color) : p.variants;
  const [variantId, setVariantId] = useState(() => (sizes.length === 1 && sizes[0].stock ? sizes[0].id : null));
  const variant = p.variants.find((v) => v.id === variantId);
  const lowAt = p.lowAt ?? 3;
  const grid = useRef(null);

  const confirm = async () => {
    if (!variant) {
      grid.current?.animate([{ translate: "0" }, { translate: "-8px" }, { translate: "8px" }, { translate: "-4px" }, { translate: "0" }], { duration: 380 });
      return toast("Please select a size");
    }
    add({ variantId: variant.id, productId: p.id, slug: p.slug, name: p.name, size: variantLabel(variant), image: p.images[0]?.thumb, price: p.price, max: variant.stock }, 1, { open: false });
    navigator.vibrate?.(15);
    close();
    // let the sheet get out of the way, then the card photo flies to the bag
    await new Promise((r) => setTimeout(r, 260));
    await flyToBag(img);
    toast(`${p.name} (${variantLabel(variant)}) is in your bag`);
  };

  return (
    <>
      <div className="qadd__head">
        {p.images[0] && <img src={p.images[0].thumb} alt="" width="120" height="150" />}
        <div>
          <span className="qadd__cat">{p.category}</span>
          <DrawerTitle className="qadd__name">{p.name}</DrawerTitle>
          <DrawerDescription className="qadd__price">
            <b className={p.was ? "is-sale" : ""}>{fmt(p.price)}</b>{p.was && <s>{fmt(p.was)}</s>}
          </DrawerDescription>
        </div>
      </div>

      {colors.length > 0 && (
        <div className="qadd__group">
          <span className="qadd__label">Colour <b>{color}</b></span>
          <div className="swatches">
            {colors.map((c) => (
              <button
                key={c} type="button" aria-label={c} aria-pressed={c === color}
                className={`swatch ${c === color ? "is-on" : ""} ${p.variants.some((v) => v.color === c && v.stock > 0) ? "" : "is-out"}`}
                onClick={() => { setColor(c); setVariantId(null); }}
              >
                <i style={{ "--sw": c.toLowerCase().replace(/\s+/g, "") }} />
                {c === color && <motion.span layoutId="qadd-swatch" className="swatch__ring" />}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="qadd__group">
        <span className="qadd__label">{variant ? <>Size <b>{variant.size}</b></> : "Select a size"}</span>
        <div className="sizes2 qadd__sizes" ref={grid} role="radiogroup" aria-label="Size">
          {sizes.map((v) => {
            const on = v.id === variantId;
            return (
              <button key={v.id} type="button" role="radio" aria-checked={on} disabled={!v.stock} className={`size2 ${on ? "is-on" : ""} ${v.stock ? "" : "is-out"}`} onClick={() => setVariantId(v.id)}>
                {on && <motion.span layoutId="qadd-size" className="size2__pill" transition={{ type: "spring", stiffness: 520, damping: 38 }} />}
                <span className="size2__label">{v.size}</span>
                {v.stock > 0 && v.stock <= lowAt && <i className="size2__low" aria-label="Low stock" />}
              </button>
            );
          })}
        </div>
        <AnimatePresence mode="wait" initial={false}>
          <motion.p key={variant?.id || "none"} className={`pdpi__stock ${variant ? (variant.stock <= lowAt ? "low" : "in") : ""}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            {variant && <i aria-hidden />}{variant ? (variant.stock <= lowAt ? `Only ${variant.stock} left` : "In stock, ready to ship") : ""}
          </motion.p>
        </AnimatePresence>
      </div>

      <button type="button" className="btn qadd__go" onClick={confirm}>
        <Icon name="bag" /> {variant ? `Add to bag · ${fmt(p.price)}` : "Add to bag"}
      </button>
    </>
  );
}
