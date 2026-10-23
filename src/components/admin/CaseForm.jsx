"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { openCaseAction } from "@/lib/admin-actions";
import { CASE_TYPES, CASE_REASONS } from "@/lib/format";

/**
 * Staff open a return, exchange or complaint for a customer who phoned or messaged.
 * The store's rules are shown but staff may go outside them; the request is then marked as such.
 */
export default function CaseForm({ orderId, options, warning }) {
  const router = useRouter();
  const [type, setType] = useState("exchange");
  const [reason, setReason] = useState("size");
  const [details, setDetails] = useState("");
  const [picks, setPicks] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const patch = (id, v) => setPicks((p) => ({ ...p, [id]: { qty: 0, want: "", ...p[id], ...v } }));
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError("");
    const items = Object.entries(picks).filter(([, v]) => v.qty > 0).map(([id, v]) => ({ orderItemId: Number(id), qty: v.qty, wantVariantId: v.want || null }));
    const res = await openCaseAction(orderId, { type, reason, details, items }).catch(() => ({ error: "Something went wrong. Please try again." }));
    setBusy(false);
    if (res?.error) return setError(res.error);
    router.push(`/admin/returns/${res.id}`);
  };

  return (
    <form className="card" onSubmit={submit}>
      {warning && <div className="note note--warn">{warning}</div>}
      {error && <div className="note note--bad" role="alert">{error}</div>}
      <div className="frow">
        <div className="field">
          <label>What does the customer want?</label>
          <select value={type} onChange={(e) => setType(e.target.value)}>
            {Object.entries(CASE_TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Why?</label>
          <select value={reason} onChange={(e) => setReason(e.target.value)}>
            {Object.entries(CASE_REASONS).map(([k, [l, isFault]]) => <option key={k} value={k}>{l}{isFault ? " (our fault)" : ""}</option>)}
          </select>
        </div>
      </div>

      <div className="field">
        <label>Pieces</label>
        <div className="pick">
          {options.items.map((i) => {
            const p = picks[i.id] || { qty: 0, want: "" };
            const max = type === "complaint" ? i.qty : i.free;
            return (
              <div className="pick__row" key={i.id}>
                <div className="cell-prod">
                  {i.image ? <img src={i.image} alt="" /> : <i />}
                  <span><b>{i.name}</b><small>Size {i.size} · bought {i.qty}{i.free < i.qty ? ` · ${i.qty - i.free} already in a request` : ""}{i.sale ? " · sale item" : ""}</small></span>
                </div>
                <div className="inline">
                  <select className="input" style={{ width: 110 }} value={p.qty} onChange={(e) => patch(i.id, { qty: Number(e.target.value) })} aria-label={`How many ${i.name}`} disabled={max < 1}>
                    {Array.from({ length: max + 1 }, (_, n) => <option key={n} value={n}>{n ? `${n} piece${n > 1 ? "s" : ""}` : "None"}</option>)}
                  </select>
                  {type === "exchange" && p.qty > 0 && (
                    <select className="input" style={{ width: 160 }} value={p.want} onChange={(e) => patch(i.id, { want: Number(e.target.value) || "" })} aria-label="Swap for">
                      <option value="">Swap for…</option>
                      {i.swaps.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                    </select>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {type === "complaint" && <small>Optional for a complaint.</small>}
      </div>

      <div className="field">
        <label>Details (what the customer said)</label>
        <textarea value={details} onChange={(e) => setDetails(e.target.value)} rows={3} maxLength={1500} />
      </div>
      <button className="btn" disabled={busy}>{busy ? "Opening…" : "Open request"}</button>
    </form>
  );
}
