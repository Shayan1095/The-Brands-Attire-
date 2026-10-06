"use client";

import { useState, useTransition } from "react";
import { unsubscribeAction } from "@/lib/store-actions";

export function UnsubscribeButton({ token }) {
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();
  if (done) return <p className="form-ok">You have been unsubscribed. You will still get messages about your own orders.</p>;
  return (
    <button className="btn" disabled={pending} onClick={() => start(async () => { await unsubscribeAction(token); setDone(true); })}>
      Unsubscribe me
    </button>
  );
}
