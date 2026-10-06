import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrder } from "@/lib/orders";
import { getSettings } from "@/lib/settings";
import { money, fmtDate, ORDER_STATUS, waLink } from "@/lib/format";
import OrderActions from "@/components/store/OrderActions";
import { CopyButton } from "@/components/store/Track";
import { Icon } from "@/components/store/icons";

export const metadata = { title: "Your order", robots: { index: false } };

// [status, label, icon, timestamp column]
const STEPS = [
  ["pending", "Placed", "bag", "created_at"],
  ["confirmed", "Confirmed", "check", "confirmed_at"],
  ["shipped", "Shipped", "truck", "shipped_at"],
  ["delivered", "Delivered", "pin", "delivered_at"],
];

export default async function OrderPage({ params, searchParams }) {
  const { token } = await params;
  const { placed } = await searchParams;
  const [order, settings] = await Promise.all([getOrder("token", token), getSettings()]);
  if (!order) notFound();

  const { store, orders, shipping } = settings;
  const fmt = (n) => money(n, store.currency);
  const status = ORDER_STATUS[order.status];
  // customers see four stages; "packed" is still "confirmed" to them
  const stage = order.status === "packed" ? "confirmed" : order.status;
  const stepIndex = STEPS.findIndex(([s]) => s === stage);
  const cancelled = ["cancelled", "returned"].includes(order.status);
  const first = order.customer_name.split(" ")[0];

  const headline =
    order.status === "pending" ? (placed ? "One last step: confirm your order" : "Please confirm your order")
    : cancelled ? (order.status === "returned" ? "Order returned" : "Order cancelled")
    : stage === "confirmed" ? `We are packing it, ${first}`
    : order.status === "shipped" ? `It is on its way, ${first}`
    : `Delivered. Enjoy, ${first}`;
  const next =
    order.status === "pending" ? "Confirm below and we dispatch straight away. Until then your items are reserved."
    : stage === "confirmed" ? `Your order is being packed. Once it ships, delivery takes ${shipping.eta}.`
    : order.status === "shipped" ? `With the courier now. Expect it within ${shipping.eta} of dispatch. Please keep ${fmt(order.total)} ready in cash.`
    : order.status === "delivered" ? "We hope you love it. If anything is not right, you have 7 days to exchange."
    : `${order.cancel_reason || ""} The items are back on sale.`;

  return (
    <section className="section--tight">
      <div className="wrap">
        <div className="order-head">
          <div>
            <span className="eyebrow" data-reveal>Order {order.number} · {fmtDate(order.created_at, store.timezone)}</span>
            <h1 className="display order-head__title" data-split>{headline}</h1>
            <p className="muted" data-reveal>{next}</p>
          </div>
          <span className={`status-pill ${status.tone}`} data-reveal>{status.label}</span>
        </div>

        {/* live tracking line: fills up to the current stage */}
        {!cancelled && (
          <ol className="track" style={{ "--progress": stepIndex / (STEPS.length - 1) }} data-reveal aria-label="Order progress">
            {STEPS.map(([s, label, icon, col], i) => {
              const state = i < stepIndex || order.status === "delivered" ? "done" : i === stepIndex ? "now" : "todo";
              return (
                <li key={s} className={`track__step track__step--${state}`} aria-current={state === "now" ? "step" : undefined}>
                  <span className="track__dot"><Icon name={state === "done" ? "check" : icon} /></span>
                  <b>{label}</b>
                  <small>{order[col] ? fmtDate(order[col], store.timezone) : state === "now" ? "In progress" : "Waiting"}</small>
                </li>
              );
            })}
          </ol>
        )}

        <div className="order-grid" style={{ marginTop: 32 }}>
          <div className="panel" style={{ display: "grid", gap: 16 }} data-reveal>
            <span className="label" style={{ margin: 0 }}>In this order</span>
            {order.items.map((i) => (
              <div className="item" key={i.id}>
                <img src={i.image_url} alt="" width="72" height="90" />
                <div><h4>{i.name}</h4><small>Size {i.size} · Qty {i.qty}</small></div>
                <div className="item__side"><span>{fmt(i.unit_price * i.qty)}</span></div>
              </div>
            ))}
            <hr style={{ border: 0, borderTop: "1px solid var(--line)", width: "100%", margin: 0 }} />
            <div className="row"><span>Subtotal</span><b>{fmt(order.subtotal)}</b></div>
            {order.discount > 0 && <div className="row"><span>Discount {order.coupon_code && `(${order.coupon_code})`}</span><b>− {fmt(order.discount)}</b></div>}
            <div className="row"><span>Delivery</span><b>{order.shipping ? fmt(order.shipping) : "Free"}</b></div>
            <div className="row" style={{ fontSize: "1.15rem", fontWeight: 700 }}><span>Total (cash on delivery)</span><b>{fmt(order.total)}</b></div>
          </div>

          <div style={{ display: "grid", gap: 24 }} data-reveal>
            {order.status === "pending" && <OrderActions token={order.token} policy={orders.policy} />}

            {stage === "confirmed" && (
              <div className="form-ok">Confirmed{order.confirmed_at && ` on ${fmtDate(order.confirmed_at, store.timezone)}`}. As agreed, a confirmed order can no longer be cancelled. We will message you the moment it ships.</div>
            )}
            {order.status === "shipped" && (
              <div className="courier">
                <span className="courier__icon"><Icon name="truck" /></span>
                <div>
                  <span className="label" style={{ margin: 0 }}>Courier</span>
                  <b>{order.courier || "Our delivery partner"}</b>
                </div>
                <div className="courier__no">
                  <span className="label" style={{ margin: 0 }}>Tracking number</span>
                  <b className="mono">{order.tracking_number || "Will be shared shortly"}</b>
                  {order.tracking_number && <CopyButton text={order.tracking_number} />}
                </div>
              </div>
            )}
            {order.status === "delivered" && <div className="form-ok">Delivered on {fmtDate(order.delivered_at, store.timezone, false)}. Enjoy!</div>}
            {cancelled && (
              <div className="form-error">
                This order was {order.status}. {order.cancel_reason} <Link href="/products" style={{ textDecoration: "underline" }}>Continue shopping</Link>
              </div>
            )}

            <div className="panel">
              <span className="label">Delivering to</span>
              <b>{order.customer_name}</b>
              <p className="muted">{order.address}, {order.city}<br />+{order.phone}</p>
            </div>
            {store.whatsapp && (
              <a className="btn btn--ghost btn--block" href={waLink(store.whatsapp, `Hi, I have a question about order ${order.number}`)} target="_blank" rel="noopener noreferrer">
                Need help? Chat on WhatsApp
              </a>
            )}
            {order.status !== "pending" && <Link href="/products" className="link-arrow" style={{ justifySelf: "start" }}>Continue shopping</Link>}
          </div>
        </div>
      </div>
    </section>
  );
}
