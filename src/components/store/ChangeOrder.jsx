"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { changeOrderAction, cancelOrderAction } from "@/lib/store-actions";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Icon } from "./icons";

/**
 * After confirming, the customer's short window to change the order (another size, a different quantity, removing
 * a piece, a new delivery address) or cancel it, before it is packed. See customerChange in lib/orders.js.
 *
 * items   [{ id, name, image, size, qty, variantId, price, options: [{ id, label, max }] }]
 * until   when the window closes (already formatted), address / city / notes as on the order
 */
export default function ChangeOrder({ token, items, until, address, city, notes, currency }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [asking, setAsking] = useState(false);
  const [rows, setRows] = useState(() => items.map((i) => ({ id: i.id, variantId: i.variantId, qty: i.qty })));
  const [where, setWhere] = useState({ address, city, notes: notes || "" });
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [pending, start] = useTransition();
  const fmt = (n) => `${currency} ${Math.round(n).toLocaleString("en-US")}`;
  const patch = (id, v) => setRows((r) => r.map((x) => (x.id === id ? { ...x, ...v } : x)));
  const total = rows.reduce((s, r) => s + (items.find((i) => i.id === r.id)?.price || 0) * r.qty, 0);
  const kept = rows.filter((r) => r.qty > 0).length;

  const save = () =>
    start(async () => {
      setError(""); setSaved("");
      const res = await changeOrderAction(token, { items: rows, ...where }).catch(() => ({ error: "Could not save. Please try again." }));
      if (res?.error) return setError(res.error);
      setSaved(res.unchanged ? "Nothing was changed." : "Saved. Your order is updated and we sent you the new summary.");
      setOpen(false);
      router.refresh();
    });

  const cancel = () =>
    start(async () => {
      setError("");
      const res = await cancelOrderAction(token).catch(() => ({ error: "Could not cancel. Please try again." }));
      if (res?.error) { setError(res.error); setAsking(false); return; }
      setAsking(false);
      router.refresh();
    });

  return (
    <div className="ordr__card chg">
      <span className="ordr__label"><Icon name="clock" /> You can still change this order</span>
      <p>Until <b>{until}</b> you can switch sizes, change quantities, update the delivery address, or cancel. After that, or once it is packed, it is final.</p>
      <AnimatePresence>
        {saved && <motion.p className="chg__ok" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}>{saved}</motion.p>}
        {error && !open && <motion.p className="form-error" role="alert" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}>{error}</motion.p>}
      </AnimatePresence>
      <div className="chg__actions">
        <button type="button" className="btn" onClick={() => { setError(""); setOpen(true); }} disabled={pending}>Change my order</button>
        <button type="button" className="oa__cancel" onClick={() => setAsking(true)} disabled={pending}>Cancel this order</button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sizeguide chg__dialog">
          <DialogTitle className="sizeguide__title">Change your order</DialogTitle>
          <DialogDescription className="sizeguide__sub">Pick another size, change how many, or remove a piece. Prices stay as you ordered them.</DialogDescription>
          <ul className="chg__items">
            {items.map((i) => {
              const r = rows.find((x) => x.id === i.id);
              const opt = i.options.find((o) => o.id === r.variantId) || { max: i.qty };
              return (
                <li key={i.id} className={r.qty === 0 ? "is-removed" : ""}>
                  {i.image ? <img src={i.image} alt="" /> : <span className="chg__noimg" />}
                  <div className="chg__what">
                    <b>{i.name}</b>
                    <label className="chg__size">
                      <span>Size</span>
                      <select value={r.variantId} onChange={(e) => { const id = Number(e.target.value); const max = i.options.find((o) => o.id === id)?.max || 1; patch(i.id, { variantId: id, qty: Math.min(Math.max(r.qty, 1), max) }); }} disabled={r.qty === 0}>
                        {i.options.map((o) => <option key={o.id} value={o.id} disabled={o.max < 1}>{o.label}{o.max < 1 ? " (sold out)" : ""}</option>)}
                      </select>
                    </label>
                  </div>
                  <div className="qty chg__qty">
                    <button type="button" onClick={() => patch(i.id, { qty: Math.max(0, r.qty - 1) })} aria-label={`One less ${i.name}`} disabled={r.qty === 0 || (r.qty === 1 && kept === 1)}>−</button>
                    <span>{r.qty}</span>
                    <button type="button" onClick={() => patch(i.id, { qty: Math.min(opt.max, r.qty + 1) })} aria-label={`One more ${i.name}`} disabled={r.qty >= opt.max}>+</button>
                  </div>
                  {r.qty === 0 && <button type="button" className="chg__undo" onClick={() => patch(i.id, { qty: 1 })}>Undo</button>}
                </li>
              );
            })}
          </ul>
          <div className="chg__where">
            <label><span>Delivery address</span><input value={where.address} onChange={(e) => setWhere((w) => ({ ...w, address: e.target.value }))} maxLength={300} /></label>
            <label><span>City</span><input value={where.city} onChange={(e) => setWhere((w) => ({ ...w, city: e.target.value }))} maxLength={80} /></label>
            <label><span>Note for us (optional)</span><input value={where.notes} onChange={(e) => setWhere((w) => ({ ...w, notes: e.target.value }))} maxLength={500} /></label>
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="chg__foot">
            <span>Pieces: <b>{fmt(total)}</b> <small>(delivery and any discount are worked out when you save)</small></span>
            <div className="oa__dialog-actions">
              <button type="button" className="btn btn--ghost" onClick={() => setOpen(false)}>Keep it as it was</button>
              <button type="button" className="btn" onClick={save} disabled={pending}>{pending ? <span className="spinner" aria-hidden /> : "Save changes"}</button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={asking} onOpenChange={setAsking}>
        <DialogContent className="sizeguide oa__dialog">
          <DialogTitle className="sizeguide__title">Cancel this order?</DialogTitle>
          <DialogDescription className="sizeguide__sub">The pieces go back on sale straight away. This cannot be undone.</DialogDescription>
          <div className="oa__dialog-actions">
            <button type="button" className="btn btn--ghost" onClick={() => setAsking(false)}>Keep my order</button>
            <button type="button" className="btn btn--danger" disabled={pending} onClick={cancel}>{pending ? <span className="spinner" aria-hidden /> : "Yes, cancel it"}</button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
