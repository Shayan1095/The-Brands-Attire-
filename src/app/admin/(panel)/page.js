import Link from "next/link";
import { after } from "next/server";
import { query } from "@/lib/db";
import { getAdmin } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { runAutomations } from "@/lib/orders";
import { channelStatus } from "@/lib/notify";
import { money, fmtDate, ORDER_STATUS, PERMISSIONS, can } from "@/lib/format";
import SalesChart from "@/components/admin/SalesChart";
import AdminIcon from "@/components/admin/icons";

export const metadata = { title: "Dashboard" };

const sum = (rows, key) => rows.reduce((s, r) => s + r[key], 0);

/** "+12% vs previous 7 days" with an arrow; the arrow carries the direction, the text stays neutral. */
function Delta({ now, before, label }) {
  if (!before && !now) return <span className="delta delta--flat">No sales yet</span>;
  if (!before) return <span className="delta delta--up"><AdminIcon name="up" />New <span className="dim">· {label}</span></span>;
  const pct = Math.round(((now - before) / before) * 100);
  const dir = pct > 0 ? "up" : pct < 0 ? "down" : "flat";
  return (
    <span className={`delta delta--${dir}`}>
      <AdminIcon name="up" />{pct > 0 ? "+" : ""}{pct}% <span className="dim" style={{ fontWeight: 400 }}>{label}</span>
    </span>
  );
}

