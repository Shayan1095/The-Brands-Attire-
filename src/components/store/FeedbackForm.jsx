"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { feedbackAction } from "@/lib/store-actions";
import { Icon } from "./icons";

const WORDS = ["", "Not good", "Could be better", "It was okay", "Really good", "Loved it"];
const LIKES = ["The fit", "The quality", "Fast delivery", "The packaging", "Good value"];
const ease = [0.16, 1, 0.3, 1];

/** Five stars, a few quick words and an optional note. Low ratings say a person will get in touch. */
export default function FeedbackForm({ token, given, first }) {
  const [rating, setRating] = useState(given?.rating || 0);
  const [hover, setHover] = useState(0);
  const [tags, setTags] = useState([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(given ? { followUp: false, already: true } : null);
  const shown = hover || rating;
  const low = rating > 0 && rating <= 2;

  const send = async () => {
    setBusy(true); setError("");
    const comment = [tags.length ? `${low ? "Problems" : "Liked"}: ${tags.join(", ")}.` : "", text.trim()].filter(Boolean).join(" ");
    const res = await feedbackAction(token, rating, comment).catch(() => ({ error: "It could not be sent. Please try again." }));
    setBusy(false);
    if (res?.error) return setError(res.error);
    setDone(res);
  };

  if (done) {
    return (
      <motion.div className="fbk__done" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease }} role="status">
        <span className="fbk__tick"><Icon name="check" /></span>
        <b>{done.already ? "You already rated this order. Thank you!" : `Thank you, ${first}!`}</b>
        <p>{done.followUp ? "We are sorry it was not right. A team member has your note and will contact you shortly." : "Your words help us make the next piece better."}</p>
        <Link href="/products" className="btn">Shop the new pieces <span aria-hidden>→</span></Link>
      </motion.div>
    );
  }

  return (
    <div className="fbk__form">
      <div className="fbk__stars" role="radiogroup" aria-label="Your rating" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <motion.button
            key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} of 5`}
            className={n <= shown ? "on" : ""} onMouseEnter={() => setHover(n)} onFocus={() => setHover(n)} onBlur={() => setHover(0)}
            onClick={() => { setRating(n); setTags([]); }} whileTap={{ scale: 0.82 }}
            animate={rating === n ? { scale: [1, 1.25, 1] } : { scale: 1 }} transition={{ duration: 0.4, ease }}
          >
            <svg viewBox="0 0 24 24" aria-hidden><path d="m12 2.8 2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3L2.9 9.5l6.3-.9z" /></svg>
          </motion.button>
        ))}
      </div>
      <p className="fbk__word" aria-live="polite">{WORDS[shown] || "Tap a star"}</p>

      <AnimatePresence initial={false}>
        {rating > 0 && (
          <motion.div key="more" className="fbk__more" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.45, ease }}>
            <span className="fbk__ask">{low ? "What went wrong?" : "What did you like?"}</span>
            <div className="fbk__tags">
              {(low ? ["The fit", "The quality", "Late delivery", "Wrong item", "The packaging"] : LIKES).map((t) => (
                <button key={t} type="button" className={tags.includes(t) ? "on" : ""} aria-pressed={tags.includes(t)} onClick={() => setTags((l) => (l.includes(t) ? l.filter((x) => x !== t) : [...l, t]))}>{t}</button>
              ))}
            </div>
            <textarea rows={3} maxLength={1200} value={text} onChange={(e) => setText(e.target.value)} placeholder={low ? "Tell us what happened and we will put it right." : "Anything else? (optional)"} aria-label="Your note" />
            {low && <small className="fbk__hint">A note with a low rating goes straight to our team, who will contact you.</small>}
            {error && <p className="rma__error" role="alert">{error}</p>}
            <button type="button" className="btn fbk__send" onClick={send} disabled={busy}>{busy ? "Sending…" : "Send"}</button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
