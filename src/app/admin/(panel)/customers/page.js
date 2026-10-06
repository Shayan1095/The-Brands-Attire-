import { requirePerm } from "@/lib/auth";
import { query } from "@/lib/db";
import Link from "next/link";
import { getSettings } from "@/lib/settings";
import { money, fmtDate, waLink } from "@/lib/format";

export const metadata = { title: "Customers" };

export default async function Customers() {
  const viewer = await requirePerm("customers");
  const [contacts, settings] = await Promise.all([
    query(
      `SELECT c.*, COALESCE(o.n, 0)::int AS orders, COALESCE(o.spent, 0)::int AS spent
       FROM contacts c LEFT JOIN (
         SELECT contact_id, count(*) AS n, sum(total) FILTER (WHERE status <> 'cancelled') AS spent FROM orders GROUP BY contact_id
       ) o ON o.contact_id = c.id
       ORDER BY spent DESC, c.id DESC LIMIT 500`
    ),
    getSettings(),
  ]);
  const subs = contacts.filter((c) => c.email_opt_in || c.whatsapp_opt_in).length;

  return (
    <>
      <div className="head">
        <div><h1>Customers</h1><p>{contacts.length} contacts · {subs} subscribed to offers. Built automatically from orders and newsletter sign-ups.</p></div>
        <div className="head__actions"><a href="/admin/customers/export" className="btn btn--ghost">Download CSV</a></div>
      </div>
      <div className="card">
        {contacts.length ? (
          <div className="tablewrap" style={{ marginTop: -20 }}>
            <table className="table">
              <thead><tr><th>Name</th><th>Contact</th><th>City</th><th>Subscribed</th><th>Joined</th><th className="num">Orders</th><th className="num">Spent</th></tr></thead>
              <tbody>
                {contacts.map((c) => (
                  <tr key={c.id}>
                    <td><Link href={`/admin/customers/${c.id}`} className="link"><b>{c.name || "Unnamed"}</b></Link>{c.is_flagged && <> <span className="pill bad">Flagged</span></>}<div className="dim">{c.source}</div></td>
                    <td>
                      {c.email && <div>{c.email}</div>}
                      {c.phone && <a className="link" href={waLink(c.phone)} target="_blank" rel="noopener noreferrer">+{c.phone}</a>}
                    </td>
                    <td>{c.city || "-"}</td>
                    <td>
                      {c.email_opt_in && <span className="pill info">Email</span>} {c.whatsapp_opt_in && <span className="pill ok">WhatsApp</span>}
                      {!c.email_opt_in && !c.whatsapp_opt_in && <span className="dim">No</span>}
                    </td>
                    <td className="dim">{fmtDate(c.created_at, settings.store.timezone, false)}</td>
                    <td className="num">{c.orders}</td>
                    <td className="num">{money(c.spent, settings.store.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="empty">No customers yet. They are added automatically when someone orders or subscribes.</p>}
      </div>
    </>
  );
}
