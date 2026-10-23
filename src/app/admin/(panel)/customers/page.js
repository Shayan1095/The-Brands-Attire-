import Link from "next/link";
import { requirePerm } from "@/lib/auth";
import { query } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { listCustomers } from "@/lib/crm";
import { money, fmtDate, SEGMENTS } from "@/lib/format";

export const metadata = { title: "Customers" };

const ORDER = ["vip", "repeat", "new", "risk", "lost", "lead"];

export default async function Customers({ searchParams }) {
  await requirePerm("customers");
  const { segment, q } = await searchParams;
  const [all, settings, [fb], recent] = await Promise.all([
    listCustomers(),
    getSettings(),
    query("SELECT count(*)::int AS n, COALESCE(round(avg(rating), 1), 0)::float AS avg, count(*) FILTER (WHERE rating <= 2)::int AS low FROM feedback"),
    query(
      `SELECT f.rating, f.comment, f.created_at, o.number, o.id AS order_id, o.customer_name, f.contact_id
       FROM feedback f JOIN orders o ON o.id = f.order_id ORDER BY f.id DESC LIMIT 5`
    ),
  ]);
  const fmt = (n) => money(n, settings.store.currency);
  const tz = settings.store.timezone;
  const crm = settings.crm;

  const needle = String(q || "").trim().toLowerCase();
  const list = all.filter((c) =>
    (!SEGMENTS[segment] || c.segment === segment || (segment === "vip" && c.isVip)) &&
    (!needle || `${c.name} ${c.email || ""} ${c.phone || ""} ${c.city || ""}`.toLowerCase().includes(needle)));
  const count = (key) => all.filter((c) => c.segment === key || (key === "vip" && c.isVip)).length;
  const subs = all.filter((c) => c.email_opt_in || c.whatsapp_opt_in).length;
  const points = all.reduce((s, c) => s + (c.points || 0), 0);
  const link = (patch) => {
    const sp = new URLSearchParams(Object.entries({ segment, q, ...patch }).filter(([, v]) => v));
    return `/admin/customers${sp.size ? `?${sp}` : ""}`;
  };

  return (
    <>
      <div className="head">
        <div>
          <h1>Customers</h1>
          <p>Everyone who ordered or subscribed, grouped by how they buy. Groups, value and points update by themselves from their orders.</p>
        </div>
        <div className="head__actions">
          <form className="inline" action="/admin/customers">
            {segment && <input type="hidden" name="segment" value={segment} />}
            <input className="input" name="q" defaultValue={q || ""} placeholder="Name, phone, email or city…" style={{ width: 230 }} />
            <button className="btn btn--ghost">Search</button>
          </form>
          <a href="/admin/customers/export" className="btn btn--ghost">Download CSV</a>
        </div>
      </div>

      <div className="kpis">
        <div className="kpi"><span className="kpi__label">Customers</span><div className="kpi__value">{all.length}</div><div className="kpi__foot">{subs} subscribed to offers</div></div>
        <Link href={link({ segment: "vip" })} className="kpi"><span className="kpi__label">VIP customers</span><div className="kpi__value">{count("vip")}</div><div className="kpi__foot">{fmt(crm.vip_spend)}+ spent or {crm.vip_orders}+ orders</div></Link>
        <Link href={link({ segment: "risk" })} className="kpi"><span className="kpi__label">At risk</span><div className="kpi__value">{count("risk")}</div><div className="kpi__foot">No order for {crm.winback_days}+ days</div></Link>
        <div className="kpi"><span className="kpi__label">Points held</span><div className="kpi__value">{points.toLocaleString("en-US")}</div><div className="kpi__foot">{crm.points_per_100 > 0 ? `${crm.points_per_100} per ${fmt(100)} delivered` : "Points are switched off"}</div></div>
        <div className="kpi"><span className="kpi__label">Average rating</span><div className="kpi__value">{fb.n ? `${fb.avg} / 5` : "None yet"}</div><div className="kpi__foot">{fb.n} ratings{fb.low ? ` · ${fb.low} low` : ""}</div></div>
      </div>

      <div className="tabs">
        <Link href={link({ segment: "" })} className={!SEGMENTS[segment] ? "active" : ""}>Everyone ({all.length})</Link>
        {ORDER.map((key) => <Link key={key} href={link({ segment: key })} className={segment === key ? "active" : ""} title={SEGMENTS[key].hint}>{SEGMENTS[key].label} ({count(key)})</Link>)}
      </div>

      <div className="cols">
        <div className="card">
          {list.length ? (
            <div className="tablewrap" style={{ marginTop: -22 }}>
              <table className="table table--rows table--stack table--orders">
                <thead><tr><th>Customer</th><th>Group</th><th className="num">Orders</th><th className="num">Spent</th><th className="num">Points</th><th>Last order</th></tr></thead>
                <tbody>
                  {list.slice(0, 300).map((c) => (
                    <tr key={c.id}>
                      <td className="c-num">
                        <Link href={`/admin/customers/${c.id}`} className="link rowlink"><b>{c.name || "Unnamed"}</b></Link>
                        {c.is_flagged && <> <span className="pill bad">Flagged</span></>}
                        <div className="dim">{c.city || (c.phone ? `+${c.phone}` : c.email) || "-"}{(c.email_opt_in || c.whatsapp_opt_in) && " · subscribed"}</div>
                      </td>
                      <td className="c-status end"><span className={`pill ${SEGMENTS[c.segment].tone}`}>{SEGMENTS[c.segment].label}</span>{c.isVip && c.segment !== "vip" && <> <span className="pill ok">VIP</span></>}</td>
                      <td className="num ph-hide">{c.good}</td>
                      <td className="num c-total end">{fmt(c.spent)}</td>
                      <td className="num c-chan end">{c.points ? <b>{c.points.toLocaleString("en-US")}</b> : <span className="dim">0</span>}<span className="ph-only dim"> pts</span></td>
                      <td className="dim c-date">{c.last_at ? `${fmtDate(c.last_at, tz, false)} · ${c.idle}d ago` : "Never ordered"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="empty">No customers here. <Link href="/admin/customers" className="link">Show everyone</Link></p>}
          {list.length > 300 && <p className="sub" style={{ margin: "14px 0 0" }}>Showing the 300 most valuable. Search to find anyone else.</p>}
        </div>

        <div>
          <div className="card">
            <h2>Latest feedback</h2>
            <p className="sub">Customers rate their order a few days after delivery. A low rating with a note opens a complaint in Returns.</p>
            {recent.length ? (
              <ul className="fblist">
                {recent.map((f, i) => (
                  <li key={i}>
                    <span className={`fblist__stars ${f.rating <= 2 ? "low" : ""}`} aria-label={`${f.rating} of 5`}>{"★".repeat(f.rating)}<i>{"★".repeat(5 - f.rating)}</i></span>
                    <span>
                      <b>{f.contact_id ? <Link href={`/admin/customers/${f.contact_id}`} className="link">{f.customer_name}</Link> : f.customer_name}</b> · {f.number}
                      {f.comment && <q>{f.comment}</q>}
                      <small>{fmtDate(f.created_at, tz)}</small>
                    </span>
                  </li>
                ))}
              </ul>
            ) : <p className="dim">No ratings yet. They arrive {crm.feedback_days > 0 ? `${crm.feedback_days} days after delivery` : "once feedback requests are switched on in Settings"}.</p>}
          </div>
          <div className="card">
            <h2>What the groups mean</h2>
            <ul className="seglist">
              {ORDER.map((key) => <li key={key}><span className={`pill ${SEGMENTS[key].tone}`}>{SEGMENTS[key].label}</span><span>{SEGMENTS[key].hint}</span></li>)}
            </ul>
            <p className="sub" style={{ margin: "12px 0 0" }}>Send a group a campaign from <Link href="/admin/campaigns" className="link">Campaigns</Link>; change the thresholds in <Link href="/admin/settings#loyalty" className="link">Settings</Link>.</p>
          </div>
        </div>
      </div>
    </>
  );
}
