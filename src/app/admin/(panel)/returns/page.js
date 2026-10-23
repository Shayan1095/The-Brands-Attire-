import Link from "next/link";
import { requirePerm } from "@/lib/auth";
import { query } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { fmtDate, CASE_TYPES, CASE_REASONS, CASE_STATUS } from "@/lib/format";

export const metadata = { title: "Returns" };

// what staff need to do next, in the order it happens
const VIEWS = [
  ["review", "To review", ["requested"]],
  ["pickup", "Arrange pickup", ["approved"]],
  ["waiting", "Pickup booked", ["in_transit"]],
  ["settle", "To settle", ["received"]],
  ["done", "Closed", ["resolved", "rejected"]],
  ["all", "All", null],
];

export default async function Returns({ searchParams }) {
  await requirePerm("returns");
  const { view = "review", type, q } = await searchParams;
  const current = VIEWS.find(([k]) => k === view) || VIEWS[0];
  const settings = await getSettings();

  const where = [];
  const params = [];
  const add = (value, sql) => { params.push(value); where.push(sql.replace("?", `$${params.length}`)); };
  if (current[2]) add(current[2], "c.status = ANY(?::text[])");
  if (CASE_TYPES[type]) add(type, "c.type = ?");
  if (q) add(`%${String(q).trim().toLowerCase()}%`, "lower(c.number || ' ' || o.number || ' ' || o.customer_name || ' ' || o.phone) LIKE ?");

  const [rows, counts] = await Promise.all([
    query(
      `SELECT c.id, c.number, c.type, c.reason, c.status, c.eligible, c.source, c.created_at, o.number AS order_number, o.customer_name, o.city,
              (SELECT COALESCE(sum(qty), 0)::int FROM case_items ci WHERE ci.case_id = c.id) AS units
       FROM cases c JOIN orders o ON o.id = c.order_id
       ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY c.id DESC LIMIT 200`,
      params
    ),
    query("SELECT status, count(*)::int AS n FROM cases GROUP BY status"),
  ]);
  const n = (statuses) => (statuses ? counts.filter((c) => statuses.includes(c.status)) : counts).reduce((s, c) => s + c.n, 0);
  const link = (patch) => {
    const sp = new URLSearchParams(Object.entries({ view, type, q, ...patch }).filter(([, v]) => v));
    return `/admin/returns${sp.size ? `?${sp}` : ""}`;
  };
  const r = settings.returns;

  return (
    <>
      <div className="head">
        <div>
          <h1>Returns</h1>
          <p>Exchanges, returns and problem reports. Customers start them from their order page; you can also start one from any order.</p>
        </div>
        <div className="head__actions">
          <form className="inline" action="/admin/returns">
            <input type="hidden" name="view" value={view} />
            <input className="input" name="q" defaultValue={q || ""} placeholder="RMA, order, name or phone…" style={{ width: 230 }} />
            <button className="btn btn--ghost">Search</button>
          </form>
        </div>
      </div>

      <div className="note note--info rules">
        <span>
          <b>Your rules:</b> within {r.window_days} days of delivery · exchanges {r.exchanges ? "allowed" : "only for faults"} · refunds {r.refunds ? "allowed" : "only for faults"} ·
          sale items {r.sale_items ? "can come back" : "are final unless faulty"}. Faulty or wrong items are always accepted inside the window.{" "}
          <Link href="/admin/settings#returns" className="link">Change</Link>
        </span>
      </div>

      <div className="tabs">
        {VIEWS.map(([key, label, statuses]) => (
          <Link key={key} href={link({ view: key })} className={current[0] === key ? "active" : ""}>{label} ({n(statuses)})</Link>
        ))}
      </div>
      <div className="filters">
        <Link href={link({ type: "" })} className={!type ? "active" : ""}>Every kind</Link>
        {Object.entries(CASE_TYPES).map(([key, label]) => <Link key={key} href={link({ type: type === key ? "" : key })} className={type === key ? "active" : ""}>{label}</Link>)}
      </div>

      <div className="card">
        {rows.length ? (
          <div className="tablewrap" style={{ marginTop: -22 }}>
            <table className="table table--rows table--stack table--orders">
              <thead><tr><th>Request</th><th>Order</th><th>Customer</th><th>Kind</th><th>Reason</th><th>Status</th><th className="num">Opened</th></tr></thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id}>
                    <td className="c-num">
                      <Link href={`/admin/returns/${c.id}`} className="link rowlink"><b>{c.number}</b></Link>
                      {!c.eligible && <div><span className="pill warn">Outside the rules</span></div>}
                    </td>
                    <td className="ph-hide">{c.order_number}</td>
                    <td className="c-cust">{c.customer_name}<div className="dim">{c.city} · {c.units ? `${c.units} ${c.units === 1 ? "piece" : "pieces"}` : "whole order"}</div></td>
                    <td className="c-chan end"><span className={`case-kind case-kind--${c.type}`}>{CASE_TYPES[c.type]}</span></td>
                    <td className="ph-hide dim">{CASE_REASONS[c.reason]?.[0]}</td>
                    <td className="c-status end"><span className={`pill ${CASE_STATUS[c.status].tone}`}>{CASE_STATUS[c.status].label}</span></td>
                    <td className="num dim c-date">{fmtDate(c.created_at, settings.store.timezone)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty">
            {current[0] === "review" ? "Nothing to review. New requests from customers appear here." : "Nothing here."}{" "}
            {current[0] !== "all" && <Link href={link({ view: "all" })} className="link">See all requests</Link>}
          </p>
        )}
      </div>
    </>
  );
}
