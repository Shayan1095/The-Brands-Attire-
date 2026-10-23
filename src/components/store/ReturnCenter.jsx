"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { requestCaseAction } from "@/lib/store-actions";
import { CASE_REASONS, money } from "@/lib/format";
import { Icon } from "./icons";
import { CopyButton } from "./Track";

const TYPES = [
  ["exchange", "Exchange", "Swap for another size or colour", "refresh"],
  ["return", "Return for a refund", "Send it back and get your money back", "cash"],
  ["complaint", "Report a problem", "Something wrong with the order or delivery", "chat"],
];
const REASONS = {
  exchange: ["size", "defective", "wrong_item", "not_as_described", "quality", "changed_mind", "other"],
  return: ["size", "defective", "wrong_item", "not_as_described", "quality", "changed_mind", "other"],
  complaint: ["defective", "wrong_item", "not_as_described", "quality", "late", "service", "other"],
};
const STEPS = [["requested", "Requested"], ["approved", "Approved"], ["in_transit", "Pickup booked"], ["received", "Collected"], ["resolved", "Done"]];
const fault = (r) => Boolean(CASE_REASONS[r]?.[1]);
const ease = [0.16, 1, 0.3, 1];

/**
 * Returns, exchanges and problems on the customer's order page: their requests with progress (the brand sends a
 * rider or courier to collect, so the customer only sees who is coming and when), and a short form to start a new one. Only what the store's return rules
 * allow is offered; the server checks again. See lib/cases.js.
 */
