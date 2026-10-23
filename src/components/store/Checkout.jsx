"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { quoteAction, placeOrderAction, saveCheckoutAction } from "@/lib/store-actions";
import { normalizePhone, isEmail } from "@/lib/format";
import Counter from "@/components/bits/Counter/Counter";
import { useStore } from "./Shell";
import { Icon } from "./icons";
import { ORDERS_KEY } from "./Track";
import { arrival } from "./arrival";
import HumanCheck from "./HumanCheck";

const EASE = [0.16, 1, 0.3, 1];
const DETAILS_KEY = "tba_details"; // the customer's own details, kept on their device when they ask for it
const FIELDS = ["name", "phone", "email", "address", "city", "notes"];
const STEPS = [
  ["contact", "Contact", ["name", "phone", "email"]],
  ["delivery", "Delivery", ["address", "city"]],
  ["review", "Review", []],
];
// suggestions only: any city can still be typed (shown for Pakistan numbers; other countries just type)
const PK_CITIES = [
  "Karachi", "Lahore", "Islamabad", "Rawalpindi", "Faisalabad", "Multan", "Peshawar", "Quetta", "Sialkot", "Gujranwala",
  "Hyderabad", "Abbottabad", "Bahawalpur", "Sargodha", "Sukkur", "Larkana", "Sheikhupura", "Rahim Yar Khan", "Gujrat", "Mardan",
  "Kasur", "Dera Ghazi Khan", "Sahiwal", "Okara", "Mirpur Khas", "Nawabshah", "Chiniot", "Jhelum", "Khanewal", "Jhang",
  "Muzaffargarh", "Vehari", "Hafizabad", "Sadiqabad", "Mandi Bahauddin", "Chakwal", "Attock", "Wah Cantt", "Taxila", "Murree",
  "Mirpur", "Muzaffarabad", "Gilgit", "Skardu", "Mingora (Swat)", "Mansehra", "Haripur", "Nowshera", "Charsadda", "Kohat",
  "Bannu", "Dera Ismail Khan", "Toba Tek Singh", "Gwadar", "Turbat", "Khuzdar",
];

/** The same rules the server applies (lib/orders.js readCustomer), checked as the customer types. */
function check(name, value, cc) {
  const v = String(value || "").trim();
  if (name === "name") return v.length >= 2 ? "" : "Please enter your full name";
  if (name === "phone") { const n = normalizePhone(v, cc).length; return n >= 11 && n <= 15 ? "" : "Enter a mobile number, e.g. 0300 1234567"; }
  if (name === "email") return !v || isEmail(v) ? "" : "That email does not look right (or leave it empty)";
  if (name === "address") return v.length >= 8 ? "" : "House number, street and area, please";
  if (name === "city") return v.length >= 2 ? "" : "Which city should we deliver to?";
  return "";
}

/** "03001234567" -> "0300 1234567" once typed in full (Pakistani mobiles); anything else is left as typed. */
const prettyPhone = (v) => { const d = String(v).replace(/\D/g, ""); return d.length === 11 && d.startsWith("03") ? `${d.slice(0, 4)} ${d.slice(4)}` : v; };

/**
 * A text field: label above, a green tick once valid, the message below once the customer has left the field
 * (or tried to continue). `shake` replays a short shake when they try to move on with it wrong.
 */
const SHAKE = [{ translate: "0" }, { translate: "-8px" }, { translate: "8px" }, { translate: "-5px" }, { translate: "5px" }, { translate: "0" }];

