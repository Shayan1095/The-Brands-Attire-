"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Icon } from "./icons";

const SEEN = "tba_signup_seen"; // when it was last shown (or dismissed): not again for 14 days
const PAGES = "tba_pages";      // pages seen this visit
const QUIET = /^\/(checkout|account|order|track\/|feedback|updates|unsubscribe)/;

/**
 * "Join and get 10% off your first order": a small card that slides up once a visitor has looked around (a third
 * page, or 25 seconds), never on checkout, account or order pages, never while the intro plays, and at most once
 * every 14 days. Only for visitors who are not signed in, and only while the owner has a sign-up offer set.
 */
export default function SignupPrompt({ percent, signedIn }) {
  const pathname = usePathname();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!percent || signedIn || QUIET.test(pathname)) { setShow(false); return; }
    let seen = 0, pages = 0;
    try {
      seen = Number(localStorage.getItem(SEEN) || 0);
      pages = Number(sessionStorage.getItem(PAGES) || 0) + 1;
      sessionStorage.setItem(PAGES, String(pages));
    } catch { return; }
    if (Date.now() - seen < 14 * 864e5) return;
    const open = () => {
      if (document.documentElement.dataset.intro) return setTimeout(open, 800);
      setShow(true);
      try { localStorage.setItem(SEEN, String(Date.now())); } catch {}
    };
    const t = setTimeout(open, pages >= 3 ? 1800 : 25000);
    return () => clearTimeout(t);
  }, [pathname, percent, signedIn]);

  const close = () => setShow(false);

  return (
    <AnimatePresence>
      {show && (
        <motion.aside
          className="joinp" role="dialog" aria-label="Create an account"
          initial={{ opacity: 0, y: 40, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 30 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          <button type="button" className="joinp__x" onClick={close} aria-label="Not now"><Icon name="close" /></button>
          <span className="joinp__icon" aria-hidden><Icon name="gift" /></span>
          <div className="joinp__text">
            <b>{percent}% off your first order</b>
            <span>Create a free account: your bag on every device, all your orders in one place, faster checkout.</span>
          </div>
          <div className="joinp__acts">
            <Link href={`/account/signup?next=${encodeURIComponent(pathname)}`} className="btn btn--sm" onClick={close}>Create account</Link>
            <button type="button" className="joinp__later" onClick={close}>Not now</button>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
