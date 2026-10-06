"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { confirmOrderAction, cancelOrderAction } from "@/lib/store-actions";

/** Confirm / cancel buttons shown on the customer's order page while the order is pending. */
export default function OrderActions({ token, policy }) {
  const router = useRouter();
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  const run = (action) =>
    start(async () => {
      setError("");
      const res = await action(token);
      if (res.error) setError(res.error);
      router.refresh();
    });

  return (
    <div className="order-actions">
      {error && <div className="form-error" role="alert">{error}</div>}
      <div className="policy-box" style={{ margin: 0 }}><b>Please read:</b> {policy}</div>
      <label className="check">
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
        <span>I understand that after confirming, this order cannot be cancelled.</span>
      </label>
      <button className="btn btn--block" disabled={!agreed || pending} onClick={() => run(confirmOrderAction)}>
        {pending ? "Please wait…" : "Confirm my order"}
      </button>
      <button
        className="btn btn--block btn--danger" disabled={pending}
        onClick={() => window.confirm("Cancel this order? This cannot be undone.") && run(cancelOrderAction)}
      >
        Cancel order
      </button>
    </div>
  );
}
