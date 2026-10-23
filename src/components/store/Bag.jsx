"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import Counter from "@/components/bits/Counter/Counter";
import ShinyText from "@/components/bits/ShinyText/ShinyText";
import { bagPicksAction } from "@/lib/store-actions";
import { variantLabel } from "@/lib/format";
import { useStore } from "./Shell";
import { Icon } from "./icons";

const EASE = [0.16, 1, 0.3, 1];
const SWIPE = 90; // px a row is dragged left before it is removed

/** A bag line. Phones swipe it left to remove (a red "Remove" shows underneath); everyone has the button too. */
function Line({ item, fmt, setQty, remove, close }) {
  const max = item.max || 20;
  return (
    <motion.li
      className="bagline" layout
      initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0, marginTop: 0, transition: { duration: 0.3, ease: EASE } }}
      transition={{ duration: 0.4, ease: EASE }}
    >
      <span className="bagline__under" aria-hidden><Icon name="close" /> Remove</span>
      <motion.div
        className="bagline__row" data-vaul-no-drag
        drag="x" dragDirectionLock dragConstraints={{ left: 0, right: 0 }} dragElastic={{ left: 0.6, right: 0.05 }}
        onDragEnd={(_, info) => { if (info.offset.x < -SWIPE || info.velocity.x < -700) remove(item); }}
      >
        <Link href={`/products/${item.slug}`} onClick={close} className="bagline__img"><img src={item.image} alt="" width="84" height="105" draggable={false} /></Link>
        <div className="bagline__info">
          <Link href={`/products/${item.slug}`} onClick={close} className="bagline__name">{item.name}</Link>
          <span className="bagline__size">Size {item.size}</span>
          <div className="bagline__qty" aria-label="Quantity">
            <button type="button" aria-label="Decrease quantity" disabled={item.qty <= 1} onClick={() => setQty(item.variantId, item.qty - 1)}>−</button>
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span key={item.qty} initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -10, opacity: 0 }} transition={{ duration: 0.18 }}>{item.qty}</motion.span>
            </AnimatePresence>
            <button type="button" aria-label="Increase quantity" disabled={item.qty >= max} onClick={() => setQty(item.variantId, item.qty + 1)}>+</button>
          </div>
          {item.qty >= max && <span className="bagline__max">That is all we have in this size</span>}
        </div>
        <div className="bagline__side">
          <b>{fmt(item.price * item.qty)}</b>
          {item.qty > 1 && <small>{fmt(item.price)} each</small>}
          <button type="button" className="bagline__rm" onClick={() => remove(item)}>Remove</button>
        </div>
      </motion.div>
    </motion.li>
  );
}

