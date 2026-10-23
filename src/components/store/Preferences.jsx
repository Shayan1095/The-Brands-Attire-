"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { Switch } from "@/components/ui/switch";
import { subscriptionAction } from "@/lib/store-actions";
import { Icon } from "./icons";

const EASE = [0.16, 1, 0.3, 1];

/**
 * Message preferences from the link in an email / WhatsApp message.
 * contact = { email: "a***@gmail.com" | null, phone: "+92 3** *** **67" | null, emailOn, whatsappOn }
 */
export default function Preferences({ token, contact, storeName }) {
  const [prefs, setPrefs] = useState({ email: contact.emailOn, whatsapp: contact.whatsappOn });
  const [saved, setSaved] = useState(null); // the last saved choice, for the confirmation
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  const save = (next) =>
    start(async () => {
      setError("");
      const res = await subscriptionAction(token, next);
      if (res.error) return setError(res.error);
      setPrefs({ email: res.email, whatsapp: res.whatsapp });
      setSaved({ email: res.email, whatsapp: res.whatsapp });
      navigator.vibrate?.(12);
    });

  const offAll = saved && !saved.email && !saved.whatsapp;
  const channels = [
    contact.email && ["email", "mail", "Email", contact.email, "New arrivals, offers and the occasional lookbook."],
    contact.phone && ["whatsapp", "whatsapp", "WhatsApp", contact.phone, "Drops and offers, plus one reminder if you leave something in your bag."],
  ].filter(Boolean);

  return (
    <div className="prefs">
      <AnimatePresence mode="wait" initial={false}>
        {offAll ? (
          <motion.div key="done" className="prefs__done" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.45, ease: EASE }}>
            <span className="prefs__tick" aria-hidden>
              <svg viewBox="0 0 64 64"><motion.path d="M18 33l9 9 19-21" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.5, delay: 0.15, ease: EASE }} /></svg>
            </span>
            <h2 className="display">You are unsubscribed.</h2>
            <p>We will not send you offers or new-arrival messages any more. You will still get messages about orders you place, like your confirmation link and delivery updates.</p>
            <div className="prefs__actions">
              <button type="button" className="btn btn--ghost" disabled={pending} onClick={() => save({ email: Boolean(contact.email), whatsapp: Boolean(contact.phone) })}>
                {pending ? <span className="spinner" aria-hidden /> : "Changed your mind? Resubscribe"}
              </button>
              <Link href="/products" className="link-arrow">Back to the shop</Link>
            </div>
          </motion.div>
        ) : (
          <motion.div key="form" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.45, ease: EASE }}>
            <ul className="prefs__list">
              {channels.map(([key, icon, label, address, note]) => (
                <li key={key}>
                  <label className="prefs__row">
                    <span className={`prefs__icon prefs__icon--${key}`}><Icon name={icon} /></span>
                    <span className="prefs__text">
                      <b>{label} <small>{address}</small></b>
                      <span>{note}</span>
                    </span>
                    <Switch checked={prefs[key]} onCheckedChange={(v) => setPrefs((p) => ({ ...p, [key]: v }))} aria-label={`${label} messages`} />
                  </label>
                </li>
              ))}
            </ul>
            <p className="prefs__note"><Icon name="check" /> Messages about your own orders (confirmation link, dispatch, delivery) always reach you, whatever you choose here.</p>

            <AnimatePresence>
              {error && <motion.p className="form-error" role="alert" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}>{error}</motion.p>}
              {saved && !offAll && (
                <motion.p className="form-ok" role="status" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
                  Saved. {saved.email || saved.whatsapp ? `You will hear from ${storeName} by ${[saved.email && "email", saved.whatsapp && "WhatsApp"].filter(Boolean).join(" and ")}.` : ""}
                </motion.p>
              )}
            </AnimatePresence>

            <div className="prefs__actions">
              <button type="button" className="btn" disabled={pending} onClick={() => save(prefs)}>
                {pending ? <><span className="spinner" aria-hidden /> Saving…</> : "Save my choices"}
              </button>
              <button type="button" className="prefs__all" disabled={pending} onClick={() => save({ email: false, whatsapp: false })}>
                Unsubscribe from everything
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
