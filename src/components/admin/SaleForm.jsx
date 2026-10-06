"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { saveSaleAction } from "@/lib/admin-actions";

/**
 * Dropdown for choosing several products: search box, products grouped by category with tick boxes,
 * and the chosen ones shown as removable chips. Submits as repeated `name` fields.
 */
export function ProductPicker({ products, name = "product_ids", selected, onChange }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const box = useRef(null);

  useEffect(() => {
    if (!open) return;
    const away = (e) => { if (!box.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [open]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle ? products.filter((p) => `${p.name} ${p.category}`.toLowerCase().includes(needle)) : products;
  }, [products, q]);
  const groups = useMemo(() => {
    const map = new Map();
    for (const p of shown) map.set(p.category, [...(map.get(p.category) || []), p]);
    return [...map];
  }, [shown]);

  const toggle = (id) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  const setMany = (ids, on) => onChange(on ? [...new Set([...selected, ...ids])] : selected.filter((x) => !ids.includes(x)));
  const chosen = products.filter((p) => selected.includes(p.id));

  return (
    <div className="picker" ref={box}>
      {selected.map((id) => <input key={id} type="hidden" name={name} value={id} />)}
      <button type="button" className={`picker__button ${open ? "open" : ""}`} onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-haspopup="listbox">
        <span>{selected.length ? `${selected.length} ${selected.length === 1 ? "product" : "products"} selected` : "Choose products…"}</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="m6 9 6 6 6-6" /></svg>
      </button>

      {open && (
        <div className="picker__panel">
          <input className="input" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products…" aria-label="Search products" />
          <div className="picker__bar">
            <span>{shown.length} shown</span>
            <span>
              <button type="button" className="link" onClick={() => setMany(shown.map((p) => p.id), true)}>Select all shown</button>
              {selected.length > 0 && <button type="button" className="link" onClick={() => onChange([])}>Clear</button>}
            </span>
          </div>
          <div className="picker__list" role="listbox" aria-multiselectable="true">
            {groups.map(([category, items]) => {
              const ids = items.map((p) => p.id);
              const all = ids.every((id) => selected.includes(id));
              return (
                <div key={category}>
                  <label className="picker__group">
                    <input type="checkbox" checked={all} onChange={(e) => setMany(ids, e.target.checked)} />
                    {category} <span>({items.length})</span>
                  </label>
                  {items.map((p) => (
                    <label key={p.id} className={`picker__item ${selected.includes(p.id) ? "on" : ""}`} role="option" aria-selected={selected.includes(p.id)}>
                      <input type="checkbox" checked={selected.includes(p.id)} onChange={() => toggle(p.id)} />
                      {p.image ? <img src={p.image} alt="" /> : <i />}
                      <span>{p.name}</span>
                      {p.status !== "active" && <small>{p.status}</small>}
                    </label>
                  ))}
                </div>
              );
            })}
            {!shown.length && <p className="dim" style={{ padding: 12 }}>No products match “{q}”.</p>}
          </div>
          <div className="picker__foot"><button type="button" className="btn btn--sm" onClick={() => setOpen(false)}>Done</button></div>
        </div>
      )}

      {chosen.length > 0 && (
        <div className="picker__chips">
          {chosen.map((p) => <button type="button" key={p.id} onClick={() => toggle(p.id)} aria-label={`Remove ${p.name}`}>{p.name} <span aria-hidden>✕</span></button>)}
        </div>
      )}
    </div>
  );
}

/** "Start a sale" form. Only shows the category or product chooser when that scope is picked. */
export default function SaleForm({ categories, products, subscribers }) {
  const [scope, setScope] = useState("all");
  const [selected, setSelected] = useState([]);

  return (
    <form action={saveSaleAction}>
      <div className="frow">
        <div className="field"><label>Sale name</label><input name="name" required placeholder="Winter clearance" /></div>
        <div className="field"><label>Discount %</label><input name="percent" type="number" min="1" max="95" required placeholder="20" /></div>
      </div>

      <div className="field">
        <label>Applies to</label>
        <div className="choice" role="radiogroup" aria-label="Applies to">
          {[["all", "Every product"], ["category", "One category"], ["products", "Chosen products"]].map(([value, label]) => (
            <label key={value} className={scope === value ? "on" : ""}>
              <input type="radio" name="scope" value={value} checked={scope === value} onChange={() => setScope(value)} />{label}
            </label>
          ))}
        </div>
      </div>

      {scope === "category" && (
        <div className="field">
          <label>Category</label>
          <select name="category_id" defaultValue="" required>
            <option value="" disabled>Choose a category…</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      )}
      {scope === "products" && (
        <div className="field">
          <label>Products</label>
          <ProductPicker products={products} selected={selected} onChange={setSelected} />
        </div>
      )}

      <div className="frow">
        <div className="field"><label>Starts</label><input name="starts_at" type="datetime-local" /><small>Empty = now</small></div>
        <div className="field"><label>Ends</label><input name="ends_at" type="datetime-local" /><small>Empty = until you stop it</small></div>
      </div>
      <label className="check"><input type="checkbox" name="announce" /> Announce this sale to {subscribers} subscribers (email + WhatsApp)</label>
      <button className="btn" disabled={scope === "products" && selected.length === 0}>Create sale</button>
      {scope === "products" && selected.length === 0 && <small className="hint">Choose at least one product first.</small>}
    </form>
  );
}
