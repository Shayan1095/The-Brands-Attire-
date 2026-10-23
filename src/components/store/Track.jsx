"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { trackOrderAction, recentOrdersAction } from "@/lib/store-actions";
import { STAGES, stageOf } from "@/lib/order-stages";
import { useStore } from "./Shell";
import { Icon } from "./icons";

export const ORDERS_KEY = "tba_orders"; // orders placed from this device: [{ number, token, at }]
const EASE = [0.16, 1, 0.3, 1];
const SHAKE = [{ translate: "0" }, { translate: "-8px" }, { translate: "8px" }, { translate: "-5px" }, { translate: "5px" }, { translate: "0" }];

/**
 * Order lookup card inside the track page hero. Checks both fields as they are typed; on a match it shows
 * "found" for a moment and opens the order; on a miss the card shakes with the reason.
 */
export function TrackForm() {
  const router = useRouter();
  const [state, action, pending] = useActionState(trackOrderAction, null);
  const [number, setNumber] = useState("");
  const [phone, setPhone] = useState("");
  const card = useRef(null);
  // our tracking number from the parcel slip (TBA-7K3Q-M9X2) needs no phone: it only shows where the parcel is
  const isRef = /^[A-Z0-9]{2,6}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(number.trim());
  const numberOk = isRef || /^(TBA-)?\d{3,}$/i.test(number.trim().replace(/^#/, ""));
  const phoneOk = phone.replace(/\D/g, "").length >= 10;
  const go = state?.token ? `/order/${state.token}` : state?.ref ? `/track/${state.ref}` : "";

  useEffect(() => {
    if (state?.error) { card.current?.animate(SHAKE, { duration: 420 }); navigator.vibrate?.([10, 40, 10]); }
    if (go) {
      navigator.vibrate?.(15);
      // "found" stays up for a moment, then the order opens (with the loading outline if it takes a while)
      const t = setTimeout(() => {
        window.dispatchEvent(new CustomEvent("tba:navigate", { detail: go }));
        router.push(go);
      }, 700);
      return () => clearTimeout(t);
    }
  }, [state, router, go]);

  return (
    <form action={action} className={`trackcard2 ${go ? "is-found" : ""}`} ref={card}>
      <AnimatePresence mode="wait" initial={false}>
        {go ? (
          <motion.div key="found" className="trackcard2__found" initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4, ease: EASE }}>
            <span className="trackcard2__tick" aria-hidden>
              <svg viewBox="0 0 64 64"><motion.path d="M18 33l9 9 19-21" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.45, ease: EASE }} /></svg>
            </span>
            <b>Found {state.number}</b>
            <span>Opening your order…</span>
          </motion.div>
        ) : (
          <motion.div key="form" className="trackcard2__form" exit={{ opacity: 0, scale: 0.96 }}>
            <span className="eyebrow">Find your order</span>
            <AnimatePresence>
              {state?.error && (
                <motion.p className="trackcard2__error" role="alert" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>{state.error}</motion.p>
              )}
            </AnimatePresence>
            <label className={`trackcard2__field ${numberOk ? "is-ok" : ""}`}>
              <span>Order or tracking number</span>
              <input name="number" required autoComplete="off" placeholder="TBA-1042" inputMode="text" autoCapitalize="characters" value={number} onChange={(e) => setNumber(e.target.value.toUpperCase())} />
              {numberOk && <Icon name="check" />}
            </label>
            {!isRef && <label className={`trackcard2__field ${phoneOk ? "is-ok" : ""}`}>
              <span>Phone used on the order</span>
              <input name="phone" type="tel" inputMode="tel" required autoComplete="tel" placeholder="0300 1234567" value={phone} onChange={(e) => setPhone(e.target.value)} />
              {phoneOk && <Icon name="check" />}
            </label>}
            <motion.button className="btn btn--block trackcard2__go" whileTap={{ scale: 0.98 }} disabled={pending}>
              {pending ? <><span className="spinner" aria-hidden /> Looking it up…</> : <>Track my order <span aria-hidden>→</span></>}
            </motion.button>
            <p className="fine">Both are in the message we sent you on WhatsApp and email right after you ordered. The tracking number on your parcel works on its own.</p>
          </motion.div>
        )}
      </AnimatePresence>
    </form>
  );
}

/** A small five-step line: where an order is right now. */
function MiniStages({ status }) {
  const at = stageOf(status);
  if (at < 0) return <span className="ministages ministages--off">{status === "returned" ? "Returned" : "Cancelled"}</span>;
  return (
    <span className="ministages" style={{ "--at": at / (STAGES.length - 1) }} aria-label={`${STAGES[at][1]}, step ${at + 1} of ${STAGES.length}`}>
      {STAGES.map(([key], i) => <i key={key} className={i < at ? "is-done" : i === at ? "is-now" : ""} />)}
    </span>
  );
}

/** Orders placed on this phone / computer: their live status, one tap to open, no numbers to type. */
export function RecentOrders() {
  const { fmt } = useStore();
  const [saved, setSaved] = useState([]);
  const [live, setLive] = useState(null);

  useEffect(() => {
    let list = [];
    try { list = JSON.parse(localStorage.getItem(ORDERS_KEY) || "[]"); } catch {}
    setSaved(list);
    if (list.length) recentOrdersAction(list.map((o) => o.token)).then(setLive).catch(() => setLive([]));
  }, []);
  if (!saved.length) return null;
  const orders = live || [];

  return (
    <section className="section--tight recent2">
      <div className="wrap">
        <div className="section__head">
          <div><span className="eyebrow">On this device</span><h2>Your recent orders</h2></div>
          <span className="fine">Kept on this device when you checked out · live status</span>
        </div>
        <div className="recent2__list">
          {!live && saved.slice(0, 3).map((o) => <span key={o.token} className="recent2__ghost" />)}
          {orders.map((o, i) => {
            const at = stageOf(o.status);
            const label = at >= 0 ? STAGES[at][1] : o.status === "returned" ? "Returned" : "Cancelled";
            return (
              <motion.div key={o.token} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06, duration: 0.5, ease: EASE }}>
                <Link href={`/order/${o.token}`} className={`recent2__item ${o.status === "pending" ? "is-waiting" : ""}`}>
                  <span className="recent2__pics">
                    {o.images.map((src, k) => <img key={k} src={src} alt="" width="48" height="60" loading="lazy" />)}
                  </span>
                  <span className="recent2__text">
                    <b>{o.number}</b>
                    <small>{new Date(o.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} · {o.pieces} {o.pieces === 1 ? "piece" : "pieces"} · {fmt(o.total)}</small>
                    <span className="recent2__status">
                      <em className={o.status === "pending" ? "is-warn" : at === 4 ? "is-ok" : at < 0 ? "is-bad" : ""}>{o.status === "pending" ? "Waiting for you to confirm" : label}</em>
                      <MiniStages status={o.status} />
                    </span>
                  </span>
                  <Icon name="arrow" />
                </Link>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/** Copies a number and confirms it for a moment. */
export function CopyButton({ text, label = "Copy" }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); } catch { return; }
    setDone(true);
    setTimeout(() => setDone(false), 1800);
  };
  return <button type="button" className="copy" onClick={copy}>{done ? "Copied ✓" : label}</button>;
}