/** Tiny trend line beside a figure. Decorative: the figure and delta say the same thing in words. */
function Spark({ values }) {
  const max = Math.max(1, ...values);
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 84},${30 - (v / max) * 26}`).join(" ");
  return <svg className="kpi__spark" viewBox="0 0 84 32" fill="none" aria-hidden><polyline points={pts} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export default async function Dashboard({ searchParams }) {
  const { denied } = await searchParams;
  // reminders, auto-cancel and queued messages also run whenever the owner opens the panel
  after(() => runAutomations().catch((e) => console.error("[automations]", e)));

  const [settings, admin] = await Promise.all([getSettings(), getAdmin()]);
  const tz = settings.store.timezone;
  const cur = settings.store.currency;
  const fmt = (n) => money(n, cur);
  const showMoney = can(admin, "reports");

  const [days, [c], byStatus, top, recent, low, [{ hour }]] = await Promise.all([
    // 60 days: the last 30 for the chart, the 30 before them for comparisons
    query(
      `SELECT to_char(d, 'DD Mon') AS label, COALESCE(sum(o.total), 0)::int AS total, count(o.id)::int AS orders
       FROM generate_series((now() AT TIME ZONE $1)::date - 59, (now() AT TIME ZONE $1)::date, interval '1 day') d
       LEFT JOIN orders o ON (o.created_at AT TIME ZONE $1)::date = d::date AND o.status <> 'cancelled'
       GROUP BY d ORDER BY d`,
      [tz]
    ),
    query(`SELECT
        (SELECT count(*)::int FROM orders WHERE status = 'pending') AS pending,
        (SELECT count(*)::int FROM orders WHERE status = 'confirmed') AS to_ship,
        (SELECT count(*)::int FROM messages WHERE status = 'manual') AS whatsapp,
        (SELECT count(*)::int FROM contact_messages WHERE NOT is_read) AS inbox,
        (SELECT count(*)::int FROM variants v JOIN products p ON p.id = v.product_id WHERE p.status = 'active' AND v.stock - v.reserved <= p.low_stock_threshold) AS low,
        (SELECT count(*)::int FROM contacts WHERE email_opt_in OR whatsapp_opt_in) AS subscribers,
        (SELECT count(*)::int FROM orders WHERE status = 'cancelled' AND created_at > now() - interval '30 days') AS cancelled`),
    query("SELECT status, count(*)::int AS n FROM orders WHERE created_at > now() - interval '30 days' GROUP BY status"),
    query(
      `SELECT i.product_id AS id, i.name, sum(i.qty)::int AS units, sum(i.qty * i.unit_price)::int AS revenue
       FROM order_items i JOIN orders o ON o.id = i.order_id
       WHERE o.status <> 'cancelled' AND o.created_at > now() - interval '30 days'
       GROUP BY i.product_id, i.name ORDER BY units DESC, revenue DESC LIMIT 5`
    ),
    query("SELECT id, number, customer_name, city, total, status, created_at FROM orders ORDER BY id DESC LIMIT 6"),
    query(
      `SELECT v.id, v.size || CASE WHEN v.color <> '' THEN ' · ' || v.color ELSE '' END AS size, GREATEST(v.stock - v.reserved, 0) AS stock, p.id AS product_id, p.name
       FROM variants v JOIN products p ON p.id = v.product_id
       WHERE p.status = 'active' AND v.stock - v.reserved <= p.low_stock_threshold ORDER BY v.stock, p.name LIMIT 7`
    ),
    query("SELECT extract(hour FROM now() AT TIME ZONE $1)::int AS hour", [tz]),
  ]);

  const last30 = days.slice(30), prev30 = days.slice(0, 30);
  const last7 = days.slice(-7), prev7 = days.slice(-14, -7);
  const today = days.at(-1), yesterday = days.at(-2);
  const orders30 = sum(last30, "orders");
  const aov = orders30 ? Math.round(sum(last30, "total") / orders30) : 0;
  const prevOrders30 = sum(prev30, "orders");
  const prevAov = prevOrders30 ? Math.round(sum(prev30, "total") / prevOrders30) : 0;
  const cancelRate = orders30 + c.cancelled ? Math.round((c.cancelled / (orders30 + c.cancelled)) * 100) : 0;

  const channels = channelStatus();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const statusTotal = Math.max(1, sum(byStatus, "n"));
  const topUnits = Math.max(1, ...top.map((t) => t.units));

  // what needs doing, most urgent first
  const todo = [
    { n: c.to_ship, label: "Confirmed, ready to ship", href: "/admin/orders?status=confirmed", icon: "truck", hot: c.to_ship > 0, perm: "orders" },
    { n: c.pending, label: "Waiting for customer to confirm", href: "/admin/orders?status=pending", icon: "clock", perm: "orders" },
    { n: c.whatsapp, label: "WhatsApp messages to send", href: "/admin/messages", icon: "message", hot: c.whatsapp > 0, perm: "marketing" },
    { n: c.inbox, label: "Unread customer messages", href: "/admin/messages?tab=inbox", icon: "inbox", hot: c.inbox > 0, perm: "marketing" },
    { n: c.low, label: "Sizes low or sold out", href: "/admin/inventory", icon: "alert", perm: "inventory" },
  ].filter((t) => can(admin, t.perm));

  return (
    <>
      <div className="hello">
        <div>
          <h1>{greeting}, <em>{(admin?.name || "Owner").split(" ")[0]}</em>.</h1>
          <p>{fmtDate(new Date(), tz, false)} · here is what needs you today.</p>
        </div>
        <div className="head__actions">
          {can(admin, "orders") && <Link href="/admin/orders/new" className="btn btn--ghost">New order</Link>}
          {can(admin, "offers") && <Link href="/admin/offers" className="btn btn--ghost">Start a sale</Link>}
          {can(admin, "marketing") && <Link href="/admin/campaigns" className="btn btn--ghost">Send a campaign</Link>}
        </div>
      </div>

      {denied && <div className="note note--warn"><span>Your account is not allowed to open that page ({(PERMISSIONS[denied] || denied).split(":")[0]}). Ask the owner if you need it.</span></div>}

      {can(admin, "marketing") && (!channels.email || !channels.whatsapp) && (
        <div className="note note--warn">
          <span>
            {!channels.email && <>Email sending is not connected yet, so automatic emails are being skipped. </>}
            {!channels.whatsapp && <>WhatsApp API is not connected: WhatsApp messages wait in <Link href="/admin/messages" className="link">Messages</Link> for one-click sending. </>}
            See <Link href="/admin/automations" className="link">Automations</Link> for setup steps.
          </span>
        </div>
      )}

      <div className="todo">
        {todo.map((t) => (
          <Link key={t.label} href={t.href} className={`todo__item ${t.hot ? "todo__item--hot" : ""} ${t.n ? "" : "todo__item--clear"}`}>
            <span className="todo__icon"><AdminIcon name={t.icon} /></span>
            <div><b>{t.n}</b><span>{t.label}</span></div>
            <AdminIcon name="arrow" />
          </Link>
        ))}
      </div>

      {showMoney && <div className="kpis">
        <div className="kpi">
          <span className="kpi__label">Sales today</span>
          <div className="kpi__value">{fmt(today.total)}</div>
          <div className="kpi__foot"><Delta now={today.total} before={yesterday.total} label="vs yesterday" /></div>
        </div>
        <div className="kpi">
          <span className="kpi__label">Sales, last 7 days</span>
          <Spark values={last7.map((d) => d.total)} />
          <div className="kpi__value">{fmt(sum(last7, "total"))}</div>
          <div className="kpi__foot"><Delta now={sum(last7, "total")} before={sum(prev7, "total")} label="vs previous 7 days" /></div>
        </div>
        <div className="kpi">
          <span className="kpi__label">Orders, last 30 days</span>
          <Spark values={last30.map((d) => d.orders)} />
          <div className="kpi__value">{orders30}</div>
          <div className="kpi__foot"><Delta now={orders30} before={prevOrders30} label="vs previous 30 days" /></div>
        </div>
        <div className="kpi">
          <span className="kpi__label">Average order value</span>
          <div className="kpi__value">{fmt(aov)}</div>
          <div className="kpi__foot"><Delta now={aov} before={prevAov} label="vs previous 30 days" /></div>
        </div>
        <Link href="/admin/customers" className="kpi">
          <span className="kpi__label">Subscribers</span>
          <div className="kpi__value">{c.subscribers}</div>
          <div className="kpi__foot">Can receive your campaigns</div>
        </Link>
      </div>}

      <div className="cols">
        <div>
          {showMoney && (
            <div className="card">
              <h2>Daily sales</h2>
              <SalesChart days={last30} currency={cur} />
            </div>
          )}

          <div className="card">
            <div className="card__head">
              <h2>Latest orders</h2>
              <Link href="/admin/orders" className="link">All orders</Link>
            </div>
            {recent.length ? (
              <div className="tablewrap" style={{ marginTop: 8 }}>
                <table className="table">
                  <thead><tr><th>Order</th><th>Customer</th><th>Status</th><th className="num">Total</th></tr></thead>
                  <tbody>
                    {recent.map((o) => (
                      <tr key={o.id}>
                        <td><Link href={`/admin/orders/${o.id}`} className="link"><b>{o.number}</b></Link><div className="dim">{fmtDate(o.created_at, tz)}</div></td>
                        <td>{o.customer_name}<div className="dim">{o.city}</div></td>
                        <td><span className={`pill ${ORDER_STATUS[o.status].tone}`}>{ORDER_STATUS[o.status].label}</span></td>
                        <td className="num">{fmt(o.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="empty">No orders yet. They will show up here the moment a customer checks out.</p>}
          </div>
        </div>

        <div>
          <div className="card">
            <h2>Orders by status</h2>
            <p className="sub">Last 30 days · {cancelRate}% cancelled</p>
            {byStatus.length ? (
              <div className="hbars">
                {Object.entries(ORDER_STATUS).map(([key, { label, tone }]) => {
                  const n = byStatus.find((s) => s.status === key)?.n || 0;
                  return (
                    <div className="hbar" key={key}>
                      <span className="hbar__label"><span className={`pill ${tone}`}>{label}</span></span>
                      <span className="hbar__value">{n}</span>
                      <span className="hbar__track"><i style={{ width: `${(n / statusTotal) * 100}%` }} /></span>
                    </div>
                  );
                })}
              </div>
            ) : <p className="dim">No orders in the last 30 days.</p>}
          </div>

          <div className="card">
            <h2>Best sellers</h2>
            <p className="sub">Units sold, last 30 days</p>
            {top.length ? (
              <div className="hbars">
                {top.map((t) => (
                  <div className="hbar" key={`${t.id}-${t.name}`}>
                    <span className="hbar__label">{t.id ? <Link href={`/admin/products/${t.id}`} className="link">{t.name}</Link> : <span>{t.name}</span>}</span>
                    <span className="hbar__value">{t.units} {showMoney && <span className="dim" style={{ fontWeight: 400 }}>· {fmt(t.revenue)}</span>}</span>
                    <span className="hbar__track"><i style={{ width: `${(t.units / topUnits) * 100}%` }} /></span>
                  </div>
                ))}
              </div>
            ) : <p className="dim">Sell something and your best sellers appear here.</p>}
          </div>

          <div className="card">
            <div className="card__head">
              <h2>Low stock</h2>
              <Link href="/admin/inventory?low=1" className="link">Inventory</Link>
            </div>
            {low.length ? (
              <ul className="timeline" style={{ marginTop: 10 }}>
                {low.map((v) => (
                  <li key={v.id}>
                    <span>{v.name} · {v.size}</span>
                    <span className={`pill ${v.stock ? "warn" : "bad"}`}>{v.stock ? `${v.stock} left` : "Sold out"}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="dim">Everything is well stocked.</p>}
          </div>
        </div>
      </div>
    </>
  );
}
