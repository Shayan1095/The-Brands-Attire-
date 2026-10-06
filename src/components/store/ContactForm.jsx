"use client";

import { useActionState, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { contactAction } from "@/lib/store-actions";
import { waLink } from "@/lib/format";
import { Icon } from "./icons";

const EASE = [0.16, 1, 0.3, 1];
const TOPICS = [
  { key: "Order support", hint: "Where is it, change of address, a problem with delivery.", order: true },
  { key: "Exchange", hint: "Wrong size or changed your mind? Tell us what you would like instead.", order: true },
  { key: "Product question", hint: "Sizing, fabric, fit or when something is back in stock." },
  { key: "Wholesale", hint: "Stocking our pieces or bulk orders." },
  { key: "Other", hint: "Anything else. We read everything." },
];
const MAX = 1500;

/** A text field whose label sits inside the box and floats up when you type. */
function Field({ label, name, type = "text", required, autoComplete, area, value, onChange, maxLength }) {
  const Tag = area ? "textarea" : "input";
  return (
    <label className={`ffield ${area ? "ffield--area" : ""}`}>
      <Tag name={name} type={area ? undefined : type} required={required} autoComplete={autoComplete} placeholder=" " value={value} onChange={onChange} maxLength={maxLength} />
      <span>{label}</span>
    </label>
  );
}

export default function ContactForm({ whatsapp }) {
  const [state, action, pending] = useActionState(contactAction, null);
  const [topic, setTopic] = useState(TOPICS[0]);
  const [message, setMessage] = useState("");
  const [again, setAgain] = useState(false);

  if (state?.ok && !again && !pending) {
    return (
      <motion.div className="sent" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE }}>
        <motion.span className="sent__tick" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 300, damping: 16, delay: 0.15 }}>
          <Icon name="check" />
        </motion.span>
        <h3 className="display">Message received.</h3>
        <p>Thank you. We reply within 24 hours, usually much sooner, on the email or number you gave us.</p>
        <div className="sent__actions">
          {whatsapp && (
            <a className="btn" href={waLink(whatsapp, `Hi, I just sent a message through your website about: ${topic.key}.`)} target="_blank" rel="noopener noreferrer">
              Need it faster? WhatsApp us
            </a>
          )}
          <button className="btn btn--ghost" onClick={() => { setMessage(""); setAgain(true); }}>Send another message</button>
        </div>
      </motion.div>
    );
  }

  return (
    <form action={(fd) => { setAgain(false); return action(fd); }} className="cform">
      <AnimatePresence>
        {state?.error && (
          <motion.div className="form-error" role="alert" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>{state.error}</motion.div>
        )}
      </AnimatePresence>
      <input className="hp" name="website" tabIndex={-1} autoComplete="off" aria-hidden />
      <input type="hidden" name="topic" value={topic.key} />

      <div className="cform__step">
        <span className="cform__num">01</span>
        <div>
          <span className="label">What is it about?</span>
          <div className="topics" role="radiogroup" aria-label="Topic">
            {TOPICS.map((t) => (
              <button type="button" key={t.key} role="radio" aria-checked={topic.key === t.key} className={`topic ${topic.key === t.key ? "active" : ""}`} onClick={() => setTopic(t)}>
                {topic.key === t.key && <motion.span layoutId="topic-pill" className="topic__pill" transition={{ type: "spring", stiffness: 420, damping: 36 }} />}
                <span>{t.key}</span>
              </button>
            ))}
          </div>
          <AnimatePresence mode="wait" initial={false}>
            <motion.p key={topic.key} className="fine" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>{topic.hint}</motion.p>
          </AnimatePresence>
        </div>
      </div>

      <div className="cform__step">
        <span className="cform__num">02</span>
        <div>
          <span className="label">How do we reach you?</span>
          <Field label="Your name" name="name" required autoComplete="name" />
          <div className="field-row">
            <Field label="Email" name="email" type="email" autoComplete="email" />
            <Field label="Phone / WhatsApp" name="phone" type="tel" autoComplete="tel" />
          </div>
          <p className="fine">Give us at least one of the two so we can reply.</p>
          <AnimatePresence initial={false}>
            {topic.order && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.35, ease: EASE }} style={{ overflow: "hidden" }}>
                <div style={{ paddingTop: 12 }}><Field label="Order number, e.g. TBA-1042" name="order" /></div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="cform__step">
        <span className="cform__num">03</span>
        <div>
          <span className="label">Your message</span>
          <Field label="How can we help?" name="message" area required value={message} onChange={(e) => setMessage(e.target.value)} maxLength={MAX} />
          <div className="cform__foot">
            <span className="fine">{message.length} / {MAX}</span>
            <motion.button className="btn" whileTap={{ scale: 0.97 }} disabled={pending}>
              {pending ? <><span className="spinner" aria-hidden /> Sending…</> : <>Send message <span aria-hidden>→</span></>}
            </motion.button>
          </div>
        </div>
      </div>
    </form>
  );
}