/** "Complete the look": a few pieces to add without leaving the bag; the + opens their sizes in place. */
function Pick({ p, fmt, add }) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState("");
  const pick = (v) => {
    add({ variantId: v.id, productId: p.id, slug: p.slug, name: p.name, size: variantLabel(v), image: p.images[0]?.thumb, price: p.price, max: v.stock }, 1, { open: false });
    setDone(variantLabel(v));
    setOpen(false);
    navigator.vibrate?.(10);
  };
  return (
    <div className={`bagpick ${open ? "is-open" : ""}`}>
      <img src={p.images[0]?.thumb} alt="" width="120" height="150" loading="lazy" />
      <div className="bagpick__text">
        <b>{p.name}</b>
        <span className={p.was ? "is-sale" : ""}>{fmt(p.price)}</span>
      </div>
      <AnimatePresence mode="wait" initial={false}>
        {done ? (
          <motion.span key="done" className="bagpick__done" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}><Icon name="check" /> {done}</motion.span>
        ) : open ? (
          <motion.div key="sizes" className="bagpick__sizes" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            {p.variants.map((v) => <button key={v.id} type="button" disabled={!v.stock} onClick={() => pick(v)}>{variantLabel(v)}</button>)}
          </motion.div>
        ) : (
          <motion.button key="add" type="button" className="bagpick__add" aria-label={`Add ${p.name}`} onClick={() => setOpen(true)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} whileTap={{ scale: 0.88 }}>
            <Icon name="plus" />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * The bag. A sheet from the right on desktop and from the bottom on phones (shadcn Drawer / vaul, so it can be
 * pulled closed). Free-delivery progress, swipe-to-remove with undo, live total, and "complete the look".
 */
export default function Bag({ open, close }) {
  const { cart, fmt, subtotal, count, setQty, remove, add, wish, store } = useStore();
  const [narrow, setNarrow] = useState(false);
  const [undo, setUndo] = useState(null); // the line just removed, for a few seconds
  const [picks, setPicks] = useState([]);
  const undoTimer = useRef(0);
  const freeOver = Number(store.shipping?.free_over) || 0;
  const left = freeOver - subtotal;
  const unlocked = freeOver > 0 && left <= 0;

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 700px)");
    const sync = () => setNarrow(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  // pieces that go with what is in the bag: chosen each time the bag opens, then kept while it is open
  // (so a piece added from here stays on screen with its tick instead of vanishing from the list)
  const ids = [...new Set(cart.map((i) => i.productId))].join(",");
  const idsRef = useRef(ids);
  idsRef.current = ids;
  useEffect(() => {
    if (!open || !idsRef.current) return;
    let live = true;
    bagPicksAction(idsRef.current.split(",").map(Number)).then((list) => live && setPicks(list)).catch(() => {});
    return () => { live = false; };
  }, [open, Boolean(ids)]); // eslint-disable-line react-hooks/exhaustive-deps

  const drop = (item) => {
    remove(item.variantId);
    setUndo(item);
    navigator.vibrate?.(8);
    clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => setUndo(null), 5000);
  };
  const restore = () => {
    if (!undo) return;
    add(undo, undo.qty, { open: false });
    setUndo(null);
  };

  return (
    <Drawer open={open} onOpenChange={(o) => !o && close()} direction={narrow ? "bottom" : "right"}>
      <DrawerContent className={`bag ${narrow ? "bag--bottom" : "bag--side"}`} data-lenis-prevent>
        <header className="bag__head">
          <div>
            <DrawerTitle className="bag__title">Your bag</DrawerTitle>
            <DrawerDescription className="bag__sub">{count ? `${count} ${count === 1 ? "piece" : "pieces"}` : "Nothing here yet"}</DrawerDescription>
          </div>
          <button type="button" className="icon-btn" aria-label="Close bag" onClick={close}><Icon name="close" /></button>
        </header>

        {cart.length > 0 && freeOver > 0 && (
          <div className={`bag__ship ${unlocked ? "is-done" : ""}`}>
            <AnimatePresence mode="wait" initial={false}>
              <motion.p key={unlocked ? "done" : "left"} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }}>
                {unlocked
                  ? <><Icon name="truck" /> <ShinyText text="Free delivery unlocked" color="currentColor" shineColor="#ffffff" speed={2.4} /></>
                  : <>Add <b>{fmt(left)}</b> more for free delivery</>}
              </motion.p>
            </AnimatePresence>
            <span className="bag__bar"><motion.i animate={{ scaleX: Math.min(1, subtotal / freeOver) }} transition={{ type: "spring", stiffness: 120, damping: 20 }} /></span>
          </div>
        )}

        <div className="bag__body">
          {cart.length === 0 ? (
            <div className="bag__empty">
              <motion.span className="bag__empty-icon" animate={{ y: [0, -8, 0] }} transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}><Icon name="bag" /></motion.span>
              <b>Your bag is empty</b>
              <p>Pieces you add show up here. Cash on delivery, and you confirm before we ship.</p>
              <Link href="/products" className="btn" onClick={close}>Shop the collection <span aria-hidden>→</span></Link>
              {wish.length > 0 && <Link href="/products?saved=1" className="link-arrow" onClick={close}>Your saved pieces ({wish.length})</Link>}
            </div>
          ) : (
            <>
              <ul className="bag__lines">
                <AnimatePresence initial={false}>
                  {cart.map((i) => <Line key={i.variantId} item={i} fmt={fmt} setQty={setQty} remove={drop} close={close} />)}
                </AnimatePresence>
              </ul>
              {narrow && <p className="bag__hint">Swipe a piece left to remove it</p>}

              {picks.length > 0 && (
                <section className="bag__picks" data-showcase="bag" aria-label="Complete the look">
                  <span className="eyebrow">Complete the look</span>
                  <div className="bag__picks-row" data-vaul-no-drag>
                    {picks.map((p) => <Pick key={p.id} p={p} fmt={fmt} add={add} />)}
                  </div>
                </section>
              )}
            </>
          )}
        </div>

        <AnimatePresence>
          {undo && (
            <motion.div className="bag__undo" role="status" initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }}>
              <span>Removed {undo.name}</span>
              <button type="button" onClick={restore}>Undo</button>
            </motion.div>
          )}
        </AnimatePresence>

        {cart.length > 0 && (
          <footer className="bag__foot">
            <div className="bag__total">
              <span>Subtotal</span>
              <b><Counter value={subtotal} prefix={`${store.currency} `} fontSize="inherit" intro={false} duration={0.6} /></b>
            </div>
            <Link href="/checkout" className="btn btn--block bag__go" onClick={close}>
              Checkout <span aria-hidden>→</span>
            </Link>
            <ul className="bag__trust">
              <li><Icon name="cash" /> Cash on delivery</li>
              <li><Icon name="refresh" /> 7-day exchange</li>
              <li><Icon name="check" /> Confirm before we ship</li>
            </ul>
          </footer>
        )}
      </DrawerContent>
    </Drawer>
  );
}
