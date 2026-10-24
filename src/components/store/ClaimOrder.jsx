"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { claimOrderAction } from "@/lib/account-actions";
import { SecretField } from "./AccountAuth";
import { Icon } from "./icons";

/**
 * On the order page: a guest turns this order into an account (just a password: the details are already here),
 * or a signed-in customer adds it to their account. Holding this private link proves the order is theirs.
 * mode: "create" | "add" | "signin"
 */
export default function ClaimOrder({ token, mode }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();
  const go = (e) => {
    e?.preventDefault();
    start(async () => {
      setError("");
      const res = await claimOrderAction(token, mode === "create" ? password : null).catch(() => ({ error: "Please try again." }));
      if (res?.error) return setError(res.error);
      // the confirmation stays on screen; the header shows the account from the next page on
      setDone(true);
      setTimeout(() => document.querySelector(".claim")?.scrollIntoView({ block: "center", behavior: "smooth" }), 60);
    });
  };

  // saving signs the customer in, which reloads the page with this order now in their account ("owned"):
  // the confirmation stays on screen; on a later visit there is nothing to show
  const [was] = useState(mode);
  if (mode === "owned" && !done) return null;
  if (mode === "owned") mode = was === "owned" ? "add" : was;

  if (mode === "signin") {
    return (
      <div className="ordr__card claim">
        <span className="ordr__label"><Icon name="user" /> Your account</span>
        <p>This order belongs to an account. Sign in to see all your orders in one place.</p>
        <Link href={`/account/login?next=/order/${token}`} className="link-arrow">Sign in</Link>
      </div>
    );
  }

  return (
    <div className="ordr__card claim">
      <AnimatePresence mode="wait" initial={false}>
        {done ? (
          <motion.div key="done" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <span className="ordr__label"><Icon name="check" /> {mode === "create" ? "Account created" : "Added to your account"}</span>
            <p>{mode === "create" ? "You are signed in. Your orders and details are saved: next time checkout fills itself in." : "This order now shows in your account."}</p>
            <Link href="/account" className="link-arrow" onClick={() => router.refresh()}>Open my account</Link>
          </motion.div>
        ) : mode === "create" ? (
          <motion.form key="form" onSubmit={go}>
            <span className="ordr__label"><Icon name="user" /> Save this order to an account</span>
            <p>Just choose a password: your name, phone and address are already here. Track every order in one place, and check out faster next time.</p>
            <SecretField id="claim-pw" label="Choose a password" value={password} onChange={setPassword} autoComplete="new-password" hint="At least 8 characters." />
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="btn btn--block" disabled={pending || password.length < 8}>{pending ? <span className="spinner" aria-hidden /> : "Create my account"}</button>
          </motion.form>
        ) : (
          <motion.div key="add">
            <span className="ordr__label"><Icon name="user" /> Your account</span>
            <p>Add this order to your account to see it there with your other orders.</p>
            {error && <p className="form-error" role="alert">{error}</p>}
            <button type="button" className="btn btn--ghost btn--block" onClick={go} disabled={pending}>{pending ? <span className="spinner" aria-hidden /> : "Add to my account"}</button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
