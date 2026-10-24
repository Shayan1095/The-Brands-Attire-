"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { signupAction, loginAction, forgotAction } from "@/lib/account-actions";
import { CopyButton } from "./Track";
import { Icon } from "./icons";

const EASE = [0.16, 1, 0.3, 1];

/** A password box with a show / hide eye. */
export function SecretField({ id, label, value, onChange, autoComplete = "current-password", hint }) {
  const [shown, setShown] = useState(false);
  return (
    <div className="cfield">
      <label htmlFor={id}>{label}</label>
      <div className="cfield__box">
        <input id={id} type={shown ? "text" : "password"} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} required minLength={autoComplete === "new-password" ? 8 : undefined} />
        <button type="button" className="acct__eye" onClick={() => setShown((v) => !v)} aria-label={shown ? "Hide password" : "Show password"} aria-pressed={shown}>
          <Icon name="eye" />
          {shown && <i aria-hidden />}
        </button>
      </div>
      {hint && <p className="cfield__hint">{hint}</p>}
    </div>
  );
}

const Field = ({ id, label, hint, ...props }) => (
  <div className="cfield">
    <label htmlFor={id}>{label}</label>
    <div className="cfield__box"><input id={id} {...props} /></div>
    {hint && <p className="cfield__hint">{hint}</p>}
  </div>
);

/**
 * Sign in / create an account (optional: guests can always buy). Creating one gives the first-order code.
 * `next` = where to go afterwards.
 */
