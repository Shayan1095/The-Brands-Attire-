"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { quoteAction, placeOrderAction, saveCheckoutAction } from "@/lib/store-actions";
import { useStore } from "./Shell";
import { Icon } from "./icons";
import { ORDERS_KEY } from "./Track";

/** A figure that slides in again whenever its value changes. */
function Amount({ value, className }) {
  return (
    <span className={`amount ${className || ""}`}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.b key={value} initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -12, opacity: 0 }} transition={{ duration: 0.25 }}>
          {value}
        </motion.b>
      </AnimatePresence>
    </span>
  );
}

export default function Checkout({ policy, eta, freeOver }) {
  const router = useRouter();
  const { cart, loaded, fmt, clear } = useStore();
  const [quote, setQuote] = useState(null);
  const [coupon, setCoupon] = useState({ input: "", applied: "" });
  const [error, setError] = useState("");
  const [placing, setPlacing] = useState(false);

  // the server prices the bag; the browser's numbers are never trusted
  useEffect(() => {
    if (!loaded || placing) return;
    let live = true;
    quoteAction(cart.map(({ variantId, qty }) => ({ variantId, qty })), coupon.applied).then((q) => live && setQuote(q));
    return () => { live = false; };
  }, [cart, loaded, coupon.applied, placing]);

  if (loaded && cart.length === 0 && !placing) {
    return (
      <motion.div className="empty" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <h2>Your bag is empty</h2>
        <p>Add something you love and come back to check out.</p>
        <Link href="/products" className="btn">Start shopping</Link>
      </motion.div>
    );
  }

  // if they agreed to be contacted, remember the unfinished checkout so one reminder can be sent later
  const remember = (e) => {
    const f = Object.fromEntries(new FormData(e.currentTarget.form));
    if (String(f.phone || "").replace(/\D/g, "").length < 10) return;
    saveCheckoutAction({ name: f.name, phone: f.phone, email: f.email, consent: f.optIn === "on", items: cart.map(({ variantId, qty }) => ({ variantId, qty })) }).catch(() => {});
  };

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setPlacing(true);
    const f = Object.fromEntries(new FormData(e.currentTarget));
    const res = await placeOrderAction({
      ...f, optIn: f.optIn === "on", coupon: coupon.applied,
      items: cart.map(({ variantId, qty }) => ({ variantId, qty })),
    });
    if (res.error) {
      setError(res.error);
      setPlacing(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    try {
      // lets the track page offer one-tap access to this order later
      const mine = JSON.parse(localStorage.getItem(ORDERS_KEY) || "[]");
      localStorage.setItem(ORDERS_KEY, JSON.stringify([{ number: res.number, token: res.token, at: Date.now() }, ...mine].slice(0, 6)));
    } catch {}
    clear();
    router.push(`/order/${res.token}?placed=1`);
  };

  const toFree = quote && freeOver > 0 ? freeOver - (quote.subtotal - quote.discount) : 0;

  return (
    <form className="checkout" onSubmit={submit}>
      <div>
        <AnimatePresence>
          {error && (
            <motion.div className="form-error" role="alert" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
              {error}
            </motion.div>
          )}
        </AnimatePresence>
        {quote?.issues.map((i) => <div key={i.variantId} className="form-error">{i.message} Please update your bag.</div>)}

        <section className="co-block" data-reveal>
          <h2><span>01</span> Delivery details</h2>
          <input className="hp" name="website" tabIndex={-1} autoComplete="off" aria-hidden />
          <div className="field">
            <label htmlFor="name">Full name</label>
            <input id="name" name="name" required autoComplete="name" />
          </div>
          <div className="field-row">
            <div className="field">
              <label htmlFor="phone">Phone / WhatsApp</label>
              <input id="phone" name="phone" type="tel" required autoComplete="tel" placeholder="03xx xxxxxxx" onBlur={remember} />
            </div>
            <div className="field">
              <label htmlFor="email">Email (optional)</label>
              <input id="email" name="email" type="email" autoComplete="email" />
            </div>
          </div>
          <div className="field">
            <label htmlFor="address">Complete address</label>
            <input id="address" name="address" required autoComplete="street-address" placeholder="House, street, area" />
          </div>
          <div className="field">
            <label htmlFor="city">City</label>
            <input id="city" name="city" required autoComplete="address-level2" />
          </div>
          <div className="field">
            <label htmlFor="notes">Order notes (optional)</label>
            <textarea id="notes" name="notes" maxLength={500} placeholder="Anything the rider should know?" />
          </div>
        </section>

        <section className="co-block" data-reveal>
          <h2><span>02</span> Payment</h2>
          <div className="pay-method">
            <Icon name="cash" />
            <div><b>Cash on delivery</b><div className="fine">Pay the rider when your order arrives. Delivery in {eta}.</div></div>
            <Icon name="check" className="pay-method__tick" />
          </div>
        </section>

        <section className="co-block" data-reveal>
          <h2><span>03</span> Confirm</h2>
          <div className="policy-box" style={{ marginTop: 0 }}>
            <b>How it works:</b> after you place the order we send you a confirmation link by WhatsApp{" "}
            and email. {policy}
          </div>
          <label className="check">
            <input type="checkbox" name="optIn" defaultChecked onChange={remember} />
            <span>Send me new arrivals, offers and a reminder if I leave this order unfinished, on WhatsApp / email. Unsubscribe any time.</span>
          </label>
        </section>
      </div>

      <aside className="panel summary" aria-label="Order summary" data-reveal>
        <h2 style={{ margin: 0 }}>Your order</h2>
        <AnimatePresence initial={false}>
          {(quote?.lines || []).map((l) => (
            <motion.div className="item" key={l.variantId} layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <img src={l.image} alt="" width="72" height="90" />
              <div>
                <h4>{l.name}</h4>
                <small>Size {l.size} · Qty {l.qty}</small>
              </div>
              <div className="item__side"><span>{fmt(l.price * l.qty)}</span></div>
            </motion.div>
          ))}
        </AnimatePresence>
        {!quote && <div className="skeleton" aria-label="Loading your bag" />}

        {quote && freeOver > 0 && (
          <div className="ship-bar" style={{ padding: 0, background: "none" }}>
            {toFree > 0 ? <>Add {fmt(toFree)} more for free delivery</> : <>You have free delivery ✓</>}
            <i><b style={{ width: `${Math.min(100, ((quote.subtotal - quote.discount) / freeOver) * 100)}%` }} /></i>
          </div>
        )}
        <hr />
        <div>
          <div className="coupon">
            <input className="input" placeholder="Discount code" aria-label="Discount code" value={coupon.input} onChange={(e) => setCoupon((c) => ({ ...c, input: e.target.value }))} />
            <button type="button" className="btn btn--ghost" onClick={() => setCoupon((c) => ({ ...c, applied: c.input.trim() }))}>Apply</button>
          </div>
          {quote?.coupon?.error && <p className="fine" style={{ color: "var(--signal)", marginTop: 6 }}>{quote.coupon.error}</p>}
          {quote?.coupon?.id && <p className="fine" style={{ color: "var(--ok)", marginTop: 6 }}>Code {quote.coupon.code} applied ({quote.coupon.label}).</p>}
        </div>
        <hr />
        {quote && (
          <>
            <div className="row"><span>Subtotal</span><Amount value={fmt(quote.subtotal)} /></div>
            {quote.discount > 0 && <div className="row"><span>Discount</span><Amount value={`− ${fmt(quote.discount)}`} className="ok" /></div>}
            <div className="row"><span>Delivery</span><Amount value={quote.shipping ? fmt(quote.shipping) : "Free"} /></div>
            <hr />
            <div className="row total"><span>Total</span><Amount value={fmt(quote.total)} /></div>
          </>
        )}
        <motion.button className="btn btn--block" whileTap={{ scale: 0.98 }} disabled={placing || !quote || quote.issues.length > 0}>
          {placing ? <><span className="spinner" aria-hidden /> Placing order…</> : <>Place order <span aria-hidden>→</span></>}
        </motion.button>
        <span className="fine center">You pay nothing now. Cash on delivery.</span>
      </aside>
    </form>
  );
}
