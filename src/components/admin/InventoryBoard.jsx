"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { saveProductStockAction, productStockHistoryAction } from "@/lib/admin-actions";
import { STOCK_REASONS } from "@/lib/format";
import AdminIcon from "./icons";

const VIEWS = [
  ["all", "All products"],
  ["low", "Running low"],
  ["out", "Sold out"],
  ["waiting", "Customers waiting"],
];

/**
 * Inventory, simply: one line per product showing every size and how many are left, coloured by how urgent it is.
 * Tap a product to open its panel, where all its sizes are updated at once with one reason for the log.
 * `products` = [{ id, name, image, status, category, lowAt, variants: [{ id, size, sku, stock, reserved, waiting }] }]
 */
export default function InventoryBoard({ products }) {
  const [view, setView] = useState("all");
  const [collection, setCollection] = useState("");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(null); // product id in the side panel
  const close = useCallback(() => setOpen(null), []);

  // what can still be sold: on hand minus pieces held for unconfirmed orders
  const free = (v) => Math.max(0, v.stock - v.reserved);
  const levelOf = (p, v) => (free(v) === 0 ? "out" : free(v) <= p.lowAt ? "low" : "ok");
  const flags = (p) => ({
    out: p.variants.some((v) => levelOf(p, v) === "out"),
    low: p.variants.some((v) => levelOf(p, v) !== "ok"),
    waiting: p.variants.reduce((s, v) => s + v.waiting, 0),
  });

  const counts = useMemo(() => ({
    all: products.length,
    low: products.filter((p) => flags(p).low).length,
    out: products.filter((p) => flags(p).out).length,
    waiting: products.filter((p) => flags(p).waiting > 0).length,
  }), [products]); // eslint-disable-line react-hooks/exhaustive-deps
  const units = products.reduce((s, p) => s + p.variants.reduce((t, v) => t + v.stock, 0), 0);
  const collections = useMemo(() => [...new Set(products.map((p) => p.category || "No collection"))].sort(), [products]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return products.filter((p) => {
      const f = flags(p);
      if (view === "low" && !f.low) return false;
      if (view === "out" && !f.out) return false;
      if (view === "waiting" && !f.waiting) return false;
      if (collection && (p.category || "No collection") !== collection) return false;
      return !needle || `${p.name} ${p.variants.map((v) => v.sku).join(" ")}`.toLowerCase().includes(needle);
    });
  }, [products, view, collection, q]); // eslint-disable-line react-hooks/exhaustive-deps

  const current = products.find((p) => p.id === open);

  return (
    <>
      <div className="invx__views" role="tablist" aria-label="Show">
        {VIEWS.map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={view === key} className={`invx__view invx__view--${key} ${view === key ? "on" : ""}`} onClick={() => setView(key)}>
            <b>{counts[key]}</b><span>{label}</span>
          </button>
        ))}
        <div className="invx__units"><b>{units.toLocaleString("en-US")}</b><span>units on hand</span></div>
      </div>

      <div className="invx__bar">
        <label className="invx__search">
          <AdminIcon name="search" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a product or SKU" aria-label="Find a product or SKU" />
          {q && <button type="button" onClick={() => setQ("")} aria-label="Clear search"><AdminIcon name="x" /></button>}
        </label>
        <select className="input invx__col" value={collection} onChange={(e) => setCollection(e.target.value)} aria-label="Collection">
          <option value="">All collections</option>
          {collections.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <div className="invx__key" aria-hidden><span className="ok">In stock</span><span className="low">Low</span><span className="out">Sold out</span></div>
      </div>

      <div className="card invx__list">
        {shown.map((p) => {
          const f = flags(p);
          const total = p.variants.reduce((s, v) => s + v.stock, 0);
          return (
            <button key={p.id} type="button" className="invx__row" onClick={() => setOpen(p.id)} aria-label={`Update stock for ${p.name}`}>
              {p.image ? <img src={p.image} alt="" /> : <i className="invx__noimg" />}
              <span className="invx__name">
                <b>{p.name}</b>
                <small>{p.category || "No collection"}{p.status !== "active" ? ` · ${p.status}` : ""}{f.waiting ? ` · ${f.waiting} waiting` : ""}</small>
              </span>
              <span className="invx__sizes">
                {p.variants.map((v) => (
                  <span key={v.id} className={`invx__size ${levelOf(p, v)}`} title={v.reserved ? `${v.reserved} reserved for unconfirmed orders` : undefined}>
                    {v.size}<b>{free(v)}</b>
                  </span>
                ))}
              </span>
              <span className="invx__total"><b>{total}</b><small>units</small></span>
              <span className="invx__go">Update<AdminIcon name="arrow" /></span>
            </button>
          );
        })}
        {!shown.length && (
          <p className="empty">Nothing here. <button type="button" className="link" onClick={() => { setQ(""); setView("all"); setCollection(""); }}>Show all products</button></p>
        )}
      </div>

      {current && <StockPanel key={current.id} product={current} onClose={close} />}
    </>
  );
}

