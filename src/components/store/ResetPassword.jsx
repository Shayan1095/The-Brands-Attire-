"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { resetAction } from "@/lib/account-actions";
import { SecretField } from "./AccountAuth";

/** The page from the "forgot your password" email. */
export default function ResetPassword({ token }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const save = (e) => {
    e.preventDefault();
    start(async () => {
      const res = await resetAction(token, password).catch(() => ({ error: "Please try again." }));
      if (res?.error) return setError(res.error);
      router.push("/account");
      router.refresh();
    });
  };
  return (
    <form className="acct__card" onSubmit={save}>
      {error && <p className="form-error" role="alert">{error}</p>}
      <SecretField id="rs-new" label="New password" value={password} onChange={setPassword} autoComplete="new-password" hint="At least 8 characters." />
      <button className="btn btn--block" disabled={pending}>{pending ? <span className="spinner" aria-hidden /> : "Save and sign in"}</button>
    </form>
  );
}
