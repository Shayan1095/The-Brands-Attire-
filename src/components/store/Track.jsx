"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { trackOrderAction } from "@/lib/store-actions";
import { Icon } from "./icons";

export const ORDERS_KEY = "tba_orders"; // orders placed from this device: [{ number, token, at }]

/** Order lookup card that sits inside the track page hero. */
export function TrackForm() {
  const [state, action, pending] = useActionState(trackOrderAction, null);
  const [number, setNumber] = useState("");

  return (
    <form action={action} className="trackcard">
      <span className="eyebrow">Find your order</span>
      <AnimatePresence>
        {state?.error && (
          <motion.div className="form-error" role="alert" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>{state.error}</motion.div>
        )}
      </AnimatePresence>
      <label className="ffield">
        <input name="number" required placeholder=" " autoComplete="off" value={number} onChange={(e) => setNumber(e.target.value.toUpperCase())} />
        <span>Order number, e.g. TBA-1042</span>
      </label>
      <label className="ffield">
        <input name="phone" type="tel" required placeholder=" " autoComplete="tel" />
        <span>Phone number used on the order</span>
      </label>
      <motion.button className="btn btn--block" whileTap={{ scale: 0.98 }} disabled={pending}>
        {pending ? <><span className="spinner" aria-hidden /> Looking…</> : <>Track my order <span aria-hidden>→</span></>}
      </motion.button>
      <p className="fine">Both are in the confirmation message we sent you on WhatsApp and email.</p>
    </form>
  );
}

/** Orders placed on this phone / computer: one tap to their status, no numbers to type. */
export function RecentOrders() {
  const [orders, setOrders] = useState([]);
  useEffect(() => {
    try { setOrders(JSON.parse(localStorage.getItem(ORDERS_KEY) || "[]")); } catch {}
  }, []);
  if (!orders.length) return null;

  return (
    <section className="section--tight section--bone">
      <div className="wrap">
        <div className="section__head">
          <div><span className="eyebrow">On this device</span><h2>Your recent orders</h2></div>
          <span className="fine">Saved here when you checked out</span>
        </div>
        <div className="recent">
          {orders.map((o, i) => (
            <motion.div key={o.token} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06, duration: 0.5 }}>
              <Link href={`/order/${o.token}`} className="recent__item">
                <span className="recent__icon"><Icon name="bag" /></span>
                <span><b>{o.number}</b><small>Placed {new Date(o.at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</small></span>
                <Icon name="arrow" />
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Copies a tracking number and confirms it for a moment. */
export function CopyButton({ text }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); } catch { return; }
    setDone(true);
    setTimeout(() => setDone(false), 1800);
  };
  return <button className="copy" onClick={copy}>{done ? "Copied ✓" : "Copy"}</button>;
}
