"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { useStore } from "./Shell";
import { Icon } from "./icons";

/**
 * "Your bag is waiting": a slim bar for a visitor who comes back (a new visit) with pieces still in their bag.
 * Once per visit, never on checkout, gone on a tap.
 */
export default function BagBar() {
  const { cart, count, subtotal, fmt, loaded } = useStore();
  const pathname = usePathname();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!loaded || !cart.length || pathname.startsWith("/checkout")) return;
    try {
      if (sessionStorage.getItem("tba_bagbar")) return;
      sessionStorage.setItem("tba_bagbar", "1");
    } catch { return; }
    const open = () => (document.documentElement.dataset.intro ? setTimeout(open, 600) : setShow(true));
    const t = setTimeout(open, 1200);
    const off = setTimeout(() => setShow(false), 14000);
    return () => { clearTimeout(t); clearTimeout(off); };
  }, [loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (pathname.startsWith("/checkout")) setShow(false); }, [pathname]);

  return (
    <AnimatePresence>
      {show && cart.length > 0 && (
        <motion.div className="bagbar" role="status" initial={{ y: "-110%", opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: "-110%", opacity: 0 }} transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}>
          <Icon name="bag" />
          <span className="bagbar__text"><b>Your bag is waiting</b> · {count} {count === 1 ? "piece" : "pieces"} · {fmt(subtotal)}</span>
          <Link href="/checkout" className="bagbar__go" onClick={() => setShow(false)}>Checkout <span aria-hidden>→</span></Link>
          <button type="button" className="bagbar__x" onClick={() => setShow(false)} aria-label="Close"><Icon name="close" /></button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
