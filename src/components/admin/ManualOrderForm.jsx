"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createManualOrderAction, orderCheckAction } from "@/lib/admin-actions";
import { CHANNELS, ORDER_STATUS } from "@/lib/format";

const MODES = [
  ["link", "Send confirmation link", "The customer confirms from their link. Stock is reserved until then."],
  ["confirmed", "Already confirmed", "They said yes on chat or call. Stock is deducted now."],
  ["handed", "Paid and handed over", "Walk-in sale: the customer took it. No delivery."],
];

/**
 * Order entry for WhatsApp, Instagram, phone and walk-in sales.
 * `products` = [{ id, name, image, price, variants: [{ id, label, stock }] }] with stock = what can be sold.
 */
export default function ManualOrderForm({ products, staff, me, currency, defaultShipping, freeOver, exchange }) {
  const router = useRouter();
  const [channel, setChannel] = useState(exchange ? exchange.channel : "whatsapp");
  const [mode, setMode] = useState("link");
  const [c, setC] = useState({ phone: exchange?.phone || "", name: exchange?.name || "", email: exchange?.email || "", address: exchange?.address || "", city: exchange?.city || "", notes: exchange ? `Exchange for ${exchange.number}` : "" });
  const [items, setItems] = useState([]); // [{ variantId, qty }]
  const [q, setQ] = useState("");
  const [discount, setDiscount] = useState("");
  const [shipping, setShipping] = useState(null); // null = automatic
  const [assignedTo, setAssignedTo] = useState(me);
  const [check, setCheck] = useState({ customer: null, duplicates: [] });
  const [error, setError] = useState("");
  const [saving, start] = useTransition();

  const fmt = (n) => `${currency} ${Number(n || 0).toLocaleString("en-US")}`;
  const set = (key) => (e) => setC((v) => ({ ...v, [key]: e.target.value }));
  const handed = mode === "handed";

  // a walk-in sale is a store sale
  useEffect(() => { if (channel === "store") setMode("handed"); }, [channel]);

  // look the phone up as it is typed: returning customer details + duplicate warning
  const variantKey = items.map((i) => i.variantId).join(",");
  useEffect(() => {
    if (c.phone.replace(/\D/g, "").length < 10) { setCheck({ customer: null, duplicates: [] }); return; }
    let live = true;
    const t = setTimeout(async () => { const res = await orderCheckAction(c.phone, items.map((i) => i.variantId)); if (live) setCheck(res); }, 350);
    return () => { live = false; clearTimeout(t); };
  }, [c.phone, variantKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const fill = () => setC((v) => ({ ...v, name: check.customer.name || v.name, email: check.customer.email || v.email, address: check.customer.address || v.address, city: check.customer.city || v.city }));

  const variantInfo = useMemo(() => {
    const map = new Map();
    for (const p of products) for (const v of p.variants) map.set(v.id, { ...v, product: p });
    return map;
  }, [products]);
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (needle ? products.filter((p) => p.name.toLowerCase().includes(needle)) : products).slice(0, 6);
  }, [products, q]);

  const add = (variantId) => setItems((list) => {
    const max = variantInfo.get(variantId).stock;
    const found = list.find((i) => i.variantId === variantId);
    if (found) return list.map((i) => (i === found ? { ...i, qty: Math.min(max, i.qty + 1) } : i));
    return [...list, { variantId, qty: 1 }];
  });
  const setQty = (variantId, qty) => setItems((list) => (qty <= 0 ? list.filter((i) => i.variantId !== variantId) : list.map((i) => (i.variantId === variantId ? { ...i, qty: Math.min(variantInfo.get(variantId).stock, qty) } : i))));

  const subtotal = items.reduce((s, i) => s + variantInfo.get(i.variantId).product.price * i.qty, 0);
  const off = Math.min(subtotal, Math.max(0, parseInt(discount, 10) || 0));
  const autoShipping = handed ? 0 : freeOver > 0 && subtotal - off >= freeOver ? 0 : defaultShipping;
  const ship = handed ? 0 : shipping === null ? autoShipping : Math.max(0, parseInt(shipping, 10) || 0);

  const submit = (e) => {
    e.preventDefault();
    setError("");
    start(async () => {
      const res = await createManualOrderAction({ ...c, channel, mode, items, discount: off, shipping: ship, assignedTo, exchangeOf: exchange?.id });
      if (res.error) { setError(res.error); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
      router.push(`/admin/orders/${res.id}`);
    });
  };

  return (
    <form onSubmit={submit}>
      <div className="head">
        <div>
          <h1>{exchange ? `Exchange for ${exchange.number}` : "New order"}</h1>
          <p><Link href="/admin/orders" className="link">← All orders</Link> · For orders taken on WhatsApp, Instagram, the phone or in the shop.</p>
        </div>
        <div className="head__actions"><button className="btn" disabled={saving || !items.length}>{saving ? "Saving…" : "Create order"}</button></div>
      </div>
      {error && <div className="note note--bad" role="alert">{error}</div>}
      {check.duplicates.length > 0 && (
        <div className="note note--bad">
          <span>
            <b>Possible duplicate.</b> This phone already has an open order with one of these items:{" "}
            {check.duplicates.map((d, i) => <span key={d.id}>{i > 0 && ", "}<Link href={`/admin/orders/${d.id}`} target="_blank" className="link">{d.number}</Link> ({CHANNELS[d.channel]}, {ORDER_STATUS[d.status].label.toLowerCase()})</span>)}.
            Check before creating another.
          </span>
        </div>
      )}

      <div className="cols">
        <div>
          <div className="card">
            <h2>Where did it come from?</h2>
            <div className="choice" style={{ marginTop: 10 }}>
              {Object.entries(CHANNELS).filter(([k]) => k !== "website").map(([key, label]) => (
                <label key={key} className={channel === key ? "on" : ""}><input type="radio" name="channel" checked={channel === key} onChange={() => setChannel(key)} />{label}</label>
              ))}
            </div>
          </div>

          <div className="card">
            <h2>Items</h2>
            <p className="sub">Search a product, then click a size to add it. Numbers in brackets are what is available to sell.</p>
            <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products…" aria-label="Search products" />
            <div className="pick">
              {shown.map((p) => (
                <div className="pick__row" key={p.id}>
                  <div className="cell-prod"><img src={p.image || undefined} alt="" /><span><b>{p.name}</b><small>{fmt(p.price)}</small></span></div>
                  <div className="pick__sizes">
                    {p.variants.map((v) => (
                      <button type="button" key={v.id} disabled={v.stock <= 0} onClick={() => add(v.id)} className={items.some((i) => i.variantId === v.id) ? "on" : ""}>
                        {v.label} <span>({v.stock})</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {!shown.length && <p className="dim" style={{ padding: 12 }}>No products match “{q}”.</p>}
            </div>

            {items.length > 0 && (
              <div className="tablewrap" style={{ marginTop: 16 }}>
                <table className="table">
                  <thead><tr><th>In this order</th><th>Qty</th><th className="num">Price</th><th /></tr></thead>
                  <tbody>
                    {items.map((i) => {
                      const v = variantInfo.get(i.variantId);
                      return (
                        <tr key={i.variantId}>
                          <td><b>{v.product.name}</b><div className="dim">{v.label}</div></td>
                          <td><input className="stock-input" type="number" min="0" max={v.stock} value={i.qty} onChange={(e) => setQty(i.variantId, parseInt(e.target.value, 10) || 0)} aria-label="Quantity" /></td>
                          <td className="num">{fmt(v.product.price * i.qty)}</td>
                          <td className="num"><button type="button" className="link" onClick={() => setQty(i.variantId, 0)}>Remove</button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="card">
            <h2>Customer</h2>
            <div className="frow" style={{ marginTop: 10 }}>
              <div className="field"><label>Phone / WhatsApp{handed && " (optional)"}</label><input value={c.phone} onChange={set("phone")} type="tel" required={!handed} placeholder="03xx xxxxxxx" /></div>
              <div className="field"><label>Full name{handed && " (optional)"}</label><input value={c.name} onChange={set("name")} required={!handed} /></div>
            </div>
            {check.customer && (
              <div className={`note ${check.customer.flagged || check.customer.failed > 1 ? "note--warn" : "note--info"}`}>
                <span>
                  <b>Returning customer:</b> {check.customer.name || "known number"} · {check.customer.orders} earlier {check.customer.orders === 1 ? "order" : "orders"}
                  {check.customer.failed > 0 && <>, {check.customer.failed} cancelled or returned</>}
                  {check.customer.flagged && <> · <b>flagged</b></>}
                  {check.customer.notes && <> · “{check.customer.notes}”</>}
                  {" "}<button type="button" className="link" onClick={fill}>Use their saved details</button>
                </span>
              </div>
            )}
            {!handed && (
              <>
                <div className="field"><label>Complete address</label><input value={c.address} onChange={set("address")} required placeholder="House, street, area" /></div>
                <div className="frow">
                  <div className="field"><label>City</label><input value={c.city} onChange={set("city")} required /></div>
                  <div className="field"><label>Email (optional)</label><input value={c.email} onChange={set("email")} type="email" /></div>
                </div>
              </>
            )}
            <div className="field" style={{ marginBottom: 0 }}><label>Note for the team (optional)</label><input value={c.notes} onChange={set("notes")} maxLength={500} /></div>
          </div>
        </div>

        <div>
          <div className="card">
            <h2>What happens next?</h2>
            <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
              {MODES.map(([key, label, hint]) => (
                <label key={key} className={`radio-card ${mode === key ? "on" : ""}`}>
                  <input type="radio" name="mode" checked={mode === key} onChange={() => setMode(key)} />
                  <span><b>{label}</b><small>{hint}</small></span>
                </label>
              ))}
            </div>
          </div>

          <div className="card">
            <h2>Total</h2>
            <div className="frow" style={{ marginTop: 10 }}>
              <div className="field"><label>Discount ({currency})</label><input type="number" min="0" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0" /></div>
              {!handed && <div className="field"><label>Delivery ({currency})</label><input type="number" min="0" value={shipping === null ? autoShipping : shipping} onChange={(e) => setShipping(e.target.value)} /></div>}
            </div>
            <dl className="kv">
              <dt>Subtotal</dt><dd>{fmt(subtotal)}</dd>
              {off > 0 && <><dt>Discount</dt><dd>− {fmt(off)}</dd></>}
              {!handed && <><dt>Delivery</dt><dd>{ship ? fmt(ship) : "Free"}</dd></>}
              <dt><b>{handed ? "Paid" : "To collect (COD)"}</b></dt><dd><b>{fmt(subtotal - off + ship)}</b></dd>
            </dl>
          </div>

          <div className="card">
            <h2>Assign to</h2>
            <select className="input" value={assignedTo} onChange={(e) => setAssignedTo(Number(e.target.value))} style={{ marginTop: 8 }}>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.name || s.email}{s.id === me ? " (you)" : ""}</option>)}
            </select>
          </div>
          <button className="btn" style={{ width: "100%", marginTop: 16 }} disabled={saving || !items.length}>{saving ? "Saving…" : "Create order"}</button>
        </div>
      </div>
    </form>
  );
}
