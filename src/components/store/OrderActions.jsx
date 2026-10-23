"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { confirmOrderAction, cancelOrderAction } from "@/lib/store-actions";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import CancelReasons from "./CancelReasons";
import { Icon } from "./icons";

/** Confirm / cancel on the customer's order page while the order is waiting for them. */
export default function OrderActions({ token, policy, changeHours = 0 }) {
  const router = useRouter();
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState("");
  const [asking, setAsking] = useState(false); // the "cancel this order?" window
  const [done, setDone] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();

  const run = (action, after) =>
    start(async () => {
      setError("");
      const res = await action(token);
      if (res.error) { setError(res.error); return; }
      after?.();
      router.refresh();
    });

  const confirm = () => run(confirmOrderAction, () => { setDone(true); navigator.vibrate?.(20); });

  return (
    <div className="order-actions oa">
      <AnimatePresence>{error && <motion.div className="form-error" role="alert" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}>{error}</motion.div>}</AnimatePresence>
      <div className="oa__head">
        <span className="oa__badge">Step 3 of 3</span>
        <b>Confirm your order</b>
        <p>Confirming tells us to pack it today. Until you confirm, the pieces stay reserved for you.</p>
      </div>
      <p className="co-policy"><Icon name="clock" /> {policy}</p>
      <label className="co-check">
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
        <span className="co-check__box"><Icon name="check" /></span>
        <span>{changeHours > 0 ? `I understand that I can change or cancel it for ${changeHours} hours after confirming, and that once it is packed it is final.` : "I understand that after confirming, this order cannot be cancelled."}</span>
      </label>
      <motion.button className={`btn btn--block oa__confirm ${done ? "is-done" : ""}`} disabled={!agreed || pending} onClick={confirm} whileTap={{ scale: 0.98 }}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.span key={done ? "done" : pending ? "wait" : "go"} initial={{ y: 14, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -14, opacity: 0 }} transition={{ duration: 0.2 }}>
            {done ? <><Icon name="check" /> Confirmed</> : pending ? <><span className="spinner" aria-hidden /> Confirming…</> : <>Confirm my order <span aria-hidden>→</span></>}
          </motion.span>
        </AnimatePresence>
      </motion.button>
      <button type="button" className="oa__cancel" disabled={pending} onClick={() => setAsking(true)}>Cancel this order instead</button>

      <Dialog open={asking} onOpenChange={setAsking}>
        <DialogContent className="sizeguide oa__dialog">
          <DialogTitle className="sizeguide__title">Cancel this order?</DialogTitle>
          <DialogDescription className="sizeguide__sub">The pieces go back on sale straight away. This cannot be undone.</DialogDescription>
          <CancelReasons value={reason} onChange={setReason} />
          <div className="oa__dialog-actions">
            <button type="button" className="btn btn--ghost" onClick={() => setAsking(false)}>Keep my order</button>
            <button type="button" className="btn btn--danger" disabled={pending} onClick={() => run((tk) => cancelOrderAction(tk, reason), () => setAsking(false))}>
              {pending ? <span className="spinner" aria-hidden /> : "Yes, cancel it"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
