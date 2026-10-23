"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { createManualOrderAction, orderCheckAction } from "@/lib/admin-actions";
import { CHANNELS, ORDER_STATUS } from "@/lib/format";
import AdminIcon from "./icons";

const CHANNEL_ICON = { whatsapp: "whatsapp", instagram: "instagram", phone: "phone", store: "store", other: "more" };
const MODES = [
  ["link", "Send confirmation link", "They confirm from their link. Stock is held until then.", "send"],
  ["confirmed", "Already confirmed", "They said yes on chat or call. Stock is taken now.", "check"],
  ["handed", "Paid and handed over", "A walk-in sale: they took it with them.", "store"],
];
const PAGE = 8;
const ease = [0.16, 1, 0.3, 1];

/**
 * Taking an order from WhatsApp, Instagram, a call or the shop counter.
 * Left: where it came from, the products (tap a size to add it) and the customer, who is looked up as their number
 * is typed. Right: the ticket, which stays in view: lines, discount, delivery, what happens next and one button.
 * `products` = [{ id, name, image, price, was, category, variants: [{ id, label, stock }] }] with stock = what can be sold.
 */
export default function ManualOrderForm({ products, staff, me, currency, defaultShipping, freeOver, exchange }) {
  const router = useRouter();
  const [channel, setChannel] = useState(exchange ? exchange.channel : "whatsapp");
  const [mode, setMode] = useState("link");
  const [c, setC] = useState({ phone: exchange?.phone || "", name: exchange?.name || "", email: exchange?.email || "", address: exchange?.address || "", city: exchange?.city || "", notes: exchange ? `Exchange for ${exchange.number}` : "" });
  const [items, setItems] = useState([]); // [{ variantId, qty }]
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [discount, setDiscount] = useState("");
  const [shipping, setShipping] = useState(null); // null = automatic
  const [assignedTo, setAssignedTo] = useState(me);
  const [check, setCheck] = useState({ customer: null, duplicates: [] });
  const [looking, setLooking] = useState(false);
  const [error, setError] = useState("");
  const [bump, setBump] = useState(0); // the ticket count pops when something is added
  const [saving, start] = useTransition();
  const searchRef = useRef(null);

  const fmt = (n) => `${currency} ${Number(n || 0).toLocaleString("en-US")}`;
  const set = (key) => (e) => setC((v) => ({ ...v, [key]: e.target.value }));
  const handed = mode === "handed";

  // a walk-in sale is handed over on the spot
  useEffect(() => { if (channel === "store") setMode("handed"); else if (mode === "handed") setMode("link"); }, [channel]); // eslint-disable-line react-hooks/exhaustive-deps
  // "/" jumps to the product search
  useEffect(() => {
    const onKey = (e) => { if (e.key === "/" && !e.target.closest?.("input, textarea, select")) { e.preventDefault(); searchRef.current?.focus(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // look the phone up as it is typed: returning customer details + duplicate warning
  const variantKey = items.map((i) => i.variantId).join(",");
  useEffect(() => {
    if (c.phone.replace(/\D/g, "").length < 10) { setCheck({ customer: null, duplicates: [] }); setLooking(false); return; }
    let live = true;
    setLooking(true);
    const t = setTimeout(async () => {
      const res = await orderCheckAction(c.phone, items.map((i) => i.variantId)).catch(() => ({ customer: null, duplicates: [] }));
      if (live) { setCheck(res); setLooking(false); }
    }, 350);
    return () => { live = false; clearTimeout(t); };
  }, [c.phone, variantKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const fill = () => setC((v) => ({ ...v, name: check.customer.name || v.name, email: check.customer.email || v.email, address: check.customer.address || v.address, city: check.customer.city || v.city }));

  const variantInfo = useMemo(() => {
    const map = new Map();
    for (const p of products) for (const v of p.variants) map.set(v.id, { ...v, product: p });
    return map;
  }, [products]);
  const cats = useMemo(() => [...new Set(products.map((p) => p.category))], [products]);
  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return products.filter((p) => (!cat || p.category === cat) && (!needle || `${p.name} ${p.category}`.toLowerCase().includes(needle)));
  }, [products, q, cat]);
  useEffect(() => setLimit(PAGE), [q, cat]);

  const inOrder = (variantId) => items.find((i) => i.variantId === variantId)?.qty || 0;
  const add = (variantId) => {
    setItems((list) => {
      const max = variantInfo.get(variantId).stock;
      const found = list.find((i) => i.variantId === variantId);
      if (found) return list.map((i) => (i === found ? { ...i, qty: Math.min(max, i.qty + 1) } : i));
      return [...list, { variantId, qty: 1 }];
    });
    setBump((n) => n + 1);
  };
  const setQty = (variantId, qty) => setItems((list) => (qty <= 0 ? list.filter((i) => i.variantId !== variantId) : list.map((i) => (i.variantId === variantId ? { ...i, qty: Math.min(variantInfo.get(variantId).stock, qty) } : i))));

  const pieces = items.reduce((s, i) => s + i.qty, 0);
  const subtotal = items.reduce((s, i) => s + variantInfo.get(i.variantId).product.price * i.qty, 0);
  const off = Math.min(subtotal, Math.max(0, parseInt(discount, 10) || 0));
  const autoShipping = handed ? 0 : freeOver > 0 && subtotal - off >= freeOver ? 0 : defaultShipping;
  const ship = handed || !items.length ? 0 : shipping === null ? autoShipping : Math.max(0, parseInt(shipping, 10) || 0);
  const total = subtotal - off + ship;

  // what is still missing, said plainly next to the button
  const missing = !items.length ? "Add at least one piece"
    : !handed && !c.phone.trim() ? "Add the customer's phone"
    : !handed && !c.name.trim() ? "Add the customer's name"
    : !handed && (!c.address.trim() || !c.city.trim()) ? "Add the delivery address"
    : "";

  const submit = (e) => {
    e?.preventDefault();
    if (missing) { setError(missing + "."); return; }
    setError("");
    start(async () => {
      const res = await createManualOrderAction({ ...c, channel, mode, items, discount: off, shipping: ship, assignedTo, exchangeOf: exchange?.id }).catch(() => ({ error: "The order could not be saved. Please try again." }));
      if (res.error) { setError(res.error); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
      router.push(`/admin/orders/${res.id}`);
    });
  };

  const createLabel = saving ? "Creating…" : handed ? `Record sale · ${fmt(total)}` : `Create order · ${fmt(total)}`;

  return (
    <form onSubmit={submit} className="mo">
      <div className="head">
        <div>
          <h1>{exchange ? `Exchange for ${exchange.number}` : "New order"}</h1>
          <p><Link href="/admin/orders" className="link">← All orders</Link> · For orders taken on WhatsApp, Instagram, a call or at the counter. Press <kbd>/</kbd> to search products.</p>
        </div>
      </div>
      {error && <div className="note note--bad" role="alert">{error}</div>}
      {check.duplicates.length > 0 && (
        <div className="note note--bad">
          <span>
            <b>Possible duplicate.</b> This phone already has an open order with one of these pieces:{" "}
            {check.duplicates.map((d, i) => <span key={d.id}>{i > 0 && ", "}<Link href={`/admin/orders/${d.id}`} target="_blank" className="link">{d.number}</Link> ({CHANNELS[d.channel]}, {ORDER_STATUS[d.status].label.toLowerCase()})</span>)}.
            Check before creating another.
          </span>
        </div>
      )}

      <div className="mo__grid">
        <div className="mo__main">
          <section className="card mo__step">
            <span className="mo__num">1</span>
            <h2>Where did it come from?</h2>
            <div className="mo__channels" role="radiogroup" aria-label="Channel">
              {Object.entries(CHANNELS).filter(([k]) => k !== "website").map(([key, label]) => (
                <button key={key} type="button" role="radio" aria-checked={channel === key} className={`mo__channel mo__channel--${key} ${channel === key ? "on" : ""}`} onClick={() => setChannel(key)}>
                  <AdminIcon name={CHANNEL_ICON[key] || "more"} /><span>{label}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="card mo__step">
            <span className="mo__num">2</span>
            <div className="mo__stephead">
              <h2>Pieces</h2>
              <span className="dim">{matches.length} of {products.length} · tap a size to add it</span>
            </div>
            <div className="mo__find">
              <label className="invx__search">
                <AdminIcon name="search" />
                <input ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a product" aria-label="Find a product" />
                {q && <button type="button" onClick={() => setQ("")} aria-label="Clear search"><AdminIcon name="x" /></button>}
              </label>
              <div className="mo__cats">
                <button type="button" className={!cat ? "on" : ""} onClick={() => setCat("")}>All</button>
                {cats.map((k) => <button type="button" key={k} className={cat === k ? "on" : ""} onClick={() => setCat(k)}>{k}</button>)}
              </div>
            </div>
            <div className="mo__products">
              {matches.slice(0, limit).map((p) => {
                const count = p.variants.reduce((s, v) => s + inOrder(v.id), 0);
                const left = p.variants.reduce((s, v) => s + v.stock, 0);
                return (
                  <article key={p.id} className={`mo__product ${count ? "has" : ""} ${left ? "" : "out"}`}>
                    <div className="mo__photo">
                      {p.image ? <img src={p.image} alt="" loading="lazy" /> : <i />}
                      {count > 0 && <motion.b key={count} initial={{ scale: 0.4 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 500, damping: 18 }}>{count}</motion.b>}
                      {!left && <span className="mo__soldout">Sold out</span>}
                    </div>
                    <div className="mo__pinfo">
                      <b>{p.name}</b>
                      <span>{fmt(p.price)}{p.was && <s>{fmt(p.was)}</s>}</span>
                    </div>
                    <div className="mo__sizes">
                      {p.variants.map((v) => {
                        const n = inOrder(v.id);
                        return (
                          <button type="button" key={v.id} disabled={v.stock <= 0 || n >= v.stock} onClick={() => add(v.id)} className={n ? "on" : ""}
                            title={v.stock <= 0 ? "Sold out" : `${v.stock} available`}>
                            {v.label}<small>{v.stock <= 0 ? "0" : v.stock}</small>
                          </button>
                        );
                      })}
                    </div>
                  </article>
                );
              })}
            </div>
            {!matches.length && <p className="empty">No products match “{q}”.</p>}
            {matches.length > limit && <button type="button" className="btn btn--ghost mo__moreprod" onClick={() => setLimit((n) => n + PAGE)}>Show {Math.min(PAGE, matches.length - limit)} more</button>}
          </section>

          <section className="card mo__step">
            <span className="mo__num">3</span>
            <h2>Customer {handed && <span className="dim" style={{ fontWeight: 400, fontSize: 13 }}>(optional for a counter sale)</span>}</h2>
            <div className="frow" style={{ marginTop: 10 }}>
              <div className="field mo__phone">
                <label>Phone / WhatsApp</label>
                <input value={c.phone} onChange={set("phone")} type="tel" inputMode="tel" placeholder="03xx xxxxxxx" autoComplete="off" />
                {looking && <span className="mo__look" aria-label="Looking up this number" />}
              </div>
              <div className="field"><label>Full name</label><input value={c.name} onChange={set("name")} autoComplete="off" /></div>
            </div>
            <AnimatePresence initial={false}>
              {check.customer && (
                <motion.div key="known" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.3, ease }}
                  className={`mo__known ${check.customer.flagged || check.customer.failed > 1 ? "warn" : ""}`}>
                  <span className="mo__avatar">{(check.customer.name || "?").charAt(0).toUpperCase()}</span>
                  <span>
                    <b>{check.customer.name || "Known number"}</b> · returning customer, {check.customer.orders} earlier {check.customer.orders === 1 ? "order" : "orders"}
                    {check.customer.failed > 0 && <>, {check.customer.failed} cancelled or returned</>}
                    {check.customer.flagged && <> · <b>flagged</b></>}
                    {check.customer.notes && <small>“{check.customer.notes}”</small>}
                  </span>
                  <button type="button" className="btn btn--ghost btn--sm" onClick={fill}>Use saved details</button>
                </motion.div>
              )}
            </AnimatePresence>
            {!handed && (
              <>
                <div className="field"><label>Complete address</label><input value={c.address} onChange={set("address")} placeholder="House, street, area" /></div>
                <div className="frow">
                  <div className="field"><label>City</label><input value={c.city} onChange={set("city")} /></div>
                  <div className="field"><label>Email (optional)</label><input value={c.email} onChange={set("email")} type="email" /></div>
                </div>
              </>
            )}
            <div className="field" style={{ marginBottom: 0 }}><label>Note for the team (optional)</label><input value={c.notes} onChange={set("notes")} maxLength={500} placeholder="Gift wrap, call before delivery…" /></div>
          </section>
        </div>

        <aside className="mo__ticket">
          <div className="card mo__receipt">
            <div className="mo__rhead">
              <h2>Order</h2>
              <motion.span key={bump} className="mo__count" initial={{ scale: bump ? 1.35 : 1 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 420, damping: 16 }}>
                {pieces} {pieces === 1 ? "piece" : "pieces"}
              </motion.span>
            </div>

            {items.length ? (
              <ul className="mo__lines">
                <AnimatePresence initial={false}>
                  {items.map((i) => {
                    const v = variantInfo.get(i.variantId);
                    return (
                      <motion.li key={i.variantId} layout initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16, height: 0 }} transition={{ duration: 0.3, ease }}>
                        {v.product.image ? <img src={v.product.image} alt="" /> : <i />}
                        <span className="mo__lname"><b>{v.product.name}</b><small>{v.label} · {fmt(v.product.price)}</small></span>
                        <span className="mo__qty">
                          <button type="button" onClick={() => setQty(i.variantId, i.qty - 1)} aria-label={i.qty === 1 ? "Remove" : "One less"}><AdminIcon name={i.qty === 1 ? "trash" : "minus"} /></button>
                          <b>{i.qty}</b>
                          <button type="button" onClick={() => setQty(i.variantId, i.qty + 1)} disabled={i.qty >= v.stock} aria-label="One more"><AdminIcon name="plus" /></button>
                        </span>
                        <span className="mo__lprice">{fmt(v.product.price * i.qty)}</span>
                      </motion.li>
                    );
                  })}
                </AnimatePresence>
              </ul>
            ) : (
              <div className="mo__empty"><AdminIcon name="box" /><p>Tap a size on the left to start the order.</p></div>
            )}

            <div className="mo__adjust">
              <label><span>Discount</span><span className="mo__money"><i>{currency}</i><input type="number" min="0" inputMode="numeric" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0" /></span></label>
              {!handed && (
                <label><span>Delivery {shipping === null && <small>auto</small>}</span><span className="mo__money"><i>{currency}</i><input type="number" min="0" inputMode="numeric" value={shipping === null ? autoShipping : shipping} onChange={(e) => setShipping(e.target.value)} /></span></label>
              )}
            </div>

            <dl className="mo__sum">
              <dt>Subtotal</dt><dd>{fmt(subtotal)}</dd>
              {off > 0 && <><dt>Discount</dt><dd>− {fmt(off)}</dd></>}
              {!handed && <><dt>Delivery</dt><dd>{ship ? fmt(ship) : "Free"}</dd></>}
            </dl>
            <div className="mo__total"><span>{handed ? "Paid" : "To collect (COD)"}</span><b>{fmt(total)}</b></div>

            <span className="sc__label">What happens next</span>
            <div className="mo__modes" role="radiogroup" aria-label="What happens next">
              {MODES.filter(([key]) => key !== "handed" || channel === "store" || handed).map(([key, label, hint, icon]) => (
                <button type="button" key={key} role="radio" aria-checked={mode === key} className={`mo__mode ${mode === key ? "on" : ""}`} onClick={() => setMode(key)}>
                  <AdminIcon name={icon} /><span><b>{label}</b><small>{hint}</small></span>
                </button>
              ))}
            </div>

            <label className="mo__assign">
              <span>Handled by</span>
              <select className="input" value={assignedTo} onChange={(e) => setAssignedTo(Number(e.target.value))}>
                {staff.map((s) => <option key={s.id} value={s.id}>{s.name || s.email}{s.id === me ? " (you)" : ""}</option>)}
              </select>
            </label>

            <button className="btn mo__create" disabled={saving}>{createLabel}</button>
            <small className={`mo__missing ${missing ? "" : "ok"}`}>{missing || (mode === "link" ? "The customer gets their confirmation link right away." : "Ready to go.")}</small>
          </div>
        </aside>
      </div>

      {/* phones: the total and the button stay at hand */}
      <div className={`mo__dock ${items.length ? "on" : ""}`}>
        <span><small>{pieces} {pieces === 1 ? "piece" : "pieces"}</small><b>{fmt(total)}</b></span>
        <button className="btn" disabled={saving}>{saving ? "Creating…" : handed ? "Record sale" : "Create order"}</button>
      </div>
    </form>
  );
}
