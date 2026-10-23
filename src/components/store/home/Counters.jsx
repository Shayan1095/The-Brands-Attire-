"use client";

import { useEffect, useRef, useState } from "react";
import Counter from "@/components/bits/Counter/Counter";

/** A number that rolls up from zero the first time it scrolls into view. */
export function StatCounter({ value, suffix = "" }) {
  const ref = useRef(null);
  const [shown, setShown] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setShown(value); io.disconnect(); }
    }, { threshold: 0.6 });
    io.observe(el);
    return () => io.disconnect();
  }, [value]);

  return (
    <span ref={ref}>
      <Counter value={shown} suffix={suffix} fontSize="inherit" intro={false} duration={1.2} stagger={0.08} />
    </span>
  );
}

const pad = (n) => Math.max(0, n);

/** Days / hours / minutes / seconds until a sale ends, with rolling digits. Hidden once it has passed. */
export function SaleCountdown({ endsAt }) {
  const [left, setLeft] = useState(null);

  useEffect(() => {
    const end = new Date(endsAt).getTime();
    const tick = () => setLeft(Math.max(0, end - Date.now()));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [endsAt]);

  if (left === null || left <= 0) return null;
  const s = Math.floor(left / 1000);
  const parts = [
    ["Days", Math.floor(s / 86400)],
    ["Hours", Math.floor((s % 86400) / 3600)],
    ["Mins", Math.floor((s % 3600) / 60)],
    ["Secs", s % 60],
  ];

  return (
    <div className="countdown" role="timer" aria-label={`Sale ends in ${parts.map(([l, v]) => `${v} ${l.toLowerCase()}`).join(", ")}`}>
      <span className="countdown__label">Ends in</span>
      {parts.map(([label, v]) => (
        <span className="countdown__unit" key={label} aria-hidden>
          <b><Counter value={pad(v)} minDigits={2} fontSize="inherit" intro={false} duration={0.5} /></b>
          <small>{label}</small>
        </span>
      ))}
    </div>
  );
}
