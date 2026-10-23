import Link from "next/link";
import { notFound } from "next/navigation";
import { query } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { fmtDate, ORDER_STATUS, waLink } from "@/lib/format";
import { STAGES, stageOf } from "@/lib/order-stages";
import { arrival } from "@/components/store/arrival";
import { CopyButton } from "@/components/store/Track";
import { Icon } from "@/components/store/icons";

export const metadata = { title: "Parcel tracking", robots: { index: false } };

/**
 * Where a parcel is, from our own tracking number (on the slip, the QR and the dispatch message). It shows the
 * progress only: no name, address or items, so anyone holding the number (a courier, a neighbour) can check it.
 * The full order stays behind the customer's private order link.
 */
export default async function ParcelTracking({ params }) {
  const { ref } = await params;
  const code = String(ref || "").toUpperCase();
  if (!/^[A-Z0-9]{2,6}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code)) notFound();
  const [[o], settings] = await Promise.all([
    query(
      `SELECT number, ref, status, city, courier, tracking_number, created_at, confirmed_at, packed_at, shipped_at, delivered_at,
              (SELECT COALESCE(sum(qty), 0)::int FROM order_items i WHERE i.order_id = orders.id) AS pieces
       FROM orders WHERE ref = $1`, [code]),
    getSettings(),
  ]);
  if (!o) notFound();
  const { store, shipping } = settings;
  const tz = store.timezone;
  const at = stageOf(o.status);
  const ended = at < 0;
  const status = ORDER_STATUS[o.status];
  const from = o.shipped_at || o.packed_at || o.confirmed_at;
  const eta = o.status === "delivered" ? fmtDate(o.delivered_at, tz, false) : ended ? null : arrival(shipping.eta, from ? new Date(from) : new Date()) || shipping.eta;

  const headline =
    o.status === "pending" ? "Waiting for confirmation"
    : o.status === "confirmed" ? "Confirmed and being packed"
    : o.status === "packed" ? "Packed, waiting for the courier"
    : o.status === "shipped" ? `On its way to ${o.city}`
    : o.status === "delivered" ? "Delivered"
    : o.status === "returned" ? "Returned to us"
    : "Cancelled";

  return (
    <section className="section--tight ordr trackref">
      <div className="wrap">
        <div className={`ordr__hero is-${status.tone}`}>
          <div className="ordr__head">
            <span className="eyebrow">Tracking <b>{o.ref}</b> <CopyButton text={o.ref} /> · order {o.number}</span>
            <h1 className="display">{headline}</h1>
            <p>
              {o.pieces} {o.pieces === 1 ? "piece" : "pieces"} to {o.city}
              {o.courier ? ` · with ${o.courier}` : ""}{o.tracking_number ? ` (courier number ${o.tracking_number})` : ""}.
            </p>
            <span className={`status-pill ${status.tone}`}><i aria-hidden /> {ended ? status.label : STAGES[at][1]}</span>
          </div>
          {eta && (
            <div className="ordr__eta">
              <span>{o.status === "delivered" ? "Delivered" : "Estimated arrival"}</span>
              <b>{eta}</b>
              <small>{o.status === "delivered" ? `Thank you for shopping with ${store.name}` : `Delivery takes ${shipping.eta}`}</small>
            </div>
          )}
        </div>

        {!ended && (
          <ol className="ordr__line" style={{ "--at": at / (STAGES.length - 1) }} aria-label="Parcel progress">
            {STAGES.map(([key, label, icon, col], i) => {
              const state = i < at || o.status === "delivered" ? "done" : i === at ? "now" : "todo";
              return (
                <li key={key} className={`ordr__step is-${state}`} aria-current={state === "now" ? "step" : undefined}>
                  <span className="ordr__dot"><Icon name={state === "done" ? "check" : icon} /></span>
                  <b>{label}</b>
                  <small>{o[col] ? fmtDate(o[col], tz) : state === "now" ? "In progress" : "Next"}</small>
                </li>
              );
            })}
          </ol>
        )}

        <div className="trackref__help">
          <p>Is this your order? The full details, returns and exchanges are on your order page: the link is in the message we sent you.</p>
          <div className="trackref__cta">
            <Link href="/track" className="btn btn--ghost">Open my order</Link>
            {store.whatsapp && <a className="btn" href={waLink(store.whatsapp, `Hi ${store.name}, a question about my parcel ${o.ref} (order ${o.number}).`)} target="_blank" rel="noopener noreferrer"><Icon name="chat" /> Ask on WhatsApp</a>}
          </div>
        </div>
      </div>
    </section>
  );
}
