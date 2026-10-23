"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { subscriptionAction } from "@/lib/store-actions";
import { Icon } from "./icons";

const EASE = [0.16, 1, 0.3, 1];

/** One tap to switch on new-arrival and sale messages on every channel the customer gave us. */
export default function JoinUpdates({ token, already, via }) {
  const [on, setOn] = useState(already);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  const join = () =>
    start(async () => {
      setError("");
      const res = await subscriptionAction(token, { email: true, whatsapp: true });
      if (res.error) return setError(res.error);
      setOn(res.email || res.whatsapp);
      navigator.vibrate?.(15);
    });

  return (
    <div className="prefs">
      <AnimatePresence mode="wait" initial={false}>
        {on ? (
          <motion.div key="on" className="prefs__done" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: EASE }}>
            <span className="prefs__tick" aria-hidden><Icon name="check" /></span>
            <h2 className="display">You are in.</h2>
            <p>You will hear about new pieces and sales before anyone else{via ? ` by ${via}` : ""}.</p>
            <div className="prefs__actions">
              <Link href="/products" className="btn">See what is new</Link>
              <Link href={`/unsubscribe/${token}`} className="link-arrow">Choose channels</Link>
            </div>
          </motion.div>
        ) : (
          <motion.div key="ask" className="prefs__done" exit={{ opacity: 0, y: -8 }}>
            <h2 className="display">One tap and you are in.</h2>
            <p>We will use the {via || "details"} from your order. Nothing to fill in.</p>
            {error && <p className="prefs__error" role="alert">{error}</p>}
            <div className="prefs__actions">
              <button type="button" className="btn" onClick={join} disabled={pending}>{pending ? "Adding you…" : "Keep me posted"}</button>
              <Link href="/products" className="link-arrow">Just browsing</Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
