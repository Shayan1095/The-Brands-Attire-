"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { StockInput } from "./Widgets";
import AdminIcon from "./icons";

/**
 * Stock, organised. One row per product with every size inline; products are grouped by
 * category or by type, groups fold away, and search / level filters cut the list down.
 * `products` = [{ id, name, image, status, category, type, lowAt, variants: [{ id, size, sku, stock, waiting }] }]
 */
export default function InventoryBoard({ products }) {
  const [by, setBy] = useState("category"); // category | type
  const [only, setOnly] = useState("all");  // a group name, or "all"
  const [level, setLevel] = useState("all"); // all | low | out
  const [q, setQ] = useState("");
  const [closed, setClosed] = useState([]);
  // live copy of stock so totals update the moment a number is saved
  const [stock, setStock] = useState(() => Object.fromEntries(products.flatMap((p) => p.variants.map((v) => [v.id, v.stock]))));

  const keyOf = (p) => (by === "category" ? p.category : p.type) || (by === "category" ? "No category" : "No type");
  // "low" is judged on what can still be sold: on hand minus reserved for unconfirmed orders
  const isLow = (p, v) => stock[v.id] - v.reserved <= p.lowAt;

  const totals = useMemo(() => {
    const all = products.flatMap((p) => p.variants.map((v) => ({ p, v })));
    return {
      units: all.reduce((s, { v }) => s + stock[v.id], 0),
      low: all.filter(({ p, v }) => stock[v.id] > 0 && isLow(p, v)).length,
      out: all.filter(({ v }) => stock[v.id] === 0).length,
      waiting: all.reduce((s, { v }) => s + v.waiting, 0),
      reserved: all.reduce((s, { v }) => s + v.reserved, 0),
    };
  }, [products, stock]); // eslint-disable-line react-hooks/exhaustive-deps

  const groupNames = useMemo(() => [...new Set(products.map(keyOf))].sort((a, b) => a.localeCompare(b)), [products, by]); // eslint-disable-line react-hooks/exhaustive-deps

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const map = new Map();
    for (const p of products) {
      const name = keyOf(p);
      if (only !== "all" && name !== only) continue;
      if (needle && !`${p.name} ${p.variants.map((v) => v.sku).join(" ")}`.toLowerCase().includes(needle)) continue;
      const hit = level === "all" || p.variants.some((v) => (level === "out" ? stock[v.id] === 0 : isLow(p, v)));
      if (!hit) continue;
      map.set(name, [...(map.get(name) || []), p]);
    }
    return [...map].sort(([a], [b]) => a.localeCompare(b));
  }, [products, by, only, level, q, stock]); // eslint-disable-line react-hooks/exhaustive-deps

  const count = (name) => products.filter((p) => keyOf(p) === name).length;
  const toggle = (name) => setClosed((c) => (c.includes(name) ? c.filter((x) => x !== name) : [...c, name]));
  const shownProducts = groups.reduce((s, [, items]) => s + items.length, 0);

  return (
    <>
      <div className="kpis">
        <div className="kpi"><span className="kpi__label">Units in stock</span><div className="kpi__value">{totals.units}</div><div className="kpi__foot">{products.length} products · {totals.reserved} reserved for unconfirmed orders</div></div>
        <button className={`kpi kpi--btn ${level === "low" ? "on" : ""}`} onClick={() => setLevel(level === "low" ? "all" : "low")}>
          <span className="kpi__label">Sizes running low</span><div className="kpi__value">{totals.low + totals.out}</div><div className="kpi__foot">{level === "low" ? "Showing these · click to clear" : "Click to show only these"}</div>
        </button>
        <button className={`kpi kpi--btn ${level === "out" ? "on" : ""}`} onClick={() => setLevel(level === "out" ? "all" : "out")}>
          <span className="kpi__label">Sizes sold out</span><div className="kpi__value">{totals.out}</div><div className="kpi__foot">{level === "out" ? "Showing these · click to clear" : "Click to show only these"}</div>
        </button>
        <div className="kpi"><span className="kpi__label">Customers waiting</span><div className="kpi__value">{totals.waiting}</div><div className="kpi__foot">Asked for a back-in-stock alert</div></div>
      </div>

      <div className="card inv__tools">
        <div className="inv__search">
          <AdminIcon name="search" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search product or SKU…" aria-label="Search product or SKU" />
        </div>
        <div className="inline">
          <span className="dim">Group by</span>
          <div className="seg" role="group" aria-label="Group by">
            <button className={by === "category" ? "active" : ""} onClick={() => { setBy("category"); setOnly("all"); }}>Category</button>
            <button className={by === "type" ? "active" : ""} onClick={() => { setBy("type"); setOnly("all"); }}>Type</button>
          </div>
        </div>
        <div className="inv__chips">
          <button className={only === "all" ? "active" : ""} onClick={() => setOnly("all")}>All <span>{products.length}</span></button>
          {groupNames.map((name) => (
            <button key={name} className={only === name ? "active" : ""} onClick={() => setOnly(name)}>{name} <span>{count(name)}</span></button>
          ))}
        </div>
      </div>

      {groups.map(([name, items]) => {
        const variants = items.flatMap((p) => p.variants.map((v) => ({ p, v })));
        const units = variants.reduce((s, { v }) => s + stock[v.id], 0);
        const low = variants.filter(({ p, v }) => isLow(p, v)).length;
        const open = !closed.includes(name);
        return (
          <section className="card inv__group" key={name}>
            <button className="inv__head" onClick={() => toggle(name)} aria-expanded={open}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={open ? "open" : ""} aria-hidden><path d="m9 6 6 6-6 6" /></svg>
              <h2>{name}</h2>
              <span className="dim">{items.length} {items.length === 1 ? "product" : "products"} · {units} units</span>
              {low > 0 && <span className="pill warn">{low} low or sold out</span>}
            </button>
            {open && (
              <div className="inv__rows">
                {items.map((p) => {
                  const total = p.variants.reduce((s, v) => s + stock[v.id], 0);
                  return (
                    <div className="inv__row" key={p.id}>
                      <Link href={`/admin/products/${p.id}`} className="cell-prod">
                        <img src={p.image || undefined} alt="" />
                        <span>
                          <b>{p.name}</b>
                          <small>{[by === "category" ? p.type : p.category, p.status !== "active" && p.status].filter(Boolean).join(" · ") || " "}</small>
                        </span>
                      </Link>
                      <div className="inv__sizes">
                        {p.variants.map((v) => (
                          <label key={v.id} className={`inv__size ${stock[v.id] === 0 ? "out" : isLow(p, v) ? "low" : ""}`} title={v.sku ? `SKU ${v.sku}` : undefined}>
                            <span>{v.size}</span>
                            <StockInput variantId={v.id} stock={v.stock} lowAt={p.lowAt} onSaved={(n) => setStock((s) => ({ ...s, [v.id]: n }))} />
                            {v.reserved > 0 && <em className="res">{v.reserved} reserved</em>}
                            {v.waiting > 0 && <em>{v.waiting} waiting</em>}
                          </label>
                        ))}
                      </div>
                      <div className="inv__total"><b>{total}</b><small>units</small></div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}

      {!shownProducts && (
        <div className="card"><p className="empty">Nothing matches. <button className="link" onClick={() => { setQ(""); setLevel("all"); setOnly("all"); }}>Clear filters</button></p></div>
      )}
    </>
  );
}
