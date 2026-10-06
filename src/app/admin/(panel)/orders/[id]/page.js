import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePerm } from "@/lib/auth";
import { query } from "@/lib/db";
import { getOrder, findDuplicates } from "@/lib/orders";
import { getSettings, siteUrl } from "@/lib/settings";
import { orderStatusAction, assignOrderAction, orderNoteAction } from "@/lib/admin-actions";
import { money, fmtDate, ORDER_STATUS, CHANNELS, waLink, can } from "@/lib/format";
import { ConfirmButton, WhatsAppSend } from "@/components/admin/Widgets";

export const metadata = { title: "Order" };

const MSG_TONE = { sent: "ok", queued: "info", sending: "info", manual: "warn", failed: "bad", skipped: "" };
const MSG_LABEL = { sent: "Sent", queued: "Queued", sending: "Sending", manual: "Waiting for you", failed: "Failed", skipped: "Not sent" };

export default async function OrderDetail({ params, searchParams }) {
  const viewer = await requirePerm("orders");
  const { id } = await params;
  const { error } = await searchParams;
  const [order, settings] = await Promise.all([getOrder("id", Number(id) || 0), getSettings()]);
  if (!order) notFound();
  const [messages, events, staff, duplicates, [history], exchanges] = await Promise.all([
    query("SELECT * FROM messages WHERE order_id = $1 AND kind NOT LIKE 'owner_%' AND kind <> 'staff_assigned' ORDER BY id", [order.id]),
    query("SELECT * FROM order_events WHERE order_id = $1 ORDER BY id DESC", [order.id]),
    query("SELECT id, name, email FROM admins WHERE is_active ORDER BY name"),
    findDuplicates(order.id),
    query(
      `SELECT count(*)::int AS orders, count(*) FILTER (WHERE status IN ('cancelled', 'returned'))::int AS failed
       FROM orders WHERE phone = $1 AND phone <> '0' AND id <> $2`, [order.phone, order.id]),
    query("SELECT id, number, exchange_of FROM orders WHERE exchange_of = $1 OR id = $2", [order.id, order.exchange_of || 0]),
  ]);

  const tz = settings.store.timezone;
  const fmt = (n) => money(n, settings.store.currency);
  const st = ORDER_STATUS[order.status];
  const walkIn = order.phone === "0";
  const Status = ({ status, children }) => (
    <form action={orderStatusAction} style={{ display: "grid", gap: 10 }}>
      <input type="hidden" name="id" value={order.id} />
      <input type="hidden" name="status" value={status} />
      {children}
    </form>
  );

  return (
    <>
      <div className="head">
        <div>
          <h1>{order.number} <span className={`pill ${st.tone}`} style={{ verticalAlign: "middle" }}>{st.label}</span></h1>
          <p>
            <Link href="/admin/orders" className="link">← All orders</Link>
            {" · "}<span className={`chan chan--${order.channel}`}>{CHANNELS[order.channel] || order.channel}</span>
            {" · "}{fmtDate(order.created_at, tz)}
            {!walkIn && <> · <a className="link" href={`${siteUrl()}/order/${order.token}`} target="_blank">Customer's order page ↗</a></>}
          </p>
        </div>
        <div className="head__actions">
          <Link href={`/admin/orders/new?exchange=${order.id}`} className="btn btn--ghost">Create exchange order</Link>
        </div>
      </div>
      {error && <div className="note note--bad">{error}</div>}

      {duplicates.length > 0 && (
        <div className="note note--bad">
          <span>
            <b>Possible duplicate.</b> This customer has {duplicates.length === 1 ? "another open order" : `${duplicates.length} other open orders`} with the same item, placed within {settings.orders.duplicate_hours} hours:{" "}
            {duplicates.map((d, i) => (
              <span key={d.id}>{i > 0 && ", "}<Link href={`/admin/orders/${d.id}`} className="link">{d.number}</Link> ({CHANNELS[d.channel]}, {ORDER_STATUS[d.status].label.toLowerCase()})</span>
            ))}. Check with the customer and cancel the one they do not want.
          </span>
        </div>
      )}
      {exchanges.filter((e) => e.id !== order.id).map((e) => (
        <div className="note note--info" key={e.id}>
          {e.exchange_of === order.id ? <>Exchange order created: </> : <>This is an exchange for </>}
          <Link href={`/admin/orders/${e.id}`} className="link">{e.number}</Link>.
        </div>
      ))}

      <div className="cols">
        <div>
          <div className="card">
            <h2>Items</h2>
            <div className="tablewrap" style={{ margin: "8px -22px 0" }}>
              <table className="table">
                <tbody>
                  {order.items.map((i) => (
                    <tr key={i.id}>
                      <td><div className="cell-prod"><img src={i.image_url || undefined} alt="" /><span><b>{i.name}</b><small>{i.size}</small></span></div></td>
                      <td className="num">{fmt(i.unit_price)} × {i.qty}</td>
                      <td className="num"><b>{fmt(i.unit_price * i.qty)}</b></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <dl className="kv" style={{ marginTop: 16, maxWidth: 320, marginLeft: "auto" }}>
              <dt>Subtotal</dt><dd>{fmt(order.subtotal)}</dd>
              {order.discount > 0 && <><dt>Discount {order.coupon_code && `(${order.coupon_code})`}</dt><dd>− {fmt(order.discount)}</dd></>}
              <dt>Delivery</dt><dd>{order.shipping ? fmt(order.shipping) : "Free"}</dd>
              <dt><b>{order.channel === "store" ? "Paid" : "To collect (COD)"}</b></dt><dd><b>{fmt(order.total)}</b></dd>
            </dl>
            <p className="sub" style={{ margin: "12px 0 0" }}>
              Stock: {order.status === "cancelled" ? "released back" : order.stock_deducted ? "taken out of stock" : "reserved until the customer confirms"}.
            </p>
          </div>

          <div className="card">
            <h2>Activity</h2>
            <p className="sub">Who did what. Add a note for your team below.</p>
            <ul className="events">
              {events.map((e) => (
                <li key={e.id} className={`events__${e.type}`}>
                  <span><b>{e.actor}</b> · {e.note}</span>
                  <time>{fmtDate(e.created_at, tz)}</time>
                </li>
              ))}
              {!events.length && <li><span className="dim">No activity recorded (order placed before the activity log existed).</span></li>}
            </ul>
            <form action={orderNoteAction} className="inline" style={{ marginTop: 14 }}>
              <input type="hidden" name="id" value={order.id} />
              <input className="input" name="note" placeholder="Add a note for the team…" required style={{ flex: 1 }} />
              <button className="btn btn--ghost">Add note</button>
            </form>
          </div>

          {messages.length > 0 && (
            <div className="card">
              <h2>Messages to the customer</h2>
              <p className="sub">Sent automatically at each step. WhatsApp messages marked “Waiting for you” go out with one click.</p>
              {messages.map((m) => (
                <div key={m.id} style={{ marginBottom: 14 }}>
                  <div className="inline" style={{ justifyContent: "space-between", marginBottom: 6 }}>
                    <span><b>{m.channel === "email" ? "Email" : "WhatsApp"}</b> <span className="dim">· {m.kind.replace(/_/g, " ")} · {fmtDate(m.created_at, tz)}</span></span>
                    {m.status === "manual" ? <WhatsAppSend id={m.id} phone={m.recipient} body={m.body} /> : <span className={`pill ${MSG_TONE[m.status]}`} title={m.error || ""}>{MSG_LABEL[m.status]}</span>}
                  </div>
                  <div className="msg">{m.body}</div>
                  {m.error && <small className="dim">{m.error}</small>}
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="card">
            <h2>Next step</h2>
            {order.status === "pending" && (
              <>
                <p className="sub">Waiting for the customer to confirm from their link. If they confirmed by phone or chat, confirm it here. Stock is reserved, not yet deducted.</p>
                <Status status="confirmed"><button className="btn">Mark as confirmed</button></Status>
              </>
            )}
            {order.status === "confirmed" && (
              <>
                <p className="sub">Confirmed{order.confirmed_by ? ` by ${order.confirmed_by}` : ""}. Pick and pack the items.</p>
                <Status status="packed"><button className="btn">Mark as packed</button></Status>
              </>
            )}
            {["confirmed", "packed"].includes(order.status) && (
              <div style={order.status === "confirmed" ? { marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--line)" } : undefined}>
                {order.status === "packed" && <p className="sub">Packed. Hand it to the courier.</p>}
                <Status status="shipped">
                  <div className="field" style={{ margin: 0 }}><label>Courier</label><input name="courier" placeholder="TCS, Leopards, M&P…" defaultValue={order.courier} /></div>
                  <div className="field" style={{ margin: 0 }}><label>Tracking number</label><input name="tracking" defaultValue={order.tracking_number} /></div>
                  <button className={`btn ${order.status === "confirmed" ? "btn--ghost" : ""}`}>Mark as dispatched &amp; notify customer</button>
                </Status>
              </div>
            )}
            {order.status === "shipped" && (
              <>
                <p className="sub">With {order.courier || "the courier"} · tracking {order.tracking_number || "-"}.</p>
                <Status status="delivered"><button className="btn">Mark as delivered</button></Status>
              </>
            )}
            {order.status === "delivered" && <p className="sub">Delivered{order.delivered_at && ` on ${fmtDate(order.delivered_at, tz, false)}`}. If it comes back, record the return below.</p>}
            {order.status === "returned" && <p className="sub">Returned. {order.cancel_reason}</p>}
            {order.status === "cancelled" && <p className="sub">Cancelled. {order.cancel_reason} The items were released back to stock.</p>}

            {["shipped", "delivered"].includes(order.status) && (
              <details className="fold">
                <summary>Record a return</summary>
                <Status status="returned">
                  <p className="sub" style={{ margin: 0 }}>For each item, say whether it can be sold again.</p>
                  {order.items.map((i) => (
                    <div className="field" style={{ margin: 0 }} key={i.id}>
                      <label>{i.name} · {i.size} × {i.qty}</label>
                      <select name={`return_${i.id}`} defaultValue="restock">
                        <option value="restock">Good condition: back into stock</option>
                        <option value="damaged">Damaged: write off</option>
                      </select>
                    </div>
                  ))}
                  <div className="field" style={{ margin: 0 }}><label>Reason</label><input name="reason" placeholder="Refused at door, wrong size…" /></div>
                  <ConfirmButton message={`Record ${order.number} as returned?`} className="btn btn--danger">Record return</ConfirmButton>
                </Status>
              </details>
            )}
            {["pending", "confirmed", "packed"].includes(order.status) && (
              <details className="fold">
                <summary>Cancel this order</summary>
                <Status status="cancelled">
                  <div className="field" style={{ margin: 0 }}><label>Reason shown to the customer</label><input name="reason" /></div>
                  <ConfirmButton message={`Cancel ${order.number}? The items go back into stock and the customer is notified.`} className="btn btn--danger">Cancel order</ConfirmButton>
                </Status>
              </details>
            )}
          </div>

          <div className="card">
            <h2>Assigned to</h2>
            <form action={assignOrderAction} className="inline" style={{ marginTop: 8 }}>
              <input type="hidden" name="id" value={order.id} />
              <select className="input" name="staff" defaultValue={order.assigned_to || ""} style={{ flex: 1 }}>
                <option value="">Nobody</option>
                {staff.map((s) => <option key={s.id} value={s.id}>{s.name || s.email}{s.id === viewer.id ? " (you)" : ""}</option>)}
              </select>
              <button className="btn btn--ghost">Assign</button>
            </form>
            <small className="hint">They get an email and see it under “Assigned to me”.</small>
          </div>

          <div className="card">
            <h2>Customer</h2>
            <p><b>{order.customer_name}</b></p>
            <p className="dim">{order.address}<br />{order.city}</p>
            {!walkIn && <p style={{ marginTop: 8 }}>+{order.phone}{order.email && <><br />{order.email}</>}</p>}
            {history.orders > 0 && (
              <p className="sub" style={{ margin: "10px 0 0" }}>
                {history.orders} earlier {history.orders === 1 ? "order" : "orders"}
                {history.failed > 0 && <> · <span className="pill bad">{history.failed} cancelled or returned</span></>}
              </p>
            )}
            {order.notes && <div className="note note--info" style={{ marginTop: 12, marginBottom: 0 }}>Note: {order.notes}</div>}
            <div className="inline" style={{ marginTop: 12 }}>
              {!walkIn && <a className="btn btn--wa btn--sm" href={waLink(order.phone, `Hi ${order.customer_name.split(" ")[0]}, this is ${settings.store.name} about your order ${order.number}.`)} target="_blank" rel="noopener noreferrer">Chat on WhatsApp</a>}
              {order.contact_id && can(viewer, "customers") && <Link href={`/admin/customers/${order.contact_id}`} className="btn btn--ghost btn--sm">Customer history</Link>}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
