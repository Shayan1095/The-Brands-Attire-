"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useStore } from "./Shell";
import { Icon } from "./icons";
import { variantLabel } from "@/lib/format";

/** `p` is the slim card shape from lib/catalog.js `toCard`. */
export default function ProductCard({ p, eager = false, reveal = true }) {
  const { fmt, add, wish, toggleWish } = useStore();
  const [picking, setPicking] = useState(false);
  const href = `/products/${p.slug}`;
  const image = p.images[0];
  const wished = wish.includes(p.id);

  const quickAdd = (v) => {
    add({ variantId: v.id, productId: p.id, slug: p.slug, name: p.name, size: variantLabel(v), image: image?.thumb, price: p.price, max: v.stock });
    setPicking(false);
  };

  return (
    <article className="card" data-reveal={reveal ? "" : undefined}>
      <div className="card__media">
        <Link href={href} aria-label={p.name} tabIndex={-1}>
          {image && <img src={image.thumb} alt={p.name} width="600" height="750" loading={eager ? "eager" : "lazy"} decoding="async" />}
          {p.images[1] && <img className="card__alt" src={p.images[1].thumb} alt="" width="600" height="750" loading="lazy" decoding="async" />}
        </Link>

        {p.soldOut ? <span className="card__tag card__tag--out">Sold out</span>
          : p.off ? <span className="card__tag card__tag--sale">−{p.off}%</span>
          : p.badge ? <span className="card__tag">{p.badge}</span> : null}

        <motion.button
          className={`card__wish ${wished ? "active" : ""}`} whileTap={{ scale: 0.8 }}
          aria-label={wished ? "Remove from wishlist" : "Save to wishlist"} aria-pressed={wished} onClick={() => toggleWish(p.id)}
        >
          {wished ? "♥" : "♡"}
        </motion.button>

        {!p.soldOut && !picking && (
          <button className="card__add" aria-label={`Add ${p.name} to bag`} onClick={() => setPicking(true)}>
            <Icon name="bag" /><span>Add to bag</span>
          </button>
        )}

        <AnimatePresence>
          {picking && (
            <motion.div
              className="card__sizes"
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 420, damping: 38 }}
            >
              <header>Select size <button aria-label="Close size picker" onClick={() => setPicking(false)}>✕</button></header>
              <div>
                {p.variants.map((v) => (
                  <button key={v.id} disabled={!v.stock} onClick={() => quickAdd(v)}>{variantLabel(v)}</button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="card__body">
        <div className="card__head">
          <div className="card__accent" />
          <span className="card__world">{p.category}</span>
          <Link href={href} className="card__name">{p.name}</Link>
        </div>
        <div className="card__foot">
          <div className="card__price">
            <span className={`now ${p.was ? "sale" : ""}`}>{fmt(p.price)}</span>
            {p.was && <span className="was">{fmt(p.was)}</span>}
          </div>
          <Link href={href} className="card__details" aria-label={`Details: ${p.name}`}>
            <em style={{ fontStyle: "normal" }}>Details</em>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden><path d="M5 12h14M13 6l6 6-6 6" /></svg>
          </Link>
        </div>
      </div>
    </article>
  );
}
