"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { adjustStockAction } from "@/lib/admin-actions";
import { STOCK_REASONS } from "@/lib/format";

/** Stock change with a reason: supplier delivery, damage, loss or a recount. */
export default function StockAdjust({ products }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(adjustStockAction, null);
  const [productId, setProductId] = useState("");
  const [type, setType] = useState("supplier");
  const product = products.find((p) => String(p.id) === productId);
  const reason = STOCK_REASONS.find(([t]) => t === type);

  useEffect(() => { if (state?.ok) router.refresh(); }, [state, router]);

  return (
    <form action={action}>
      {state?.error && <div className="note note--bad" role="alert">{state.error}</div>}
      {state?.ok && <div className="note note--ok" role="status">{state.message}</div>}
      <div className="field">
        <label>Product</label>
        <select value={productId} onChange={(e) => setProductId(e.target.value)} required>
          <option value="" disabled>Choose a product…</option>
          {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      <div className="field">
        <label>Size</label>
        <select name="variant_id" required defaultValue="" key={productId} disabled={!product}>
          <option value="" disabled>Choose a size…</option>
          {product?.variants.map((v) => <option key={v.id} value={v.id}>{v.size} · {v.stock} on hand</option>)}
        </select>
      </div>
      <div className="field">
        <label>What happened?</label>
        <select name="type" value={type} onChange={(e) => setType(e.target.value)}>
          {STOCK_REASONS.map(([value, label, dir]) => <option key={value} value={value}>{label}{dir > 0 ? " (adds)" : dir < 0 ? " (removes)" : " (sets the number)"}</option>)}
        </select>
      </div>
      <div className="frow">
        <div className="field"><label>{reason[2] === 0 ? "Counted on hand" : "How many units"}</label><input name="qty" type="number" min="0" required /></div>
        <div className="field"><label>Note (optional)</label><input name="note" maxLength={200} placeholder="Supplier, invoice no…" /></div>
      </div>
      <button className="btn btn--sm" disabled={pending}>{pending ? "Saving…" : "Record change"}</button>
    </form>
  );
}