export default function AccountAuth({ mode = "login", next = "/account", percent = 0, storeName, signedIn = false }) {
  const router = useRouter();
  const [tab, setTab] = useState(mode);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const [done, setDone] = useState(null); // after sign-up: { code }
  const [f, setF] = useState({ name: "", phone: "", email: "", password: "", login: "", offers: false });
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: typeof v === "string" || typeof v === "boolean" ? v : v.target.value }));
  const [forgot, setForgot] = useState(null); // null | "form" | "sent"
  const go = () => { router.push(next || "/account"); router.refresh(); };

  const login = (e) => {
    e.preventDefault();
    start(async () => {
      setError("");
      const res = await loginAction({ login: f.login, password: f.password }).catch(() => ({ error: "Could not sign in. Please try again." }));
      if (res?.error) return setError(res.error);
      navigator.vibrate?.(12);
      go();
    });
  };
  const signup = (e) => {
    e.preventDefault();
    start(async () => {
      setError("");
      const res = await signupAction({ name: f.name, phone: f.phone, email: f.email, password: f.password, offers: f.offers }).catch(() => ({ error: "Could not create your account. Please try again." }));
      if (res?.error) return setError(res.error);
      navigator.vibrate?.(20);
      // stay on the welcome screen (with the code); the header catches up on the next page
      setDone({ code: res.code });
      // the welcome card is shorter than the form: bring it into view (on a phone the button was far down)
      setTimeout(() => document.querySelector(".acct__done")?.scrollIntoView({ block: "center", behavior: "smooth" }), 60);
    });
  };
  const sendLink = (e) => {
    e.preventDefault();
    start(async () => {
      setError("");
      const res = await forgotAction(f.login).catch(() => ({ error: "Please try again." }));
      if (res?.error) return setError(res.error);
      setForgot("sent");
    });
  };

  // already signed in (and not looking at the welcome just made): nothing to fill in here
  const away = signedIn && !done;
  useEffect(() => { if (away) router.replace(next || "/account"); }, [away]); // eslint-disable-line react-hooks/exhaustive-deps
  if (away) return null;

  if (done) {
    return (
      <motion.div className="acct__done" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }}>
        <span className="acct__tick" aria-hidden>
          <svg viewBox="0 0 64 64"><motion.path d="M18 33l9 9 19-21" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.5, delay: 0.15, ease: EASE }} /></svg>
        </span>
        <h2 className="display">Welcome{f.name ? `, ${f.name.split(" ")[0]}` : ""}.</h2>
        {done.code ? (
          <>
            <p>Your account is ready, and here is <b>{percent}% off your first order</b>:</p>
            <div className="acct__code"><b>{done.code}</b><CopyButton text={done.code} /></div>
            <p className="fine">It works once, at checkout, with the phone or email of this account. It is also saved on your account page.</p>
          </>
        ) : (
          <p>Your account is ready. Your orders, saved details and bag now follow you on every device.</p>
        )}
        <div className="acct__actions">
          <Link href={next && next !== "/account" ? next : "/products"} className="btn" onClick={() => router.refresh()}>{next && next !== "/account" ? "Back to where I was" : "Start shopping"} <span aria-hidden>→</span></Link>
          <Link href="/account" className="btn btn--ghost" onClick={() => router.refresh()}>My account</Link>
        </div>
      </motion.div>
    );
  }

  return (
    <div className="acct__card">
      <div className="acct__tabs" role="tablist" aria-label="Account">
        {[["login", "Sign in"], ["signup", "Create account"]].map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? "is-on" : ""} onClick={() => { setTab(k); setError(""); setForgot(null); }}>
            {tab === k && <motion.span layoutId="acct-tab" className="acct__pill" transition={{ type: "spring", stiffness: 420, damping: 36 }} />}
            <span>{label}</span>
          </button>
        ))}
      </div>

      <AnimatePresence>{error && <motion.p className="form-error" role="alert" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>{error}</motion.p>}</AnimatePresence>

      <AnimatePresence mode="wait" initial={false}>
        {tab === "login" ? (
          forgot ? (
            <motion.form key="forgot" onSubmit={sendLink} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.3, ease: EASE }}>
              {forgot === "sent" ? (
                <p className="acct__note"><Icon name="mail" /> If there is an account with an email for <b>{f.login}</b>, a link to choose a new password is on its way (it works for an hour). No email on your account? Message us on WhatsApp and we will help.</p>
              ) : (
                <>
                  <p className="acct__lead">Enter the phone or email of your account. We will email you a link to choose a new password.</p>
                  <Field id="ac-forgot" label="Phone or email" value={f.login} onChange={set("login")} autoComplete="username" required />
                  <button className="btn btn--block" disabled={pending}>{pending ? <span className="spinner" aria-hidden /> : "Email me a link"}</button>
                </>
              )}
              <button type="button" className="acct__link" onClick={() => setForgot(null)}>← Back to sign in</button>
            </motion.form>
          ) : (
            <motion.form key="login" onSubmit={login} initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }} transition={{ duration: 0.3, ease: EASE }}>
              <Field id="ac-login" label="Phone or email" value={f.login} onChange={set("login")} autoComplete="username" inputMode="email" required placeholder="0300 1234567 or you@email.com" />
              <SecretField id="ac-pass" label="Password" value={f.password} onChange={set("password")} />
              <button className="btn btn--block" disabled={pending}>{pending ? <><span className="spinner" aria-hidden /> Signing in…</> : <>Sign in <span aria-hidden>→</span></>}</button>
              <button type="button" className="acct__link" onClick={() => { setForgot("form"); setError(""); }}>Forgot your password?</button>
            </motion.form>
          )
        ) : (
          <motion.form key="signup" onSubmit={signup} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.3, ease: EASE }}>
            {percent > 0 && <p className="acct__offer"><Icon name="gift" /> <span>Create your account and get <b>{percent}% off your first order</b>.</span></p>}
            <Field id="ac-name" label="Your name" value={f.name} onChange={set("name")} autoComplete="name" required />
            <Field id="ac-phone" label="Mobile number" value={f.phone} onChange={set("phone")} type="tel" inputMode="tel" autoComplete="tel" placeholder="0300 1234567" required hint="You sign in with it, and it is how we match your orders." />
            <Field id="ac-email" label={<>Email <em>(optional)</em></>} value={f.email} onChange={set("email")} type="email" autoComplete="email" hint="Needed if you ever forget your password." />
            <SecretField id="ac-new" label="Choose a password" value={f.password} onChange={set("password")} autoComplete="new-password" hint="At least 8 characters." />
            <label className="co-check">
              <input type="checkbox" checked={f.offers} onChange={(e) => set("offers")(e.target.checked)} />
              <span className="co-check__box"><Icon name="check" /></span>
              <span>Send me new arrivals and offers, and a reminder if I leave something in my bag (WhatsApp / email). Stop any time.</span>
            </label>
            <button className="btn btn--block" disabled={pending}>{pending ? <><span className="spinner" aria-hidden /> Creating your account…</> : <>Create my account <span aria-hidden>→</span></>}</button>
            <p className="fine acct__small">Accounts are optional: you can always order as a guest. {storeName} never shares your details.</p>
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  );
}
