import { requirePerm } from "@/lib/auth";
import Link from "next/link";
import { query } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { retryMessagesAction, markInboxReadAction } from "@/lib/admin-actions";
import { fmtDate, waLink } from "@/lib/format";
import { SendQueueButton, WhatsAppSend } from "@/components/admin/Widgets";

export const metadata = { title: "Messages" };

const TONE = { sent: "ok", queued: "info", sending: "info", manual: "warn", failed: "bad", skipped: "" };
const LABEL = { sent: "Sent", queued: "Queued", sending: "Sending", manual: "Waiting for you", failed: "Failed", skipped: "Not sent" };

export default async function Messages({ searchParams }) {
  const viewer = await requirePerm("marketing");
  const { tab = "whatsapp" } = await searchParams;
  const [[counts], settings] = await Promise.all([
    query(`SELECT
      count(*) FILTER (WHERE status = 'manual')::int AS manual,
      count(*) FILTER (WHERE status = 'queued')::int AS queued,
      count(*) FILTER (WHERE status IN ('failed', 'skipped') AND created_at > now() - interval '7 days')::int AS failed,
      (SELECT count(*)::int FROM contact_messages WHERE NOT is_read) AS inbox
      FROM messages`),
    getSettings(),
  ]);
  const tz = settings.store.timezone;

  const rows =
    tab === "inbox" ? await query("SELECT * FROM contact_messages ORDER BY is_read, id DESC LIMIT 100")
    : tab === "log" ? await query("SELECT m.*, o.number FROM messages m LEFT JOIN orders o ON o.id = m.order_id ORDER BY m.id DESC LIMIT 150")
    : await query("SELECT m.*, o.number FROM messages m LEFT JOIN orders o ON o.id = m.order_id WHERE m.status = 'manual' ORDER BY (m.order_id IS NULL), m.id LIMIT 200");

  return (
    <>
      <div className="head">
        <div><h1>Messages</h1><p>Everything the store sends, and everything customers write to you.</p></div>
        <div className="head__actions">
          <SendQueueButton queued={counts.queued} />
          {counts.failed > 0 && <form action={retryMessagesAction}><button className="btn btn--ghost">Retry {counts.failed} unsent</button></form>}
        </div>
      </div>
      <div className="tabs">
        <Link href="/admin/messages" className={tab === "whatsapp" ? "active" : ""}>WhatsApp to send ({counts.manual})</Link>
        <Link href="/admin/messages?tab=inbox" className={tab === "inbox" ? "active" : ""}>Inbox ({counts.inbox})</Link>
        <Link href="/admin/messages?tab=log" className={tab === "log" ? "active" : ""}>Full log</Link>
      </div>

      {tab === "whatsapp" && (
        <div className="card">
          <p className="sub">These are written and ready. Click Send: WhatsApp opens with the text filled in, you press send. Order messages come first.</p>
          {rows.length ? rows.map((m) => (
            <div key={m.id} style={{ padding: "12px 0", borderTop: "1px solid var(--line)" }}>
              <div className="inline" style={{ justifyContent: "space-between", marginBottom: 6 }}>
                <span><b>+{m.recipient}</b> <span className="dim">· {m.kind.replace(/_/g, " ")}{m.number && <> · <Link className="link" href={`/admin/orders/${m.order_id}`}>{m.number}</Link></>} · {fmtDate(m.created_at, tz)}</span></span>
                <WhatsAppSend id={m.id} phone={m.recipient} body={m.body} />
              </div>
              <div className="msg">{m.body}</div>
            </div>
          )) : <p className="empty">All caught up. Nothing is waiting to be sent.</p>}
        </div>
      )}

      {tab === "inbox" && (
        <div className="card">
          {rows.length ? rows.map((m) => (
            <div key={m.id} style={{ padding: "12px 0", borderTop: "1px solid var(--line)" }}>
              <div className="inline" style={{ justifyContent: "space-between", marginBottom: 6 }}>
                <span>
                  <b>{m.name}</b> {!m.is_read && <span className="pill bad">New</span>}{" "}
                  <span className="dim">· {m.topic} · {fmtDate(m.created_at, tz)}</span>
                </span>
                <span className="inline">
                  {m.phone && <a className="btn btn--wa btn--sm" href={waLink(m.phone.replace(/\D/g, "").replace(/^0/, settings.store.country_code))} target="_blank" rel="noopener noreferrer">WhatsApp</a>}
                  {m.email && <a className="btn btn--ghost btn--sm" href={`mailto:${m.email}`}>Email</a>}
                  {!m.is_read && <form action={markInboxReadAction}><input type="hidden" name="id" value={m.id} /><button className="btn btn--ghost btn--sm">Mark read</button></form>}
                </span>
              </div>
              <div className="msg">{m.message}</div>
              <small className="dim">{[m.email, m.phone].filter(Boolean).join(" · ")}</small>
            </div>
          )) : <p className="empty">No messages from the contact form yet.</p>}
        </div>
      )}

      {tab === "log" && (
        <div className="card">
          {rows.length ? (
            <div className="tablewrap" style={{ marginTop: -20 }}>
              <table className="table">
                <thead><tr><th>When</th><th>Channel</th><th>To</th><th>About</th><th>Status</th></tr></thead>
                <tbody>
                  {rows.map((m) => (
                    <tr key={m.id}>
                      <td className="dim">{fmtDate(m.created_at, tz)}</td>
                      <td>{m.channel === "email" ? "Email" : "WhatsApp"}</td>
                      <td>{m.recipient}</td>
                      <td>{m.kind.replace(/_/g, " ")}{m.number && <> · <Link className="link" href={`/admin/orders/${m.order_id}`}>{m.number}</Link></>}</td>
                      <td><span className={`pill ${TONE[m.status]}`}>{LABEL[m.status]}</span>{m.error && <div className="dim">{m.error}</div>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="empty">No messages yet.</p>}
        </div>
      )}
    </>
  );
}