function Field({ id, label, optional, error, touched, shake, children, hint }) {
  const ok = touched && !error;
  const bad = touched && error;
  const ref = useRef(null);
  // replay the shake each time the customer tries to move on with this field wrong (the input itself is untouched)
  useEffect(() => { if (shake && bad) ref.current?.animate(SHAKE, { duration: 400 }); }, [shake]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className={`cfield ${ok ? "is-ok" : ""} ${bad ? "is-bad" : ""}`} data-field={id} ref={ref}>
      <label htmlFor={id}>{label}{optional && <em> (optional)</em>}</label>
      <div className="cfield__box">
        {children}
        <AnimatePresence>
          {ok && (
            <motion.span className="cfield__tick" initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0, opacity: 0 }} transition={{ type: "spring", stiffness: 500, damping: 24 }}>
              <Icon name="check" />
            </motion.span>
          )}
        </AnimatePresence>
      </div>
      <AnimatePresence initial={false}>
        {bad ? (
          <motion.p key="e" className="cfield__msg" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>{error}</motion.p>
        ) : hint ? (
          <motion.p key="h" className="cfield__hint" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>{hint}</motion.p>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/** City with suggestions as you type (keyboard: arrows + Enter). Typing a city that is not listed is fine. */
function CityInput({ value, onChange, onBlur, cities }) {
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState(0);
  const q = value.trim().toLowerCase();
  const list = q ? cities.filter((c) => c.toLowerCase().includes(q) && c.toLowerCase() !== q).sort((a, b) => a.toLowerCase().indexOf(q) - b.toLowerCase().indexOf(q)).slice(0, 6) : [];
  const choose = (c) => { onChange(c); setOpen(false); };
  return (
    <div className="ccity">
      <input
        id="city" name="city" autoComplete="address-level2" enterKeyHint="next" value={value} role="combobox"
        aria-expanded={open && list.length > 0} aria-controls="city-list" aria-autocomplete="list"
        onChange={(e) => { onChange(e.target.value); setOpen(true); setAt(0); }}
        onFocus={() => setOpen(true)} onBlur={() => { setTimeout(() => setOpen(false), 120); onBlur(); }}
        onKeyDown={(e) => {
          if (!open || !list.length) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setAt((a) => (a + 1) % list.length); }
          if (e.key === "ArrowUp") { e.preventDefault(); setAt((a) => (a - 1 + list.length) % list.length); }
          if (e.key === "Enter") { e.preventDefault(); choose(list[at]); }
        }}
      />
      <AnimatePresence>
        {open && list.length > 0 && (
          <motion.ul id="city-list" role="listbox" className="ccity__list" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}>
            {list.map((c, i) => (
              <li key={c} role="option" aria-selected={i === at} className={i === at ? "is-on" : ""} onMouseDown={(e) => { e.preventDefault(); choose(c); }}>
                <Icon name="pin" /> {c}
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function Checkout({ policy, eta, freeOver, pointsPer = 0 }) {
  const router = useRouter();
  const { cart, loaded, fmt, clear, store } = useStore();
  const cc = store.country_code || "92";
  const [quote, setQuote] = useState(null);
  const [quoting, setQuoting] = useState(false);
  const [coupon, setCoupon] = useState({ input: "", applied: "" });
  const [error, setError] = useState("");
  const [phase, setPhase] = useState("idle"); // idle | placing | placed
  // the free bot check (Cloudflare Turnstile) when the shop has set it up; remounted to get a fresh pass after a failure
  const [human, setHuman] = useState("");
  const [humanRound, setHumanRound] = useState(0);
  const [values, setValues] = useState(() => Object.fromEntries(FIELDS.map((f) => [f, ""])));
  const [touched, setTouched] = useState({});
  const [shake, setShake] = useState(0);
  const [optIn, setOptIn] = useState(true);
  const [remember, setRemember] = useState(true);
  const [returning, setReturning] = useState("");
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [narrow, setNarrow] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [when, setWhen] = useState(null);
  const formRef = useRef(null);
  const placing = phase !== "idle";

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 900px)");
    const sync = () => setNarrow(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  // a returning customer finds their details already filled in (kept only on this device, only if they asked)
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(DETAILS_KEY) || "null");
      if (saved?.name) {
        setValues((v) => ({ ...v, ...Object.fromEntries(FIELDS.filter((f) => f !== "notes" && saved[f]).map((f) => [f, saved[f]])) }));
        setTouched(Object.fromEntries(FIELDS.filter((f) => saved[f]).map((f) => [f, true])));
        setReturning(saved.name.split(" ")[0]);
      }
    } catch {}
    setWhen(arrival(eta));
  }, [eta]);

  // the server prices the bag; the browser's numbers are never trusted
  useEffect(() => {
    if (!loaded || placing) return;
    let live = true;
    setQuoting(true);
    // a personal code (store credit, a reward) is checked against the phone or email typed so far
    quoteAction(cart.map(({ variantId, qty }) => ({ variantId, qty })), coupon.applied, coupon.applied ? { phone: values.phone, email: values.email } : null)
      .then((q) => live && setQuote(q))
      .finally(() => live && setQuoting(false));
    return () => { live = false; };
  }, [cart, loaded, coupon.applied, placing]);

  const errors = useMemo(() => Object.fromEntries(FIELDS.map((f) => [f, check(f, values[f], cc)])), [values, cc]);
  const set = (name) => (e) => setValues((v) => ({ ...v, [name]: typeof e === "string" ? e : e.target.value }));
  const blur = (name) => () => {
    setTouched((t) => ({ ...t, [name]: true }));
    if (name === "phone") setValues((v) => ({ ...v, phone: prettyPhone(v.phone) }));
  };

  if (loaded && cart.length === 0 && phase === "idle") {
    return (
      <motion.div className="co-empty" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <span className="bag__empty-icon"><Icon name="bag" /></span>
        <h2 className="display">Your bag is empty</h2>
        <p>Add something you love and come back to check out.</p>
        <Link href="/products" className="btn">Shop the collection <span aria-hidden>→</span></Link>
      </motion.div>
    );
  }

  // if they agreed to be contacted, remember the unfinished checkout so one reminder can be sent later
  const rememberCart = () => {
    if (String(values.phone).replace(/\D/g, "").length < 10) return;
    saveCheckoutAction({ name: values.name, phone: values.phone, email: values.email, consent: optIn, items: cart.map(({ variantId, qty }) => ({ variantId, qty })) }).catch(() => {});
  };

  /** Show what is missing in these fields; true when they are all fine. */
  const validate = (names) => {
    const bad = names.filter((n) => errors[n]);
    setTouched((t) => ({ ...t, ...Object.fromEntries(names.map((n) => [n, true])) }));
    if (bad.length) {
      setShake((s) => s + 1);
      navigator.vibrate?.([10, 40, 10]);
      const el = formRef.current?.querySelector(`[data-field="${bad[0]}"]`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      setTimeout(() => el?.querySelector("input, textarea")?.focus({ preventScroll: true }), 350);
    }
    return !bad.length;
  };

  const go = (to) => {
    if (to > step && !validate(STEPS[step][2])) return;
    setDir(to > step ? 1 : -1);
    setStep(to);
    window.__lenis ? window.__lenis.scrollTo(0) : window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const submit = async (e) => {
    e.preventDefault();
    if (placing) return;
    if (narrow && step < 2) return go(step + 1);
    if (!validate(["name", "phone", "email", "address", "city"])) {
      if (narrow) { const first = STEPS.findIndex(([, , f]) => f.some((n) => errors[n])); if (first >= 0) { setDir(-1); setStep(first); } }
      return;
    }
    setError("");
    setPhase("placing");
    let res;
    try {
      // only a code the server accepted goes with the order: a wrong one left in the box must not block it
      res = await placeOrderAction({ ...values, optIn, human, coupon: couponState === "ok" ? coupon.applied : "", items: cart.map(({ variantId, qty }) => ({ variantId, qty })) });
    } catch {
      // the request never got an answer: offline, or the page is older than the latest version of the shop
      res = { error: "We could not reach the shop. Check your connection and press Place order again. If it keeps failing, refresh the page (your bag is saved)." };
    }
    if (!res || res.error || !res.token) {
      setError(res?.error || "Something went wrong. Please try again.");
      setPhase("idle");
      // a pass is used once: get a fresh one for the next try
      setHuman(""); setHumanRound((n) => n + 1);
      window.__lenis ? window.__lenis.scrollTo(0) : window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    try {
      // lets the track page offer one-tap access to this order later
      const mine = JSON.parse(localStorage.getItem(ORDERS_KEY) || "[]");
      localStorage.setItem(ORDERS_KEY, JSON.stringify([{ number: res.number, token: res.token, at: Date.now() }, ...mine].slice(0, 6)));
      if (remember) localStorage.setItem(DETAILS_KEY, JSON.stringify(Object.fromEntries(FIELDS.filter((f) => f !== "notes").map((f) => [f, values[f].trim()]))));
      else localStorage.removeItem(DETAILS_KEY);
    } catch {}
    setPhase("placed");
    navigator.vibrate?.(20);
    await new Promise((r) => setTimeout(r, 650));
    clear();
    router.push(`/order/${res.token}?placed=1`);
  };

  const forget = () => {
    try { localStorage.removeItem(DETAILS_KEY); } catch {}
    setValues(Object.fromEntries(FIELDS.map((f) => [f, ""])));
    setTouched({});
    setReturning("");
  };

  const applyCoupon = () => {
    const code = coupon.input.trim();
    if (!code) return;
    setCoupon((c) => ({ ...c, applied: code }));
  };
  const couponState = !coupon.applied ? "idle" : quoting ? "checking" : quote?.coupon?.error ? "bad" : quote?.coupon?.id ? "ok" : "idle";

  const after = quote ? quote.subtotal - quote.discount : 0;
  const toFree = quote && freeOver > 0 ? freeOver - after : 0;
  const lines = quote?.lines || [];
  const pieces = lines.reduce((s, l) => s + l.qty, 0);
  const show = (i) => !narrow || step === i;
  const blocked = !quote || quote.issues.length > 0;

  const totals = quote && (
    <div className="co-totals">
      <div className="row"><span>Subtotal</span><b>{fmt(quote.subtotal)}</b></div>
      <AnimatePresence initial={false}>
        {quote.discount > 0 && (
          <motion.div className="row is-ok" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
            <span>Discount <small>{quote.coupon?.code}</small></span><b>− {fmt(quote.discount)}</b>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="row"><span>Delivery</span><b>{quote.shipping ? fmt(quote.shipping) : <em className="is-free">Free</em>}</b></div>
      <div className="row co-total"><span>Total</span><b><Counter value={quote.total} prefix={`${store.currency} `} fontSize="inherit" intro={false} duration={0.6} /></b></div>
      {pointsPer > 0 && quote.total >= 100 && (
        <p className="co-points"><Icon name="star" /> You earn <b>{Math.floor((quote.total / 100) * pointsPer).toLocaleString("en-US")} points</b> once it is delivered</p>
      )}
    </div>
  );

  const placeButton = (
    <>
    <HumanCheck key={humanRound} onToken={setHuman} />
    <motion.button type="submit" className={`btn btn--block co-place is-${phase}`} whileTap={{ scale: 0.98 }} disabled={placing || blocked}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.span key={phase} initial={{ y: 14, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -14, opacity: 0 }} transition={{ duration: 0.2 }}>
          {phase === "placing" ? <><span className="spinner" aria-hidden /> Placing your order…</>
            : phase === "placed" ? <><Icon name="check" /> Order placed</>
            : narrow && step < 2 ? <>Continue to {STEPS[step + 1][1].toLowerCase()} <span aria-hidden>→</span></>
            : <>Place order{quote ? ` · ${fmt(quote.total)}` : ""} <span aria-hidden>→</span></>}
        </motion.span>
      </AnimatePresence>
      {phase === "placing" && <i className="co-place__bar" aria-hidden />}
    </motion.button>
    </>
  );

  const slide = {
    initial: (d) => ({ opacity: 0, x: narrow ? d * 40 : 0, y: narrow ? 0 : 16 }),
    animate: { opacity: 1, x: 0, y: 0, transition: { duration: 0.45, ease: EASE } },
    exit: (d) => ({ opacity: 0, x: narrow ? d * -40 : 0, transition: { duration: 0.2 } }),
  };

  return (
    <form className={`checkout2 ${narrow ? "is-steps" : ""}`} onSubmit={submit} ref={formRef} noValidate>
      {/* phones: where you are in three short steps */}
      {narrow && (
        <nav className="co-stepper" aria-label="Checkout steps">
          {STEPS.map(([key, label], i) => (
            <button key={key} type="button" className={i === step ? "is-now" : i < step ? "is-done" : ""} onClick={() => i < step && go(i)} disabled={i > step} aria-current={i === step ? "step" : undefined}>
              <span>{i < step ? <Icon name="check" /> : i + 1}</span>{label}
            </button>
          ))}
          <i className="co-stepper__line" aria-hidden><motion.b animate={{ scaleX: step / (STEPS.length - 1) }} transition={{ type: "spring", stiffness: 160, damping: 24 }} /></i>
        </nav>
      )}

      {/* phones: the order folds into one line at the top */}
      {narrow && (
        <div className={`co-fold ${summaryOpen ? "is-open" : ""}`}>
          <button type="button" className="co-fold__bar" onClick={() => setSummaryOpen((o) => !o)} aria-expanded={summaryOpen}>
            <span><Icon name="bag" /> {summaryOpen ? "Hide" : "Show"} order · {pieces} {pieces === 1 ? "piece" : "pieces"}</span>
            <b>{quote ? fmt(quote.total) : "…"}</b>
          </button>
          <AnimatePresence initial={false}>
            {summaryOpen && (
              <motion.div className="co-fold__body" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.35, ease: EASE }}>
                <ul className="co-lines">{lines.map((l) => <li key={l.variantId}><span className="co-lines__img"><img src={l.image} alt="" /><i>{l.qty}</i></span><div><b>{l.name}</b><small>Size {l.size}</small></div><span>{fmt(l.price * l.qty)}</span></li>)}</ul>
                {totals}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      <div className="co-main">
        <AnimatePresence>
          {error && (
            <motion.div className="form-error" role="alert" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
              {error}
            </motion.div>
          )}
        </AnimatePresence>
        {quote?.issues.map((i) => <div key={i.variantId} className="form-error">{i.message} Please update your bag.</div>)}

        <AnimatePresence>
          {returning && (
            <motion.div className="co-welcome" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }}>
              <Icon name="check" /> <span>Welcome back, <b>{returning}</b>. Your details are filled in.</span>
              <button type="button" onClick={forget}>Not you?</button>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait" custom={dir} initial={false}>
          {show(0) && (
            <motion.section key="contact" className="co-card" custom={dir} variants={slide} initial="initial" animate="animate" exit="exit">
              <h2><span>01</span> Contact</h2>
              <p className="co-card__note">We send your order confirmation and delivery updates here.</p>
              <Field id="name" label="Full name" error={errors.name} touched={touched.name} shake={shake}>
                <input id="name" name="name" autoComplete="name" enterKeyHint="next" value={values.name} onChange={set("name")} onBlur={blur("name")} />
              </Field>
              <div className="co-pair">
                <Field id="phone" label="Mobile / WhatsApp" error={errors.phone} touched={touched.phone} shake={shake} hint="Your confirmation link comes on WhatsApp">
                  <input id="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" enterKeyHint="next" placeholder="0300 1234567" value={values.phone} onChange={set("phone")} onBlur={() => { blur("phone")(); rememberCart(); }} />
                </Field>
                <Field id="email" label="Email" optional error={errors.email} touched={touched.email && values.email !== ""} shake={shake}>
                  <input id="email" name="email" type="email" inputMode="email" autoComplete="email" enterKeyHint="next" value={values.email} onChange={set("email")} onBlur={blur("email")} />
                </Field>
              </div>
            </motion.section>
          )}

          {show(1) && (
            <motion.section key="delivery" className="co-card" custom={dir} variants={slide} initial="initial" animate="animate" exit="exit">
              <h2><span>02</span> Delivery</h2>
              <Field id="address" label="Complete address" error={errors.address} touched={touched.address} shake={shake}>
                <input id="address" name="address" autoComplete="street-address" enterKeyHint="next" placeholder="House, street, area" value={values.address} onChange={set("address")} onBlur={blur("address")} />
              </Field>
              <Field id="city" label="City" error={errors.city} touched={touched.city} shake={shake}>
                <CityInput value={values.city} onChange={set("city")} onBlur={blur("city")} cities={cc === "92" ? PK_CITIES : []} />
              </Field>
              <Field id="notes" label="Note for the rider" optional>
                <textarea id="notes" name="notes" maxLength={500} rows={2} placeholder="Landmark, best time to call…" value={values.notes} onChange={set("notes")} />
              </Field>
              <div className="co-eta">
                <span className="co-eta__icon"><Icon name="truck" /></span>
                <div>
                  <b>{when ? `Arrives ${when}` : `Delivery in ${eta}`}</b>
                  <small>Counted from when you confirm · {toFree <= 0 && freeOver > 0 ? "free delivery" : quote?.shipping ? `${fmt(quote.shipping)} delivery` : "nationwide"}</small>
                </div>
              </div>
            </motion.section>
          )}

          {show(2) && (
            <motion.section key="review" className="co-card" custom={dir} variants={slide} initial="initial" animate="animate" exit="exit">
              <h2><span>03</span> Payment &amp; confirm</h2>
              <div className="co-pay">
                <span className="co-pay__icon"><Icon name="cash" /></span>
                <div><b>Cash on delivery</b><small>Pay the rider when it arrives. Nothing to pay now.</small></div>
                <span className="co-pay__tick"><Icon name="check" /></span>
              </div>
              <ol className="co-how">
                <li><b>Place the order</b><span>Your items are reserved for you.</span></li>
                <li><b>Confirm it</b><span>Tap the link we send on WhatsApp / email.</span></li>
                <li><b>We dispatch</b><span>{when ? `Expected ${when}.` : `Delivery in ${eta}.`}</span></li>
              </ol>
              <p className="co-policy"><Icon name="clock" /> {policy}</p>
              <label className="co-check">
                <input type="checkbox" checked={optIn} onChange={(e) => setOptIn(e.target.checked)} />
                <span className="co-check__box"><Icon name="check" /></span>
                <span>Send me new arrivals, offers and a reminder if I leave this order unfinished, on WhatsApp / email. Unsubscribe any time.</span>
              </label>
              <label className="co-check">
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                <span className="co-check__box"><Icon name="check" /></span>
                <span>Remember my details on this device for next time.</span>
              </label>
              {narrow && <div className="co-review-total">{totals}</div>}
            </motion.section>
          )}
        </AnimatePresence>

        {narrow && step > 0 && <button type="button" className="co-back link-arrow" onClick={() => go(step - 1)}>← Back to {STEPS[step - 1][1].toLowerCase()}</button>}
      </div>

      {/* desktop: the order, pinned beside the form */}
      {!narrow && (
        <aside className="co-summary" aria-label="Order summary">
          <header><h2>Your order</h2><span>{pieces} {pieces === 1 ? "piece" : "pieces"}</span></header>
          <ul className="co-lines">
            <AnimatePresence initial={false}>
              {lines.map((l) => (
                <motion.li key={l.variantId} layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                  <span className="co-lines__img"><img src={l.image} alt="" /><i>{l.qty}</i></span>
                  <div><b>{l.name}</b><small>Size {l.size}</small></div>
                  <span>{fmt(l.price * l.qty)}</span>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
          {!quote && <div className="skeleton" aria-label="Loading your bag" />}
          {quote && freeOver > 0 && (
            <div className={`co-free ${toFree <= 0 ? "is-done" : ""}`}>
              <span>{toFree > 0 ? <>Add <b>{fmt(toFree)}</b> more for free delivery</> : <><Icon name="truck" /> Free delivery unlocked</>}</span>
              <i><motion.b animate={{ scaleX: Math.min(1, after / freeOver) }} transition={{ type: "spring", stiffness: 120, damping: 20 }} /></i>
            </div>
          )}
          <CouponBox coupon={coupon} setCoupon={setCoupon} apply={applyCoupon} state={couponState} quote={quote} />
          {totals}
          {placeButton}
          <ul className="co-trust">
            <li><Icon name="cash" /> Pay on delivery</li>
            <li><Icon name="refresh" /> 7-day exchange</li>
            <li><Icon name="chat" /> WhatsApp help</li>
          </ul>
        </aside>
      )}

      {/* phones: discount code on the review step, then the total and button pinned to the bottom */}
      {narrow && step === 2 && <div className="co-main co-main--coupon"><CouponBox coupon={coupon} setCoupon={setCoupon} apply={applyCoupon} state={couponState} quote={quote} /></div>}
      {narrow && (
        <div className="co-dock">
          <div className="co-dock__total"><small>Total</small><b>{quote ? fmt(quote.total) : "…"}</b></div>
          {placeButton}
        </div>
      )}
    </form>
  );
}

/** Discount code: checks with the server, then shows the code as a chip (or shakes with the reason). */
function CouponBox({ coupon, setCoupon, apply, state, quote }) {
  const [open, setOpen] = useState(Boolean(coupon.applied));
  const row = useRef(null);
  useEffect(() => { if (state === "bad") row.current?.animate(SHAKE, { duration: 400 }); }, [state, coupon.applied]);
  if (state === "ok") {
    return (
      <motion.div className="co-coupon is-ok" initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
        <Icon name="tag" /> <span><b>{quote.coupon.code}</b> applied · {quote.coupon.label}</span>
        <button type="button" onClick={() => setCoupon({ input: "", applied: "" })} aria-label="Remove discount code"><Icon name="close" /></button>
      </motion.div>
    );
  }
  if (!open) return <button type="button" className="co-coupon__toggle" onClick={() => setOpen(true)}><Icon name="tag" /> Have a discount code?</button>;
  return (
    <motion.div className="co-coupon" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}>
      <div className="co-coupon__row" ref={row}>
        <input
          id="discount-code" name="discountCode" autoComplete="off" className="input" placeholder="Discount code" aria-label="Discount code" value={coupon.input} autoCapitalize="characters" enterKeyHint="done"
          onChange={(e) => setCoupon((c) => ({ ...c, input: e.target.value }))}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); apply(); } }}
        />
        <button type="button" className="btn btn--ghost" onClick={apply} disabled={state === "checking" || !coupon.input.trim()}>
          {state === "checking" ? <span className="spinner" aria-hidden /> : "Apply"}
        </button>
      </div>
      {state === "bad" && <p className="co-coupon__msg">{quote.coupon.error}</p>}
    </motion.div>
  );
}
