import Link from "next/link";
import { requirePerm } from "@/lib/auth";
import { query } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { money, fmtDate, ORDER_STATUS, CHANNELS } from "@/lib/format";

export const metadata = { title: "Orders" };

// two open orders from one phone, with a shared item, placed close together
const DUPLICATE = `EXISTS (
  SELECT 1 FROM orders o2 WHERE o2.phone = o.phone AND o2.id <> o.id AND o.phone <> '0'
    AND o.status IN ('pending', 'confirmed', 'packed') AND o2.status IN ('pending', 'confirmed', 'packed')
    AND abs(extract(epoch FROM o2.created_at - o.created_at)) < $1::int * 3600
    AND EXISTS (SELECT 1 FROM order_items a JOIN order_items b ON a.variant_id = b.variant_id WHERE a.order_id = o.id AND b.order_id = o2.id))`;

export default async function Orders({ searchParams }) {
  const viewer = await requirePerm("orders");
  const { status, q, channel, flag, mine } = await searchParams;
  const settings = await getSettings();
  const o = settings.orders;

  const where = [];
  const params = [o.duplicate_hours];
  const add = (value, sql) => { params.push(value); where.push(sql.replace("?", `$${params.length}`)); };
  if (ORDER_STATUS[status]) add(status, "o.status = ?");
  if (CHANNELS[channel]) add(channel, "o.channel = ?");
  if (mine) add(viewer.id, "o.assigned_to = ?");
  if (q) add(`%${String(q).trim().toLowerCase()}%`, "lower(o.number || ' ' || o.customer_name || ' ' || o.phone || ' ' || o.city) LIKE ?");
  if (flag === "duplicates") where.push(DUPLICATE);
  if (flag === "unassigned") where.push("o.assigned_to IS NULL AND o.status IN ('pending', 'confirmed', 'packed')");
  if (flag === "undispatched") add(o.pack_hours, "o.status IN ('confirmed', 'packed') AND COALESCE(o.packed_at, o.confirmed_at) < now() - make_interval(hours => ?::int)");
  if (flag === "undelivered") add(o.deliver_days, "o.status = 'shipped' AND o.shipped_at < now() - make_interval(days => ?::int)");

  const [orders, counts] = await Promise.all([
    query(
      `SELECT o.id, o.number, o.customer_name, o.phone, o.city, o.total, o.status, o.channel, o.created_at, a.name AS staff, ${DUPLICATE} AS duplicate,
              (SELECT COALESCE(sum(qty), 0)::int FROM order_items i WHERE i.order_id = o.id) AS units
       FROM orders o LEFT JOIN admins a ON a.id = o.assigned_to
       ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY o.id DESC LIMIT 200`,
      params
    ),
    query("SELECT status, count(*)::int AS n FROM orders GROUP BY status"),
  ]);
  const n = (s) => counts.find((c) => c.status === s)?.n || 0;
  const fmt = (v) => money(v, settings.store.currency);
  const link = (patch) => {
    const sp = new URLSearchParams(Object.entries({ status, channel, flag, mine, q, ...patch }).filter(([, v]) => v));
    return `/admin/orders${sp.size ? `?${sp}` : ""}`;
  };
  const FLAGS = { duplicates: "Possible duplicates", undispatched: "Late to dispatch", undelivered: "Late to deliver", unassigned: "Nobody assigned" };

  return (
    <>
      <div className="head">
        <div><h1>Orders</h1><p>Every order from every channel. Ship an order only after it is confirmed.</p></div>
        <div className="head__actions">
          <form className="inline" action="/admin/orders">
            {status && <input type="hidden" name="status" value={status} />}
            <input className="input" name="q" defaultValue={q || ""} placeholder="Search number, name, phone…" style={{ width: 230 }} />
            <button className="btn btn--ghost">Search</button>
          </form>
          <Link href="/admin/orders/new" className="btn">+ New order</Link>
        </div>
      </div>

      <div className="tabs">
        <Link href={link({ status: "", flag: "", mine: "" })} className={!status && !flag && !mine ? "active" : ""}>All</Link>
        {Object.entries(ORDER_STATUS).map(([s, { label }]) => (
          <Link key={s} href={link({ status: s, flag: "" })} className={status === s ? "active" : ""}>{label} ({n(s)})</Link>
        ))}
      </div>

      <div className="filters">
        <Link href={link({ mine: mine ? "" : "1" })} className={mine ? "active" : ""}>Assigned to me</Link>
        {Object.entries(FLAGS).map(([key, label]) => (
          <Link key={key} href={link({ flag: flag === key ? "" : key, status: "" })} className={flag === key ? "active" : ""}>{label}</Link>
        ))}
        <span className="filters__sep" />
        {Object.entries(CHANNELS).map(([key, label]) => (
          <Link key={key} href={link({ channel: channel === key ? "" : key })} className={channel === key ? "active" : ""}>{label}</Link>
        ))}
      </div>

      <div className="card">
        {orders.length ? (
          <div className="tablewrap" style={{ marginTop: -22 }}>
            <table className="table">
              <thead><tr><th>Order</th><th>Placed</th><th>Channel</th><th>Customer</th><th>Items</th><th>Assigned</th><th>Status</th><th className="num">Total</th></tr></thead>
              <tbody>
                {orders.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link href={`/admin/orders/${r.id}`} className="link"><b>{r.number}</b></Link>
                      {r.duplicate && <div><span className="pill bad">Possible duplicate</span></div>}
                    </td>
                    <td className="dim">{fmtDate(r.created_at, settings.store.timezone)}</td>
                    <td><span className={`chan chan--${r.channel}`}>{CHANNELS[r.channel] || r.channel}</span></td>
                    <td>{r.customer_name}<div className="dim">{r.city}{r.phone !== "0" && ` · +${r.phone}`}</div></td>
                    <td>{r.units}</td>
                    <td>{r.staff || <span className="dim">Nobody</span>}</td>
                    <td><span className={`pill ${ORDER_STATUS[r.status].tone}`}>{ORDER_STATUS[r.status].label}</span></td>
                    <td className="num">{fmt(r.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="empty">No orders match. <Link href="/admin/orders" className="link">Clear filters</Link></p>}
      </div>
    </>
  );
}
