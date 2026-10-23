import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrder } from "@/lib/orders";
import { getSettings } from "@/lib/settings";
import { query } from "@/lib/db";
import { listProducts, toCard } from "@/lib/catalog";
import { showcaseFor } from "@/lib/showcase";
import { money, fmtDate, ORDER_STATUS, waLink } from "@/lib/format";
import { STAGES, stageOf } from "@/lib/order-stages";
import { arrival } from "@/components/store/arrival";
import OrderActions from "@/components/store/OrderActions";
import ChangeOrder from "@/components/store/ChangeOrder";
import { changeUntil } from "@/lib/notify";
import OrderPlaced from "@/components/store/OrderPlaced";
import OrderLive from "@/components/store/OrderLive";
import ProductRail from "@/components/store/pdp/ProductRail";
import { CopyButton } from "@/components/store/Track";
import { Icon } from "@/components/store/icons";
import ReturnCenter from "@/components/store/ReturnCenter";
import { caseOptions, casesForOrder } from "@/lib/cases";
import { loyaltyFor } from "@/lib/crm";

export const metadata = { title: "Your order", robots: { index: false } };

// The customer's own order page (the link from their messages, the track page and checkout): status, journey,
// what is in it, where it goes, and the confirm / cancel buttons while it waits for them.
export default async function OrderPage({ params, searchParams }) {
  const { token } = await params;
  const { placed } = await searchParams;
  const [order, settings] = await Promise.all([getOrder("token", token), getSettings()]);
  if (!order) notFound();

  const { store, orders, shipping } = settings;
  const fmt = (n) => money(n, store.currency);
  const tz = store.timezone;
  const status = ORDER_STATUS[order.status] || { label: order.status, tone: "info" };
  const at = stageOf(order.status);
  const cancelled = at < 0;
  const first = order.customer_name.split(" ")[0];
  const pieces = order.items.reduce((s, i) => s + i.qty, 0);

  // product pages for the items (so they can be tapped), and a few pieces to show while they wait
  const ids = order.items.map((i) => i.product_id).filter(Boolean);
  const [slugRows, more] = await Promise.all([
    ids.length ? query("SELECT id, slug FROM products WHERE id = ANY($1::int[]) AND status = 'active'", [ids]) : [],
    listProducts({ sort: "featured" }),
  ]);
  const slugOf = Object.fromEntries(slugRows.map((r) => [r.id, r.slug]));
  // returns, exchanges and problem reports: once the order is on its way (see lib/cases.js)
  const [rmaOptions, rmaCases] = ["shipped", "delivered", "returned"].includes(order.status)
    ? await Promise.all([caseOptions(order, settings), casesForOrder(order.id)])
    : [null, []];
  // loyalty points and personal codes (rewards, store credit), and whether this order was rated yet
  const [loyalty, [rated]] = await Promise.all([
    loyaltyFor(order.contact_id),
    order.status === "delivered" ? query("SELECT rating FROM feedback WHERE order_id = $1", [order.id]) : [[]],
  ]);
  const crm = settings.crm;
  // after confirming: the short window to change or cancel (Settings -> Orders -> change_hours)
  const until = changeUntil(order, settings);
  let changeItems = [];
  if (until) {
    const variants = await query(
      `SELECT v.id, v.product_id, v.size, v.color, GREATEST(v.stock - v.reserved, 0) AS free FROM variants v JOIN products p ON p.id = v.product_id
       WHERE p.status = 'active' AND v.product_id = ANY($1::int[]) ORDER BY v.sort_order, v.id`, [ids]);
    const maxQty = Number(orders.max_qty) || 50;
    changeItems = order.items.map((i) => ({
      id: i.id, name: i.name, image: i.image_url, size: i.size, qty: i.qty, variantId: i.variant_id, price: i.unit_price,
      // what each size allows: what is free, plus what this order already holds of it
      options: variants.filter((v) => v.product_id === i.product_id).map((v) => ({
        id: v.id, label: v.color ? `${v.size} · ${v.color}` : v.size,
        max: Math.min(maxQty, v.free + (v.id === i.variant_id ? i.qty : 0)),
      })),
    }));
  }
  const picks = (await showcaseFor("waiting", more.filter((p) => p.total_stock > 0), { exclude: ids })).map(toCard);

  const headline =
    order.status === "pending" ? (placed ? "One last step: confirm it" : "Waiting for your confirmation")
    : order.status === "confirmed" ? `Confirmed. We are on it, ${first}`
    : order.status === "packed" ? `Packed and ready, ${first}`
    : order.status === "shipped" ? `On its way to you, ${first}`
    : order.status === "delivered" ? `Delivered. Enjoy it, ${first}`
    : order.status === "returned" ? "This order was returned"
    : "This order was cancelled";
  const next =
    order.status === "pending" ? "Confirm below and we pack it straight away. Until then the pieces stay reserved for you."
    : order.status === "confirmed" ? "We are picking and packing your pieces now. You get a message the moment it ships."
    : order.status === "packed" ? "Your parcel is packed and waiting for the courier. Tracking details follow as soon as it leaves."
    : order.status === "shipped" ? `With the courier now. Please keep ${fmt(order.total)} ready in cash for the rider.`
    : order.status === "delivered" ? "We hope you love it. If the size is not right, you can exchange it within 7 days."
    : `${order.cancel_reason || ""} The pieces are back on sale.`.trim();

  // when it should arrive: counted from the latest step it has reached
  const from = order.shipped_at || order.packed_at || order.confirmed_at;
  const eta =
    order.status === "delivered" ? { label: "Delivered", value: fmtDate(order.delivered_at, tz, false), note: "Thank you for shopping with us" }
    : cancelled ? null
    : order.status === "pending" ? { label: "Estimated arrival", value: arrival(shipping.eta) || shipping.eta, note: "If you confirm today" }
    : { label: "Estimated arrival", value: arrival(shipping.eta, from ? new Date(from) : new Date()) || shipping.eta, note: `Delivery takes ${shipping.eta}` };

  return (
    <>
      <section className="section--tight ordr">
        <div className="wrap">
          {placed && order.status === "pending" && <OrderPlaced number={order.number} first={first} total={fmt(order.total)} />}

          {/* rebuilt when the status changes (this page refreshes itself), so it carries no scroll-animation hooks */}
          <div className={`ordr__hero is-${status.tone}`} key={order.status}>
            <div className="ordr__head">
              <span className="eyebrow">
                Order <b>{order.number}</b> <CopyButton text={order.number} /> · placed {fmtDate(order.created_at, tz)}
              </span>
              <h1 className="display">{headline}</h1>
              <p>{next}</p>
              <span className={`status-pill ${status.tone}`}><i aria-hidden /> {order.status === "pending" ? "Awaiting your confirmation" : cancelled ? status.label : STAGES[at][1]}</span>
            </div>
            {eta && (
              <div className="ordr__eta">
                <span>{eta.label}</span>
                <b>{eta.value}</b>
                <small>{eta.note}</small>
              </div>
            )}
          </div>

          {/* the journey: the line fills to where the order is now */}
          {!cancelled && (
            <ol className="ordr__line" style={{ "--at": at / (STAGES.length - 1) }} aria-label="Order progress">
              {STAGES.map(([key, label, icon, col], i) => {
                const state = i < at || order.status === "delivered" ? "done" : i === at ? "now" : "todo";
                return (
                  <li key={key} className={`ordr__step is-${state}`} aria-current={state === "now" ? "step" : undefined}>
                    <span className="ordr__dot"><Icon name={state === "done" ? "check" : icon} /></span>
                    <b>{label}</b>
                    <small>{order[col] ? fmtDate(order[col], tz) : state === "now" ? "In progress" : "Next"}</small>
                  </li>
                );
              })}
            </ol>
          )}

          <div className="ordr__grid">
            <div className="ordr__items">
              <header><h2>In this order</h2><span>{pieces} {pieces === 1 ? "piece" : "pieces"}</span></header>
              <ul>
                {order.items.map((i) => {
                  const slug = slugOf[i.product_id];
                  const body = (
                    <>
                      <span className="ordr__img"><img src={i.image_url} alt="" width="72" height="90" /><i>{i.qty}</i></span>
                      <span className="ordr__name"><b>{i.name}</b><small>Size {i.size} · {fmt(i.unit_price)} each</small></span>
                      <span className="ordr__price">{fmt(i.unit_price * i.qty)}</span>
                    </>
                  );
                  return <li key={i.id}>{slug ? <Link href={`/products/${slug}`}>{body}</Link> : <div>{body}</div>}</li>;
                })}
              </ul>
              <div className="ordr__totals">
                <div className="row"><span>Subtotal</span><b>{fmt(order.subtotal)}</b></div>
                {order.discount > 0 && <div className="row is-ok"><span>Discount {order.coupon_code && <small>{order.coupon_code}</small>}</span><b>− {fmt(order.discount)}</b></div>}
                <div className="row"><span>Delivery</span><b>{order.shipping ? fmt(order.shipping) : "Free"}</b></div>
                <div className="row ordr__total"><span>Total</span><b>{fmt(order.total)}</b></div>
              </div>
            </div>

            <aside className="ordr__side">
              {order.status === "pending" && <OrderActions token={order.token} policy={orders.policy} changeHours={Number(orders.change_hours) || 0} />}

              {order.status === "shipped" && (
                <div className="ordr__card ordr__card--dark">
                  <span className="ordr__label"><Icon name="truck" /> With the courier</span>
                  <b className="ordr__courier">{order.courier || "Our delivery partner"}</b>
                  {order.tracking_number || order.ref ? (
                    <span className="ordr__tracking"><code>{order.tracking_number || order.ref}</code><CopyButton text={order.tracking_number || order.ref} label="Copy number" /></span>
                  ) : <small>The tracking number will be shared shortly.</small>}
                  {order.ref && order.tracking_number && <small>Our tracking number: {order.ref}</small>}
                </div>
              )}
              {until && (
                <ChangeOrder
                  token={order.token} items={changeItems} currency={store.currency}
                  until={new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "short", hour: "numeric", minute: "2-digit" }).format(until)}
                  address={order.address} city={order.city} notes={order.notes}
                />
              )}
              {!until && (order.status === "confirmed" || order.status === "packed") && (
                <div className="ordr__card">
                  <span className="ordr__label"><Icon name="check" /> Confirmed {order.confirmed_at && fmtDate(order.confirmed_at, tz)}</span>
                  <p>{order.status === "packed" ? "It is packed and can no longer be changed." : "It can no longer be changed from here."} We message you the moment it ships.</p>
                </div>
              )}
              {order.status === "delivered" && (
                <div className="ordr__card">
                  <span className="ordr__label"><Icon name="refresh" /> Not the right size?</span>
                  <p>{rmaOptions?.open ? `Exchange or return within ${rmaOptions.window} days of delivery, right from this page.` : "Something not right? You can report it on this page."}</p>
                  <a href="#returns" className="link-arrow">{rmaCases.length ? "See your requests" : "Start a request"}</a>
                  {!rated && <Link href={`/feedback/${order.token}`} className="link-arrow ordr__rate"><Icon name="star" /> Rate this order</Link>}
                </div>
              )}
              {loyalty && (crm.points_per_100 > 0 || loyalty.codes.length > 0) && (
                <div className="ordr__card ordr__card--points">
                  <span className="ordr__label">Your points</span>
                  <b className="ordr__points">{loyalty.points.toLocaleString("en-US")}</b>
                  {crm.reward_points > 0 && crm.points_per_100 > 0 && (
                    <>
                      <span className="fbk__bar"><i style={{ "--p": Math.min(1, loyalty.points / crm.reward_points) }} /></span>
                      <p>{loyalty.points >= crm.reward_points ? "Your next reward is on its way." : `${(crm.reward_points - loyalty.points).toLocaleString("en-US")} more for a ${fmt(crm.reward_value)} reward.`}</p>
                    </>
                  )}
                  {loyalty.codes.map((c) => <p key={c.code}>Code <code>{c.code}</code> · {fmt(c.value)} off{c.ends_at ? ` until ${fmtDate(c.ends_at, tz, false)}` : ""} <CopyButton text={c.code} label="Copy" /></p>)}
                  {crm.points_per_100 > 0 && <small>{order.status === "delivered" ? (order.points_awarded ? `This order earned ${order.points_awarded} points.` : "") : `This order earns about ${Math.floor((order.total / 100) * crm.points_per_100)} points once delivered.`}</small>}
                </div>
              )}
              {cancelled && (
                <div className="ordr__card ordr__card--bad">
                  <span className="ordr__label"><Icon name="close" /> {status.label}</span>
                  <p>{order.cancel_reason || "This order will not be delivered."}</p>
                  <Link href="/products" className="btn">Shop again <span aria-hidden>→</span></Link>
                </div>
              )}

              {!cancelled && order.status !== "delivered" && (
                <div className="ordr__card ordr__cash">
                  <span className="ordr__label"><Icon name="cash" /> Cash on delivery</span>
                  <b>{fmt(order.total)}</b>
                  <small>Pay the rider when it arrives. Nothing to pay before.</small>
                </div>
              )}

              <div className="ordr__card">
                <span className="ordr__label"><Icon name="pin" /> Delivering to</span>
                <b>{order.customer_name}</b>
                <p>{order.address}, {order.city}<br />+{order.phone}</p>
              </div>

              <div className="ordr__help">
                {store.whatsapp && (
                  <a className="btn btn--ghost btn--block" href={waLink(store.whatsapp, `Hi, I have a question about order ${order.number}`)} target="_blank" rel="noopener noreferrer">
                    <Icon name="whatsapp" /> Ask about this order
                  </a>
                )}
                <Link href="/products" className="link-arrow">Continue shopping</Link>
              </div>
            </aside>
          </div>

          {rmaOptions && (
            <ReturnCenter
              token={order.token} options={rmaOptions} cases={rmaCases} instructions={settings.returns.instructions} currency={settings.store.currency}
              until={rmaOptions.until ? fmtDate(rmaOptions.until, tz, false) : null}
            />
          )}
        </div>
      </section>

      {picks.length > 0 && <ProductRail eyebrow="While you wait" title="You might also like" items={picks} showcase="waiting" link="/products" linkLabel="Shop all" />}
      <OrderLive status={order.status} />
    </>
  );
}