/** Side panel for one product: every size with − / + and the number, one reason, one save. */
function StockPanel({ product, onClose }) {
  const router = useRouter();
  const [values, setValues] = useState(() => Object.fromEntries(product.variants.map((v) => [v.id, v.stock])));
  const [type, setType] = useState("count");
  const [picked, setPicked] = useState(false); // the person chose a reason themselves
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [history, setHistory] = useState(null);
  const box = useRef(null);

  const changes = product.variants.filter((v) => values[v.id] !== v.stock).map((v) => ({ variantId: v.id, stock: values[v.id], delta: values[v.id] - v.stock }));
  const ups = changes.some((c) => c.delta > 0), downs = changes.some((c) => c.delta < 0);
  // reasons that fit the direction of the changes ("count" always fits)
  const fits = ([, , dir]) => dir === 0 || (dir > 0 ? ups && !downs : downs && !ups);
  // a sensible reason to start from: stock only went up = a delivery, anything else = a recount.
  // Once the person picks one themselves it stays, unless it no longer fits the changes.
  useEffect(() => {
    if (!changes.length) return;
    const r = STOCK_REASONS.find(([t]) => t === type);
    if (!picked || !fits(r)) { setType(ups && !downs ? "supplier" : "count"); setPicked(false); }
  }, [ups, downs]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let live = true;
    productStockHistoryAction(product.id).then((h) => live && setHistory(h)).catch(() => live && setHistory([]));
    const esc = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    document.body.classList.add("locked");
    box.current?.focus({ preventScroll: true });
    return () => { live = false; window.removeEventListener("keydown", esc); document.body.classList.remove("locked"); };
  }, [product.id, onClose]);

  const set = (v, n) => { setDone(false); setError(""); setValues((s) => ({ ...s, [v.id]: Math.max(v.reserved, Math.max(0, n)) })); };
  // − and + work from the latest number, so quick taps all count
  const step = (v, by) => { setDone(false); setError(""); setValues((s) => ({ ...s, [v.id]: Math.max(v.reserved, Math.max(0, s[v.id] + by)) })); };
  const save = async () => {
    setSaving(true); setError("");
    const res = await saveProductStockAction(product.id, changes, type, note);
    setSaving(false);
    if (res?.error) return setError(res.error);
    setDone(true); setNote("");
    router.refresh();
    productStockHistoryAction(product.id).then(setHistory).catch(() => {});
  };

  return (
    <div className="spanel" role="dialog" aria-modal="true" aria-label={`Stock for ${product.name}`} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="spanel__box" ref={box} tabIndex={-1}>
        <header className="spanel__head">
          {product.image ? <img src={product.image} alt="" /> : <i className="invx__noimg" />}
          <div>
            <b>{product.name}</b>
            <small>{product.category || "No collection"} · low when {product.lowAt} or fewer are left</small>
            <Link href={`/admin/products/${product.id}`} className="link">Edit product</Link>
          </div>
          <button type="button" className="iconbtn" onClick={onClose} aria-label="Close"><AdminIcon name="x" /></button>
        </header>

        <div className="spanel__body">
          <p className="spanel__help">Set how many of each size are on the shelf now. Use − and + or type the number.</p>
          <div className="spanel__sizes">
            {product.variants.map((v) => {
              const delta = values[v.id] - v.stock;
              return (
                <div key={v.id} className={`spanel__size ${delta ? "changed" : ""}`}>
                  <div className="spanel__label">
                    <b>{v.size}</b>
                    <small>
                      {v.sku ? `SKU ${v.sku}` : "No SKU"}
                      {v.reserved > 0 && ` · ${v.reserved} held for unconfirmed orders`}
                      {v.waiting > 0 && ` · ${v.waiting} waiting for it`}
                    </small>
                  </div>
                  {delta !== 0 && <span className={`spanel__delta ${delta > 0 ? "up" : "down"}`}>{delta > 0 ? `+${delta}` : delta}</span>}
                  <div className="stepper">
                    <button type="button" onClick={() => step(v, -1)} disabled={values[v.id] <= v.reserved} aria-label={`One less ${v.size}`}>−</button>
                    <input
                      type="number" inputMode="numeric" min={v.reserved} value={values[v.id]} aria-label={`${v.size} on hand`}
                      onChange={(e) => set(v, parseInt(e.target.value, 10) || 0)} onFocus={(e) => e.target.select()}
                    />
                    <button type="button" onClick={() => step(v, 1)} aria-label={`One more ${v.size}`}>+</button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="spanel__history">
            <span className="sc__label">Recent changes</span>
            {history === null ? <p className="dim">Loading…</p> : history.length ? (
              <ul>
                {history.map((h) => (
                  <li key={h.id}>
                    <span className={`spanel__delta ${h.delta > 0 ? "up" : h.delta < 0 ? "down" : ""}`}>{h.delta > 0 ? `+${h.delta}` : h.delta || `−${h.qty}`}</span>
                    <span><b>{h.size}</b> · {h.note}<small>{h.by} · {h.when}</small></span>
                  </li>
                ))}
              </ul>
            ) : <p className="dim">No changes recorded yet.</p>}
          </div>
        </div>

        <footer className={`spanel__foot ${changes.length ? "on" : ""}`}>
          {error && <div className="note note--bad" role="alert" style={{ margin: 0 }}>{error}</div>}
          {done && !changes.length && <div className="note note--ok" role="status" style={{ margin: 0 }}>Saved. Stock is up to date{product.variants.some((v) => v.waiting) ? " and waiting customers are told when a size is back" : ""}.</div>}
          {changes.length > 0 && (
            <>
              <span className="sc__label" style={{ margin: 0 }}>Why did it change?</span>
              <div className="spanel__reasons" role="radiogroup" aria-label="Why did it change?">
                {STOCK_REASONS.filter(fits).map(([t, label]) => (
                  <button key={t} type="button" role="radio" aria-checked={type === t} className={type === t ? "on" : ""} onClick={() => { setType(t); setPicked(true); }}>{t === "count" ? "Recount" : label}</button>
                ))}
              </div>
              <input className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="Note for the log (optional): supplier, invoice no…" />
              <div className="spanel__actions">
                <button type="button" className="btn btn--ghost" onClick={() => setValues(Object.fromEntries(product.variants.map((v) => [v.id, v.stock])))} disabled={saving}>Undo</button>
                <button type="button" className="btn" onClick={save} disabled={saving}>{saving ? "Saving…" : `Save ${changes.length} ${changes.length === 1 ? "change" : "changes"}`}</button>
              </div>
            </>
          )}
        </footer>
      </div>
    </div>
  );
}
