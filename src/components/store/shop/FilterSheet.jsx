"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import Counter from "@/components/bits/Counter/Counter";

export const SORTS = [["", "Newest"], ["featured", "Featured"], ["price-asc", "Price: low to high"], ["price-desc", "Price: high to low"], ["discount", "Biggest discount"]];
const BINS = 28;

function SideFrame({ open, onOpenChange, children, ...rest }) {
  return <Sheet open={open} onOpenChange={onOpenChange}><SheetContent side="right" {...rest}>{children}</SheetContent></Sheet>;
}
function BottomFrame({ open, onOpenChange, children, ...rest }) {
  return <Drawer open={open} onOpenChange={onOpenChange}><DrawerContent {...rest}>{children}</DrawerContent></Drawer>;
}

/** Sort only, as a small bottom sheet (the "Sort" button in the phone bar). */
export function SortDrawer({ open, onOpenChange, sort, setSort }) {
  useEffect(() => {
    if (open) window.__lenis?.stop(); else window.__lenis?.start();
  }, [open]);
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="fsheet fsheet--bottom fsheet--sort" data-lenis-prevent>
        <div className="fsheet__head">
          <DrawerTitle className="fsheet__title">Sort by</DrawerTitle>
          <DrawerDescription className="fsheet__sub">Choose the order of the pieces</DrawerDescription>
        </div>
        <div className="fsheet__body">
          <div className="fsheet__sorts" role="radiogroup" aria-label="Sort by">
            {SORTS.map(([value, label]) => (
              <DrawerClose asChild key={value}>
                <button type="button" role="radio" aria-checked={sort === value} className={`fsort ${sort === value ? "is-on" : ""}`} onClick={() => setSort(value)}>
                  <span className="fsort__dot">{sort === value && <i />}</span>
                  {label}
                </button>
              </DrawerClose>
            ))}
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function Group({ title, note, children }) {
  return (
    <section className="fsheet__group">
      <header><h3>{title}</h3>{note && <span>{note}</span>}</header>
      {children}
    </section>
  );
}

/**
 * Every filter in one drawer: from the right on desktop (shadcn Sheet); on phones a bottom sheet that can be
 * pulled down to close (shadcn Drawer, built on vaul).
 * Changes apply at once (the grid behind re-arranges), so the button only closes the drawer.
 * The price slider sits on a small chart of where the collection's prices fall.
 */
export default function FilterSheet({
  open, onOpenChange, count, pool, scopeName, fmt,
  sort, sizes, sizeOptions, colors, colorOptions, range, bounds, inStock, qText,
  setSort, toggleSize, toggleColor, setRange, setInStock, setQ, clearAll, active,
}) {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 700px)");
    const sync = () => setNarrow(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  // the page behind stops smooth-scrolling so the drawer itself scrolls
  useEffect(() => {
    if (open) window.__lenis?.stop(); else window.__lenis?.start();
  }, [open]);

  // the slider moves freely while dragging; the grid updates when it is let go
  const [draft, setDraft] = useState(range);
  useEffect(() => setDraft(range), [range[0], range[1]]); // eslint-disable-line react-hooks/exhaustive-deps

  const Frame = narrow ? BottomFrame : SideFrame;
  const [Title, Desc, Close] = narrow ? [DrawerTitle, DrawerDescription, DrawerClose] : [SheetTitle, SheetDescription, SheetClose];

  const [lo, hi] = bounds;
  const step = hi - lo > 20000 ? 500 : 100;
  const bars = useMemo(() => {
    const out = Array(BINS).fill(0);
    if (hi <= lo) return out;
    pool.forEach((p) => { out[Math.min(BINS - 1, Math.floor(((p.price - lo) / (hi - lo)) * BINS))]++; });
    const top = Math.max(...out, 1);
    return out.map((n) => n / top);
  }, [pool, lo, hi]);

  // how many pieces of the collection are available in each size / colour
  const sizeCount = (s) => pool.filter((p) => p.variants.some((v) => v.size === s && v.stock > 0)).length;
  const colorCount = (c) => pool.filter((p) => p.variants.some((v) => v.color === c && v.stock > 0)).length;

  return (
    <Frame open={open} onOpenChange={onOpenChange} className={`fsheet ${narrow ? "fsheet--bottom" : ""}`} data-lenis-prevent>
        <div className="fsheet__head">
          <Title className="fsheet__title">Filter &amp; sort</Title>
          <Desc className="fsheet__sub">{pool.length} {pool.length === 1 ? "piece" : "pieces"} in {scopeName}</Desc>
        </div>

        <div className="fsheet__body">
          <Group title="Sort by">
            <div className="fsheet__sorts" role="radiogroup" aria-label="Sort by">
              {SORTS.map(([value, label]) => (
                <button key={value} type="button" role="radio" aria-checked={sort === value} className={`fsort ${sort === value ? "is-on" : ""}`} onClick={() => setSort(value)}>
                  <span className="fsort__dot">{sort === value && <motion.i layoutId="fsort-dot" transition={{ type: "spring", stiffness: 500, damping: 36 }} />}</span>
                  {label}
                </button>
              ))}
            </div>
          </Group>

          {sizeOptions.length > 0 && (
            <Group title="Size" note={sizes.length ? `${sizes.length} chosen` : "Pieces in stock"}>
              <div className="fsheet__sizes">
                {sizeOptions.map((s) => {
                  const n = sizeCount(s);
                  const on = sizes.includes(s);
                  return (
                    <motion.button key={s} type="button" whileTap={{ scale: 0.94 }} className={`fsize ${on ? "is-on" : ""}`} aria-pressed={on} disabled={!n && !on} onClick={() => toggleSize(s)}>
                      <b>{s}</b><small>{n}</small>
                    </motion.button>
                  );
                })}
              </div>
            </Group>
          )}

          {colorOptions.length > 0 && (
            <Group title="Colour" note={colors.length ? colors.join(", ") : null}>
              <div className="fsheet__colors">
                {colorOptions.map((c) => {
                  const on = colors.includes(c);
                  return (
                    <button key={c} type="button" className={`fcolor ${on ? "is-on" : ""}`} aria-pressed={on} onClick={() => toggleColor(c)} title={`${c} (${colorCount(c)})`}>
                      <span className="swatch"><i style={{ "--sw": c.toLowerCase().replace(/\s+/g, "") }} />{on && <span className="swatch__ring" />}</span>
                      <span>{c}</span>
                    </button>
                  );
                })}
              </div>
            </Group>
          )}

          {hi > lo && (
            <Group title="Price" note={`${fmt(draft[0])} – ${fmt(draft[1])}`}>
              <div className="fprice" data-vaul-no-drag>
                <div className="fprice__chart" aria-hidden>
                  {bars.map((h, i) => {
                    const at = lo + ((i + 0.5) / BINS) * (hi - lo);
                    return <i key={i} style={{ height: `${Math.max(6, h * 100)}%` }} className={!h ? "is-empty" : at >= draft[0] && at <= draft[1] ? "is-in" : ""} />;
                  })}
                </div>
                <Slider
                  className="fprice__slider" min={lo} max={hi} step={step} minStepsBetweenThumbs={1}
                  value={draft} onValueChange={setDraft} onValueCommit={setRange} aria-label="Price range"
                />
                <div className="fprice__ends"><span>{fmt(lo)}</span><span>{fmt(hi)}</span></div>
              </div>
            </Group>
          )}

          <Group title="Availability">
            <label className="fswitch">
              <span><b>In stock only</b><small>Hide pieces that are sold out in every size</small></span>
              <Switch checked={inStock} onCheckedChange={setInStock} />
            </label>
          </Group>

          <Group title="Search this collection">
            <input className="input fsheet__search" value={qText} onChange={(e) => setQ(e.target.value)} placeholder="Type a name…" aria-label="Search this collection" />
          </Group>
        </div>

        <div className="fsheet__foot">
          <button type="button" className="link-arrow" onClick={clearAll} disabled={!active}>Clear all</button>
          <Close className="btn fsheet__go">
            <span>Show</span><Counter value={count} fontSize="inherit" intro={false} duration={0.5} /><span>{count === 1 ? "piece" : "pieces"}</span>
          </Close>
        </div>
    </Frame>
  );
}
