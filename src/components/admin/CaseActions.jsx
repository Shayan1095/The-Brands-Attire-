"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { decideCaseAction, bookPickupAction, receiveCaseAction, resolveCaseAction, caseNoteAction, markDamagedAction, assignCaseAction } from "@/lib/admin-actions";

/** One button press that calls a server action, shows its error, and refreshes the page when it worked. */
function useRun() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const run = async (fn) => {
    setBusy(true); setError("");
    let res;
    try { res = await fn(); } catch { res = { error: "Something went wrong. Nothing was changed; please try again." }; }
    setBusy(false);
    if (res?.error) { setError(res.error); return false; }
    router.refresh();
    return true;
  };
  return { busy, error, run };
}

/**
 * "Next step" for a return / exchange / complaint: exactly the actions that fit where it is now.
 *   requested            -> approve or decline (with a message for the customer); a complaint can be settled at once
 *   approved             -> arrange the pickup: our rider or a courier, either swapping at the door (exchanges:
 *                           the new size goes out and the old piece comes back in one visit) or collecting only
 *   in_transit           -> a swap closes itself when its order is marked delivered; a collection is marked
 *                           collected here with each item's condition
 *   received             -> settle: replacement order, refund, store credit or nothing
 */
export default function CaseActions({ c, resolutions }) {
  const { busy, error, run } = useRun();
  const [note, setNote] = useState("");
  const canSwap = c.type === "exchange" && c.swaps > 0;
  const [method, setMethodP] = useState(canSwap ? "swap" : "collect");
  const isSwap = canSwap && method === "swap";
  const [by, setBy] = useState(c.by || (/rider/i.test(c.carrier) ? "rider" : "courier"));
  const [carrier, setCarrier] = useState(c.courier || c.carrier || "");
  const [ref, setRef] = useState(c.tracking || "");
  const [date, setDate] = useState(c.date || "");
  const [cond, setCond] = useState(() => Object.fromEntries(c.items.map((i) => [i.id, "restock"])));
  // the natural way to settle each kind of request
  const ways = Object.keys(resolutions).filter((k) => k !== "exchange" || c.swaps > 0);
  const [how, setHow] = useState(c.type === "exchange" && c.swaps ? "exchange" : c.type === "return" ? "refund" : "none");
  const [amount, setAmount] = useState(String(c.value || ""));
  const [paidBy, setPaidBy] = useState("");
  const [reference, setReference] = useState("");
  const parcel = c.type !== "complaint";

  const settle = (
    <div className="caseact__settle">
      <span className="sc__label" style={{ margin: 0 }}>How do you settle it?</span>
      <div className="choice" role="radiogroup" aria-label="How do you settle it?">
        {ways.map((k) => (
          <label key={k} className={how === k ? "on" : ""}>
            <input type="radio" name="how" checked={how === k} onChange={() => setHow(k)} />{resolutions[k]}
          </label>
        ))}
      </div>
      {how === "exchange" && <p className="hint">Creates a replacement order with the sizes asked for, confirmed and ready to pack{c.fee ? `, with a ${c.currency} ${c.fee} exchange delivery fee collected at the door` : ", nothing to pay"}. The customer is told.{c.short ? " One of the sizes is short in stock right now." : ""}</p>}
      {(how === "refund" || how === "credit") && (
        <div className="field" style={{ margin: 0 }}>
          <label>Amount ({c.currency})</label>
          <input type="number" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <small>{how === "credit" ? "A one-time code for this customer, valid 180 days." : "Pay it first (bank transfer, JazzCash, Easypaisa...), then record it here."}</small>
        </div>
      )}
      {how === "refund" && (
        <div className="frow">
          <div className="field" style={{ margin: 0 }}><label>Paid by</label><input value={paidBy} onChange={(e) => setPaidBy(e.target.value)} placeholder="Bank transfer, JazzCash…" /></div>
          <div className="field" style={{ margin: 0 }}><label>Reference (optional)</label><input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Transaction ID" /></div>
        </div>
      )}
      <div className="field" style={{ margin: 0 }}>
        <label>Message to the customer (optional)</label>
        <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Thank you for your patience." />
      </div>
      <button className="btn" disabled={busy} onClick={() => run(() => resolveCaseAction(c.id, { how, amount, method: paidBy, reference, note }))}>
        {busy ? "Working…" : how === "exchange" ? "Create replacement and close" : "Settle and close"}
      </button>
    </div>
  );

  return (
    <div className="card caseact">
      <h2>Next step</h2>
      {error && <div className="note note--bad" role="alert">{error}</div>}

      {c.status === "requested" && (
        <>
          <p className="sub">Check the reason and the rules, then decide. The customer is told straight away{parcel ? ", with your return instructions if you approve" : ""}.</p>
          <div className="field">
            <label>Message to the customer (optional)</label>
            <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder={parcel ? "Please pack it with the tags on." : "Sorry about this, we are sorting it out."} />
          </div>
          <div className="inline">
            {parcel && <button className="btn" disabled={busy} onClick={() => run(() => decideCaseAction(c.id, true, note))}>Approve</button>}
            <button className="btn btn--danger" disabled={busy} onClick={() => { if (window.confirm("Decline this request? The customer is told.")) run(() => decideCaseAction(c.id, false, note)); }}>Decline</button>
          </div>
          {!parcel && <div className="fold">{settle}</div>}
        </>
      )}

      {c.status === "approved" && (
        <>
          <p className="sub">Approved. Send someone to collect it: the customer never has to post anything.</p>
          <div className="caseact__settle">
            {canSwap && (
              <>
                <span className="sc__label" style={{ margin: 0 }}>How</span>
                <div className="choice" role="radiogroup" aria-label="How the pickup works">
                  <label className={method === "swap" ? "on" : ""}><input type="radio" name="method" checked={method === "swap"} onChange={() => setMethodP("swap")} />Swap at the door</label>
                  <label className={method === "collect" ? "on" : ""}><input type="radio" name="method" checked={method === "collect"} onChange={() => setMethodP("collect")} />Collect first</label>
                </div>
                <p className="hint">
                  {method === "swap"
                    ? `One visit: a replacement order is created now (the new size is held from stock), the rider delivers it and brings the old piece back. Marking that order delivered puts the old piece back in stock and closes this request.${c.fee ? ` The customer pays the ${c.currency} ${c.fee} exchange fee at the door.` : " Nothing to pay."}`
                    : "The rider collects the old piece first; you check it, then send the new size."}
                  {method === "swap" && c.short ? " One of the sizes is short in stock right now." : ""}
                </p>
              </>
            )}
            {isSwap ? (
              <div className="field" style={{ margin: 0 }}><label>Pickup day</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /><small>The courier is chosen when you dispatch the swap order, like any other parcel.</small></div>
            ) : (<>
            <span className="sc__label" style={{ margin: 0 }}>Who goes</span>
            <div className="seg" role="radiogroup" aria-label="Who collects">
              <button type="button" className={by === "rider" ? "active" : ""} onClick={() => { setBy("rider"); if (!carrier || !/rider/i.test(carrier)) setCarrier(/rider/i.test(c.carrier) ? c.carrier : "Our rider"); }}>Our rider</button>
              <button type="button" className={by === "courier" ? "active" : ""} onClick={() => { setBy("courier"); if (/rider/i.test(carrier)) setCarrier(/rider/i.test(c.carrier) ? "" : c.carrier); }}>Courier company</button>
            </div>
            <div className="frow">
              <div className="field" style={{ margin: 0 }}><label>{by === "rider" ? "Rider's name (optional)" : "Courier company (optional)"}</label><input value={carrier} onChange={(e) => setCarrier(e.target.value)} placeholder={by === "rider" ? "Our rider" : "Leopards, TCS, M&P…"} /></div>
              <div className="field" style={{ margin: 0 }}><label>Pickup day</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            </div>
            {by === "courier" && <div className="field" style={{ margin: 0 }}><label>Booking number (optional)</label><input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Reverse pickup / consignment number" /></div>}
            </>)}
            <div className="field" style={{ margin: 0 }}><label>Note for the rider (optional)</label><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Call before arriving" /></div>
            <button className="btn" disabled={busy} onClick={() => run(() => bookPickupAction(c.id, { method: canSwap ? method : "collect", by, carrier, ref, date, note }))}>
              {busy ? "Working…" : method === "swap" && canSwap ? "Book the swap" : "Book the pickup"}
            </button>
            <small className="hint">The customer gets a message with who is coming and when.</small>
          </div>
          <details className="fold">
            <summary>Settle without a pickup</summary>
            {settle}
          </details>
        </>
      )}

      {c.status === "in_transit" && c.method === "swap" && (
        <>
          <p className="sub">Swap booked{c.courier ? <> with <b>{c.courier}</b></> : ""}{c.date ? ` for ${c.date}` : ""}: the new size goes out and the old piece comes back in the same visit.{c.courier ? "" : " Choose the courier when you dispatch the order."}</p>
          {c.swap && (
            <div className="caseact__swap">
              <span><b>Order {c.swap.number}</b><small>{c.swap.status}{c.swap.total ? ` · ${c.currency} ${c.swap.total} to collect` : " · nothing to collect"}</small></span>
              <Link href={`/admin/orders/${c.swap.id}`} className="btn btn--ghost btn--sm">Open order</Link>
            </div>
          )}
          <p className="hint">Pack and dispatch it like any order. When you mark it delivered, the old piece goes back in stock and this request closes by itself. If the swap is cancelled or refused, it comes back here to arrange again.</p>
        </>
      )}

      {c.status === "in_transit" && c.method !== "swap" && (
        <>
          <p className="sub">Pickup booked with <b>{c.courier}</b>{c.tracking ? ` (${c.tracking})` : ""}{c.date ? ` for ${c.date}` : ""}.</p>
          <div className="caseact__receive">
            <span className="sc__label" style={{ margin: "14px 0 4px" }}>When it is back with you: check each piece</span>
            {c.items.map((i) => (
              <div key={i.id} className="caseact__item">
                <span><b>{i.name}</b><small>Size {i.size} × {i.qty}</small></span>
                <div className="seg" role="radiogroup" aria-label={`Condition of ${i.name}`}>
                  <button type="button" className={cond[i.id] === "restock" ? "active" : ""} onClick={() => setCond((s) => ({ ...s, [i.id]: "restock" }))}>Back in stock</button>
                  <button type="button" className={cond[i.id] === "damaged" ? "active" : ""} onClick={() => setCond((s) => ({ ...s, [i.id]: "damaged" }))}>Damaged</button>
                </div>
              </div>
            ))}
            <button className="btn" disabled={busy} onClick={() => run(() => receiveCaseAction(c.id, cond))}>{busy ? "Working…" : "Mark collected"}</button>
          </div>
          <details className="fold">
            <summary>Settle without waiting</summary>
            {settle}
          </details>
        </>
      )}

      {c.status === "received" && (
        <>
          <p className="sub">Collected, checked and stock is updated. Settle it to close the request.</p>
          {settle}
        </>
      )}

      {c.status === "resolved" && <p className="sub">Closed. Nothing more to do.{c.method === "swap" ? " The swap was delivered and the old piece is back in stock; if it came back damaged, write it off on the left." : ""}</p>}
      {c.status === "rejected" && <p className="sub">Declined. The customer was told why.</p>}
    </div>
  );
}

/** A note for the team on the activity list (the customer does not see it). */
export function CaseNote({ id }) {
  const { busy, error, run } = useRun();
  const [text, setText] = useState("");
  return (
    <>
      {error && <div className="note note--bad" style={{ marginTop: 12 }}>{error}</div>}
      <div className="inline" style={{ marginTop: 14 }}>
        <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a note for the team…" style={{ flex: 1 }} />
        <button className="btn btn--ghost" disabled={busy || !text.trim()} onClick={async () => { if (await run(() => caseNoteAction(id, text))) setText(""); }}>Add note</button>
      </div>
    </>
  );
}

/** Who looks after this request. They get an email when it is given to them. */
export function CaseAssign({ id, assigned, staff }) {
  const { busy, error, run } = useRun();
  return (
    <div className="card">
      <h2>Handled by</h2>
      {error && <div className="note note--bad">{error}</div>}
      <select className="input" value={assigned} disabled={busy} onChange={(e) => run(() => assignCaseAction(id, e.target.value))} aria-label="Handled by" style={{ width: "100%" }}>
        <option value="">Nobody yet</option>
        {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
      <small className="hint" style={{ display: "block", marginTop: 8 }}>They are emailed a link to this request. A swap order is assigned to them too.</small>
    </div>
  );
}

/** A piece put back in stock that turned out damaged after all. */
export function DamagedButton({ caseId, itemId }) {
  const { busy, error, run } = useRun();
  return (
    <>
      <button type="button" className="link caseitem__dmg" disabled={busy}
        onClick={() => { if (window.confirm("Write this piece off as damaged? It is taken back out of stock.")) run(() => markDamagedAction(caseId, itemId)); }}>
        {busy ? "Working…" : "It came back damaged"}
      </button>
      {error && <small className="bad">{error}</small>}
    </>
  );
}
