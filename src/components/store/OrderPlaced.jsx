"use client";

import { useEffect } from "react";
import { motion } from "motion/react";
import { CopyButton } from "./Track";

const EASE = [0.16, 1, 0.3, 1];

/**
 * Shown once, right after checkout: the tick draws itself, a few sparks fly, and the customer is told
 * what happens next. The confirm buttons follow just below on the same page.
 */
export default function OrderPlaced({ number, first, total }) {
  useEffect(() => { navigator.vibrate?.([12, 60, 18]); }, []);
  return (
    <motion.div className="placed" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE }}>
      <span className="placed__mark" aria-hidden>
        <svg viewBox="0 0 80 80">
          <motion.circle cx="40" cy="40" r="36" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.8, ease: EASE }} />
          <motion.path d="M24 41l11 11 22-24" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.45, delay: 0.65, ease: EASE }} />
        </svg>
        {Array.from({ length: 10 }, (_, i) => (
          <motion.i
            key={i} style={{ "--a": `${i * 36}deg` }}
            initial={{ opacity: 0, scale: 0 }} animate={{ opacity: [0, 1, 0], scale: [0, 1, 0.6] }}
            transition={{ duration: 0.9, delay: 0.9 + (i % 3) * 0.05, ease: EASE }}
          />
        ))}
      </span>
      <div className="placed__text">
        <span className="eyebrow">Order placed · <b>{number}</b> <CopyButton text={number} /></span>
        <h2 className="display">Thank you, <em>{first}</em>.</h2>
        <p>Your pieces are reserved. One last step below: <b>confirm the order</b> and we dispatch it. You pay {total} in cash when it arrives.</p>
      </div>
    </motion.div>
  );
}
