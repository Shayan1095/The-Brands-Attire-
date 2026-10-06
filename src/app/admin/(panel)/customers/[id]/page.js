import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePerm } from "@/lib/auth";
import { query } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { saveCustomerNoteAction } from "@/lib/admin-actions";
import { money, fmtDate, ORDER_STATUS, CHANNELS, waLink, can } from "@/lib/format";

export const metadata = { title: "Customer" };

export default async function Customer({ params, searchParams }) {
  const viewer = await requirePerm("customers");
  const { id } = await params;
  const { saved } = await searchParams;
  const [[c], settings] = await Promise.all([query("SELECT * FROM contacts WHERE id = $1", [Number(id) || 0]), getSettings()]);
  if (!c) notFound();

  // every order by this person, matched on the contact or on the phone number (covers orders from any channel)
  const orders = await query(
    `SELECT o.id, o.number, o.status, o.channel, o.total, o.created_at, o.city,
            (SELECT string_agg(i.name || ' (' || i.size || ') × ' || i.qty, ', ') FROM order_items i WHERE i.order_id = o.id) AS items
     FROM orders o WHERE o.contact_id = $1 OR ($2::text IS NOT NULL AND o.phone = $2) ORDER BY o.id DESC`,
    [c.id, c.phone]
  );
  const fmt = (n) => money(n, settings.store.currency);
  const tz = settings.store.timezone;
  const good = orders.filter((o) => !["cancelled", "returned"].includes(o.status));
  const failed = orders.length - good.length;
  const spent = good.filter((o) => o.status === "delivered").reduce((s, o) => s + o.total, 0);
  const channels = [...new Set(orders.map((o) => o.channel))];
  const canOrders = can(viewer, "orders");

  return (
    <>
      <div className="head">
        <div>
          <h1>{c.name || "Customer"} {c.is_flagged && <span className="pill bad" style={{ verticalAlign: "middle" }}>Flagged</span>}</h1>
          <p><Link href="/admin/customers" className="link">← All customers</Link> · Customer since {fmtDate(c.created_at, tz, false)}</p>
        </div>
        <div className="head__actions">
          {c.phone && <a className="btn btn--wa" href={waLink(c.phone)} target="_blank" rel="noopener noreferrer">WhatsApp</a>}
          {c.email && <a className="btn btn--ghost" href={`mailto:${c.email}`}>Email</a>}
        </div>
      </div>
      {saved && <div className="note note--ok">Saved.</div>}

      <div className="kpis">
        <div className="kpi"><span className="kpi__label">Orders</span><div className="kpi__value">{orders.length}</div><div className="kpi__foot">{channels.map((ch) => CHANNELS[ch] || ch).join(", ") || "None yet"}</div></div>
        <div className="kpi"><span className="kpi__label">Delivered value</span><div className="kpi__value">{fmt(spent)}</div><div className="kpi__foot">Paid orders only</div></div>
        <div className="kpi"><span className="kpi__label">Cancelled or returned</span><div className="kpi__value">{failed}</div><div className="kpi__foot">{orders.length ? `${Math.round((failed / orders.length) * 100)}% of their orders` : "No orders"}</div></div>
        <div className="kpi"><span className="kpi__label">Last order</span><div className="kpi__value" style={{ fontSize: "1.2rem" }}>{orders[0] ? fmtDate(orders[0].created_at, tz, false) : "Never"}</div><div className="kpi__foot">{orders[0] ? ORDER_STATUS[orders[0].status].label : ""}</div></div>
      </div>

      <div className="cols">
        <div className="card">
          <h2>Order history</h2>
          {orders.length ? (
            <div className="tablewrap" style={{ marginTop: 8 }}>
              <table className="table">
                <thead><tr><th>Order</th><th>Placed</th><th>Channel</th><th>Items</th><th>Status</th><th className="num">Total</th></tr></thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.id}>
                      <td>{canOrders ? <Link href={`/admin/orders/${o.id}`} className="link"><b>{o.number}</b></Link> : <b>{o.number}</b>}</td>
                      <td className="dim">{fmtDate(o.created_at, tz)}</td>
                      <td><span className={`chan chan--${o.channel}`}>{CHANNELS[o.channel] || o.channel}</span></td>
                      <td className="dim" style={{ maxWidth: 280 }}>{o.items}</td>
                      <td><span className={`pill ${ORDER_STATUS[o.status].tone}`}>{ORDER_STATUS[o.status].label}</span></td>
                      <td className="num">{fmt(o.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="empty">No orders yet. This person subscribed to updates.</p>}
        </div>

        <div>
          <div className="card">
            <h2>Details</h2>
            <dl className="kv" style={{ marginTop: 10 }}>
              <dt>Phone</dt><dd>{c.phone ? `+${c.phone}` : "-"}</dd>
              <dt>Email</dt><dd style={{ overflowWrap: "anywhere" }}>{c.email || "-"}</dd>
              <dt>City</dt><dd>{c.city || "-"}</dd>
              <dt>Offers by email</dt><dd>{c.email_opt_in ? "Yes" : "No"}</dd>
              <dt>Offers by WhatsApp</dt><dd>{c.whatsapp_opt_in ? "Yes" : "No"}</dd>
              <dt>First seen via</dt><dd>{CHANNELS[c.source] || c.source || "-"}</dd>
            </dl>
          </div>
          <form className="card" action={saveCustomerNoteAction}>
            <input type="hidden" name="id" value={c.id} />
            <h2>Notes for the team</h2>
            <div className="field" style={{ marginTop: 10 }}>
              <textarea name="notes" defaultValue={c.notes} placeholder="Prefers calls after 6pm, always exchanges for a size up…" />
            </div>
            <label className="check"><input type="checkbox" name="is_flagged" defaultChecked={c.is_flagged} /> <span>Flag this customer<small className="hint">Staff see a warning when taking a new order from this number, for example after refused parcels.</small></span></label>
            <button className="btn btn--sm">Save</button>
          </form>
        </div>
      </div>
    </>
  );
}
