"use client";

import { useEffect, useRef } from "react";

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "";
let loading = null;

/** Loads Cloudflare's Turnstile script once, the first time a check is shown. */
function loadScript() {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (window.turnstile) return Promise.resolve(window.turnstile);
  loading ??= new Promise((resolve) => {
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.onload = () => resolve(window.turnstile);
    s.onerror = () => { loading = null; resolve(null); };
    document.head.appendChild(s);
  });
  return loading;
}

/**
 * The free "are you a person?" check (Cloudflare Turnstile) before placing an order. Usually it passes by itself
 * without the customer doing anything. Renders nothing when the shop has not set it up (no site key).
 * onToken(token | "") is called when it passes, expires or fails.
 */
export default function HumanCheck({ onToken }) {
  const box = useRef(null);
  useEffect(() => {
    if (!SITE_KEY) return;
    let id = null, gone = false;
    loadScript().then((ts) => {
      if (!ts || gone || !box.current) return;
      id = ts.render(box.current, {
        sitekey: SITE_KEY, action: "checkout", appearance: "interaction-only", theme: "auto",
        callback: (t) => onToken(t), "expired-callback": () => onToken(""), "error-callback": () => onToken(""),
      });
    });
    return () => { gone = true; if (id && window.turnstile) window.turnstile.remove(id); };
  }, [onToken]);
  if (!SITE_KEY) return null;
  return <div ref={box} className="human-check" />;
}

export const humanCheckOn = Boolean(SITE_KEY);