export default function ReturnCenter({ token, options, cases, instructions, until, currency }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState("");
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [picks, setPicks] = useState({}); // order item id -> { qty, want }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState("");

  const isFault = fault(reason);
  // which kinds of request are possible right now, and why not when they are not
  const kinds = TYPES.map(([key, label, sub, icon]) => {
    let why = "";
    if (!options.types[key]) why = key === "complaint" ? "Available once your order has been sent" : `Only within ${options.window} days of delivery`;
    else if (key === "exchange" && !options.rules.exchanges) why = "Only for faulty or wrong items";
    else if (key === "return" && !options.rules.refunds) why = "Only for faulty or wrong items";
    return { key, label, sub, icon, off: !options.types[key], why };
  });
  const reasons = (REASONS[type] || []).filter((r) => {
    if (type === "exchange" && !options.rules.exchanges) return fault(r);
    if (type === "return" && !options.rules.refunds) return fault(r);
    return true;
  });
  const itemBlocked = (i) => (type !== "complaint" && i.free < 1 ? "Already in a request"
    : type !== "complaint" && i.sale && !options.rules.sale_items && !isFault ? "Sale items are final unless faulty or wrong"
    : type === "exchange" && !i.swaps.length ? "No other size in stock right now" : "");

  const chosen = useMemo(() => Object.entries(picks).filter(([, v]) => v.qty > 0).map(([id, v]) => ({ orderItemId: Number(id), qty: v.qty, wantVariantId: v.want || null })), [picks]);
  const ready = type && reason && (type === "complaint" ? details.trim() || chosen.length : chosen.length && (type !== "exchange" || chosen.every((c) => c.wantVariantId)));

  const toggle = (i) => setPicks((p) => (p[i.id]?.qty ? { ...p, [i.id]: { ...p[i.id], qty: 0 } } : { ...p, [i.id]: { qty: Math.min(1, i.free || 1), want: p[i.id]?.want || "" } }));
  const patch = (id, v) => setPicks((p) => ({ ...p, [id]: { ...p[id], ...v } }));
  const reset = () => { setType(""); setReason(""); setDetails(""); setPicks({}); setError(""); };

  const submit = async () => {
    setBusy(true); setError("");
    const res = await requestCaseAction(token, { type, reason, details, items: chosen }).catch(() => ({ error: "Your request could not be sent. Please try again." }));
    setBusy(false);
    if (res?.error) return setError(res.error);
    setSent(res.number); setOpen(false); reset();
    router.refresh();
  };

  const any = kinds.some((k) => !k.off);
  if (!cases.length && !any) return null;

  return (
    <section className="rma" id="returns" aria-labelledby="rma-title">
      <header className="rma__head">
        <div>
          <span className="eyebrow">Returns & exchanges</span>
          <h2 id="rma-title">{cases.length ? "Your requests" : "Need to send something back?"}</h2>
          <p>
            {options.open
              ? <>Exchange or return within {options.window} days of delivery{until ? <>, until <b>{until}</b></> : ""}.</>
              : options.types.complaint ? "Something not right? Tell us and we will sort it out." : null}
          </p>
        </div>
        {any && !open && <button type="button" className="btn" onClick={() => { setOpen(true); setSent(""); }}>Start a request <span aria-hidden>→</span></button>}
      </header>

      {sent && (
        <motion.div className="rma__sent" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease }} role="status">
          <span className="rma__tick"><Icon name="check" /></span>
          <div><b>Request {sent} sent</b><span>We will review it and message you shortly. You can follow it right here.</span></div>
        </motion.div>
      )}

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            className="rma__form" key="form"
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.45, ease }}
          >
            <div className="rma__inner">
              <span className="rma__step">1 · What would you like?</span>
              <div className="rma__kinds" role="radiogroup" aria-label="What would you like?">
                {kinds.map((k) => (
                  <button
                    key={k.key} type="button" role="radio" aria-checked={type === k.key} disabled={k.off}
                    className={`rma__kind ${type === k.key ? "on" : ""}`} onClick={() => { setType(k.key); setReason(""); setPicks({}); setError(""); }}
                  >
                    <Icon name={k.icon} />
                    <b>{k.label}</b>
                    <small>{k.why || k.sub}</small>
                  </button>
                ))}
              </div>

              {type && (
                <>
                  <span className="rma__step">2 · Why?</span>
                  <div className="rma__reasons" role="radiogroup" aria-label="Why?">
                    {reasons.map((r) => (
                      <button key={r} type="button" role="radio" aria-checked={reason === r} className={reason === r ? "on" : ""} onClick={() => setReason(r)}>{CASE_REASONS[r][0]}</button>
                    ))}
                  </div>
                </>
              )}

              {type && reason && (
                <>
                  <span className="rma__step">3 · {type === "complaint" ? "Which pieces? (optional)" : type === "exchange" ? "Which pieces, and what instead?" : "Which pieces?"}</span>
                  <ul className="rma__items">
                    {options.items.map((i) => {
                      const blocked = itemBlocked(i);
                      const p = picks[i.id] || { qty: 0, want: "" };
                      const max = type === "complaint" ? i.qty : i.free;
                      return (
                        <li key={i.id} className={`${p.qty ? "on" : ""} ${blocked ? "is-off" : ""}`}>
                          <label className="rma__pick">
                            <input type="checkbox" checked={p.qty > 0} disabled={Boolean(blocked)} onChange={() => toggle(i)} />
                            {i.image ? <img src={i.image} alt="" width="48" height="60" /> : <i />}
                            <span><b>{i.name}</b><small>{blocked || `Size ${i.size}`}</small></span>
                          </label>
                          {p.qty > 0 && (
                            <div className="rma__opts">
                              {max > 1 && (
                                <span className="rma__qty">
                                  <button type="button" onClick={() => patch(i.id, { qty: Math.max(1, p.qty - 1) })} aria-label="One less">−</button>
                                  <b>{p.qty}</b>
                                  <button type="button" onClick={() => patch(i.id, { qty: Math.min(max, p.qty + 1) })} aria-label="One more">+</button>
                                </span>
                              )}
                              {type === "exchange" && (
                                <select value={p.want} onChange={(e) => patch(i.id, { want: Number(e.target.value) || "" })} aria-label={`New size for ${i.name}`}>
                                  <option value="">Swap for…</option>
                                  {i.swaps.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                                </select>
                              )}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>

                  <span className="rma__step">4 · {type === "complaint" ? "What happened?" : "Anything to add? (optional)"}</span>
                  <textarea className="rma__text" rows={3} maxLength={1500} value={details} onChange={(e) => setDetails(e.target.value)}
                    placeholder={type === "complaint" ? "Tell us what went wrong. Photos can be sent on WhatsApp." : "For example: the fit is tight at the shoulders."} />
                </>
              )}

              {error && <p className="rma__error" role="alert">{error}</p>}
              <div className="rma__actions">
                <button type="button" className="btn btn--ghost" onClick={() => { setOpen(false); reset(); }} disabled={busy}>Cancel</button>
                <button type="button" className="btn" onClick={submit} disabled={!ready || busy}>{busy ? "Sending…" : "Send request"}</button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {cases.length > 0 && (
        <ul className="rma__cases">
          {cases.map((c) => <CaseCard key={c.id} c={c} instructions={instructions} currency={currency} />)}
        </ul>
      )}
    </section>
  );
}

/** One request: what it is, how far it has got, and who is coming to collect it. */
function CaseCard({ c, instructions, currency }) {
  const declined = c.status === "rejected";
  const parcel = c.type !== "complaint";
  const steps = parcel ? STEPS : [STEPS[0], STEPS[4]];
  const at = steps.findIndex(([k]) => k === c.status);
  const label = { exchange: "Exchange", return: "Return", complaint: "Problem report" }[c.type];
  const swap = c.pickup_method === "swap";
  const day = c.pickup_date ? new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" }).format(new Date(`${c.pickup_date}T12:00:00`)) : "";

  return (
    <li className={`rma__case ${declined ? "is-bad" : c.status === "resolved" ? "is-ok" : ""}`}>
      <div className="rma__casehead">
        <div><span className="rma__no">{c.number}</span><b>{label}</b><small>{CASE_REASONS[c.reason]?.[0]}</small></div>
        <span className="rma__status">{c.status_label}</span>
      </div>
      {c.items.length > 0 && (
        <ul className="rma__lines">
          {c.items.map((i, n) => <li key={n}>{i.name} · {i.size} × {i.qty}{i.want_size && <> <span aria-hidden>→</span> <b>{i.want_size}</b></>}</li>)}
        </ul>
      )}
      {!declined && (
        <ol className="rma__track" style={{ "--n": steps.length, "--at": Math.max(0, at) }} aria-label="Progress">
          {steps.map(([k, l], i) => <li key={k} className={i <= at ? "done" : ""} aria-current={i === at ? "step" : undefined}><i />{l}</li>)}
        </ol>
      )}
      {c.staff_note && <p className="rma__note">{c.staff_note}</p>}
      {c.credit_code && (
        <p className="rma__code"><span>Your store credit code</span><code>{c.credit_code}</code><CopyButton text={c.credit_code} label="Copy code" /></p>
      )}

      {c.status === "approved" && parcel && (
        <div className="rma__ship">
          <p>{instructions}</p>
          <p className="rma__pickup"><Icon name="truck" /> We are arranging the pickup and will message you who is coming and when. You do not need to post anything.</p>
        </div>
      )}
      {c.status === "in_transit" && (
        <div className="rma__ship">
          <p className="rma__pickup">
            <Icon name="truck" />
            <span>
              {swap
                ? <><b>{c.return_courier || "Our delivery partner"}</b> will bring your new size and collect the old piece at the same time{day ? <>, on <b>{day}</b></> : ""}.</>
                : <><b>{c.return_courier}</b> will collect it{day ? <> on <b>{day}</b></> : " in the next few days"}{c.return_tracking ? ` (booking ${c.return_tracking})` : ""}.</>}
              {swap && (c.exchange_total > 0 ? ` Please keep ${money(c.exchange_total, currency)} ready for the exchange delivery.` : " There is nothing to pay.")}
            </span>
          </p>
          <p className="rma__hint">{instructions}</p>
        </div>
      )}
      {c.status === "received" && <p className="rma__note">We have your piece back and are sorting out the rest. You will hear from us shortly.</p>}
      {c.exchange_token && <a className="link-arrow" href={`/order/${c.exchange_token}`}>{swap && c.status === "in_transit" ? "Follow your new size" : "Follow your replacement"} {c.exchange_number}</a>}
    </li>
  );
}
