"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { profileAction, customerPasswordAction, logoutAction } from "@/lib/account-actions";
import { ORDER_STATUS } from "@/lib/format";
import { useStore } from "./Shell";
import { CopyButton } from "./Track";
import { SecretField } from "./AccountAuth";
import { Icon } from "./icons";

const EASE = [0.16, 1, 0.3, 1];
const Note = ({ state }) => (
  <AnimatePresence>
    {state?.error && <motion.p className="form-error" role="alert" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}>{state.error}</motion.p>}
    {state?.ok && <motion.p className="form-ok" role="status" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}>{state.ok}</motion.p>}
  </AnimatePresence>
);

/** The customer's account: codes, orders, saved details, preferences and password. */
export default function AccountPanel({ me, view, tz = "Asia/Karachi" }) {
  const router = useRouter();
  const { fmt, clear } = useStore();
  const [pending, start] = useTransition();
  const [p, setP] = useState({ name: me.name, email: me.email, address: me.address, city: me.city, emailOffers: me.emailOffers, whatsappOffers: me.whatsappOffers });
  const [pw, setPw] = useState({ current: "", next: "" });
  const [profileState, setProfileState] = useState(null);
  const [pwState, setPwState] = useState(null);
  const date = (d) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: tz });

  const saveProfile = (e) => {
    e.preventDefault();
    start(async () => {
      const res = await profileAction(p).catch(() => ({ error: "Could not save. Please try again." }));
      setProfileState(res?.error ? { error: res.error } : { ok: "Saved." });
      router.refresh();
    });
  };
  const savePassword = (e) => {
    e.preventDefault();
    start(async () => {
      const res = await customerPasswordAction(pw.current, pw.next).catch(() => ({ error: "Could not save. Please try again." }));
      setPwState(res?.error ? { error: res.error } : { ok: "Password changed." });
      if (!res?.error) setPw({ current: "", next: "" });
    });
  };
  const signOut = () => start(async () => { await logoutAction(); clear?.(); router.push("/"); router.refresh(); });

  return (
    <div className="acct__grid">
      <div className="acct__main">
        {view.codes.length > 0 && (
          <section className="acct__box acct__codes">
            <span className="eyebrow"><Icon name="gift" /> Your codes</span>
            {view.codes.map((c) => (
              <div key={c.code} className="acct__code">
                <b>{c.code}</b>
                <span>{c.type === "percent" ? `${c.value}% off` : `${fmt(c.value)} off`}{c.ends_at ? ` · until ${date(c.ends_at)}` : ""}{c.note ? ` · ${c.note}` : ""}</span>
                <CopyButton text={c.code} />
              </div>
            ))}
            <p className="fine">Use a code at checkout with this account's phone or email. Each works once.</p>
          </section>
        )}

        <section className="acct__box">
          <div className="acct__head"><h2>Your orders</h2>{view.points != null && <span className="acct__points"><Icon name="star" /> {view.points} points</span>}</div>
          {view.orders.length ? (
            <ul className="acct__orders">
              {view.orders.map((o, i) => {
                const st = ORDER_STATUS[o.status] || { label: o.status, tone: "info" };
                return (
                  <motion.li key={o.token} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04, duration: 0.4, ease: EASE }}>
                    <Link href={`/order/${o.token}`} className="acct__order">
                      {o.image ? <img src={o.image} alt="" width="52" height="64" loading="lazy" /> : <span className="acct__ph" />}
                      <span className="acct__otext">
                        <b>{o.number}</b>
                        <small>{date(o.created_at)} · {o.pieces} {o.pieces === 1 ? "piece" : "pieces"} · {fmt(o.total)}</small>
                      </span>
                      <span className={`status-pill ${st.tone}`}><i aria-hidden /> {st.label}</span>
                      <Icon name="arrow" />
                    </Link>
                  </motion.li>
                );
              })}
            </ul>
          ) : (
            <p className="acct__empty">No orders on this account yet. <Link href="/products" className="link-arrow">Start shopping</Link></p>
          )}
          {!view.verified && (
            <p className="acct__note"><Icon name="lock" /> Ordered before with this phone? For your privacy, earlier orders show here once you open the link from one of their messages and tap <b>Add to my account</b>.</p>
          )}
        </section>
      </div>

      <div className="acct__side">
        <form className="acct__box" onSubmit={saveProfile}>
          <h2>Your details</h2>
          <p className="fine">Filled in for you at checkout.</p>
          <div className="cfield"><label htmlFor="pr-name">Name</label><div className="cfield__box"><input id="pr-name" value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} autoComplete="name" /></div></div>
          <div className="cfield"><label>Mobile number</label><div className="cfield__box"><input value={me.phone ? `+${me.phone}` : ""} readOnly disabled /></div><p className="cfield__hint">To change it, message us on WhatsApp.</p></div>
          <div className="cfield"><label htmlFor="pr-email">Email</label><div className="cfield__box"><input id="pr-email" type="email" value={p.email} onChange={(e) => setP({ ...p, email: e.target.value })} autoComplete="email" /></div></div>
          <div className="cfield"><label htmlFor="pr-addr">Delivery address</label><div className="cfield__box"><input id="pr-addr" value={p.address} onChange={(e) => setP({ ...p, address: e.target.value })} autoComplete="street-address" placeholder="House, street, area" /></div></div>
          <div className="cfield"><label htmlFor="pr-city">City</label><div className="cfield__box"><input id="pr-city" value={p.city} onChange={(e) => setP({ ...p, city: e.target.value })} autoComplete="address-level2" /></div></div>
          <label className="co-check"><input type="checkbox" checked={p.whatsappOffers} onChange={(e) => setP({ ...p, whatsappOffers: e.target.checked })} /><span className="co-check__box"><Icon name="check" /></span><span>WhatsApp: new arrivals, offers, and a reminder if I leave something in my bag</span></label>
          <label className="co-check"><input type="checkbox" checked={p.emailOffers} onChange={(e) => setP({ ...p, emailOffers: e.target.checked })} disabled={!p.email} /><span className="co-check__box"><Icon name="check" /></span><span>Email: the same, by email</span></label>
          <Note state={profileState} />
          <button className="btn btn--block" disabled={pending}>Save my details</button>
        </form>

        <form className="acct__box" onSubmit={savePassword}>
          <h2>Password</h2>
          <SecretField id="pw-cur" label="Current password" value={pw.current} onChange={(v) => setPw({ ...pw, current: v })} />
          <SecretField id="pw-new" label="New password" value={pw.next} onChange={(v) => setPw({ ...pw, next: v })} autoComplete="new-password" hint="At least 8 characters." />
          <Note state={pwState} />
          <button className="btn btn--ghost btn--block" disabled={pending}>Change password</button>
        </form>

        <button type="button" className="acct__out" onClick={signOut} disabled={pending}><Icon name="arrow" /> Sign out</button>
      </div>
    </div>
  );
}
