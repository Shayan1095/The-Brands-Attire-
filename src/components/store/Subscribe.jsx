"use client";

import { useActionState } from "react";
import { subscribeAction } from "@/lib/store-actions";

export default function Subscribe() {
  const [state, action, pending] = useActionState(subscribeAction, null);
  if (state?.ok) return <p className="form-ok" style={{ maxWidth: 520, margin: "24px auto 0" }}>{state.confirm ? "Almost there: check your inbox and tap the link to confirm." : "You are on the list. We will message you when something new drops."}</p>;
  return (
    <>
      <form action={action} className="newsletter">
        <input className="hp" name="tba_trap" tabIndex={-1} autoComplete="off" aria-hidden />
        <input className="input" name="contact" required placeholder="Email or WhatsApp number" aria-label="Email or WhatsApp number" />
        <button className="btn" disabled={pending}>{pending ? "Joining…" : <>Subscribe <span aria-hidden>→</span></>}</button>
      </form>
      {state?.error && <p className="fine" style={{ color: "var(--signal)", marginTop: 8 }}>{state.error}</p>}
    </>
  );
}
