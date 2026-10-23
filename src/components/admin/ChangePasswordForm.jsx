"use client";

import { useActionState, useEffect, useRef } from "react";
import { changePasswordAction } from "@/lib/admin-actions";
import PasswordInput from "./PasswordInput";

/** My account: change your own password (current one first). */
export default function ChangePasswordForm() {
  const [state, action, pending] = useActionState(changePasswordAction, null);
  const form = useRef(null);
  useEffect(() => { if (state?.ok) form.current?.reset(); }, [state]);
  return (
    <form action={action} ref={form} className="card" style={{ maxWidth: 520 }}>
      <h2>Change password</h2>
      <p className="sub">This is the only place your password needs changing. The ADMIN_PASSWORD in Vercel or .env.local is only used once, to create the very first account, and is not checked when you sign in.</p>
      {state?.error && <div className="note note--bad" role="alert">{state.error}</div>}
      {state?.ok && <div className="note note--ok" role="status">Password changed. Use the new one next time you sign in.</div>}
      <div className="field"><label htmlFor="pw-current">Current password</label><PasswordInput id="pw-current" name="current" required autoComplete="current-password" /></div>
      <div className="field"><label htmlFor="pw-new">New password</label><PasswordInput id="pw-new" name="password" required minLength={8} autoComplete="new-password" /><small>At least 8 characters. A short sentence is easy to remember and hard to guess.</small></div>
      <div className="field"><label htmlFor="pw-again">New password again</label><PasswordInput id="pw-again" name="again" required minLength={8} autoComplete="new-password" /></div>
      <button className="btn" disabled={pending}>{pending ? "Saving…" : "Change password"}</button>
    </form>
  );
}
