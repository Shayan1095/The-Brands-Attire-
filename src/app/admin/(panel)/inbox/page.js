import Link from "next/link";
import { requirePerm } from "@/lib/auth";
import { query } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { markRead } from "@/lib/inbox";
import { channelStatus } from "@/lib/notify";
import { inboxStateAction } from "@/lib/admin-actions";
import { can, fmtDate, money, waLink, CHAT_STATUS, ORDER_STATUS } from "@/lib/format";
import { ChatThread, ReplyBox } from "@/components/admin/Inbox";

export const metadata = { title: "Inbox" };

const TABS = [["needs", "With your team"], ["bot", "With the assistant"], ["closed", "Closed"], ["all", "All chats"], ["carts", "Unfinished checkouts"]];
const WHERE = { needs: "c.status = 'human'", bot: "c.status = 'bot'", closed: "c.status = 'closed'", all: "true" };

const who = (c) => c.name || (c.phone ? `+${c.phone}` : `Website visitor #${c.id}`);

function ago(d) {
  const mins = Math.max(0, Math.round((Date.now() - new Date(d).getTime()) / 60000));
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  if (mins < 1440) return `${Math.round(mins / 60)}h`;
  return `${Math.round(mins / 1440)}d`;
}

export default async function Inbox({ searchParams }) {
  const viewer = await requirePerm("support");
  const sp = await searchParams;
  const tab = WHERE[sp.tab] || sp.tab === "carts" ? sp.tab : "needs";
  const settings = await getSettings();
  const tz = settings.store.timezone;
  const cur = settings.store.currency;
  const api = channelStatus().whatsapp;

  const [[counts], list] = await Promise.all([
    query(`SELECT count(*) FILTER (WHERE status = 'human')::int AS needs, count(*) FILTER (WHERE status = 'bot')::int AS bot,
                  count(*) FILTER (WHERE status = 'closed')::int AS closed, count(*)::int AS all,
                  (SELECT count(*)::int FROM checkouts) AS carts FROM conversations`),
    tab === "carts"
      ? query("SELECT * FROM checkouts ORDER BY updated_at DESC LIMIT 100")
      : query(
          `SELECT c.*, a.name AS assignee FROM conversations c LEFT JOIN admins a ON a.id = c.assigned_to
           WHERE ${WHERE[tab]} ORDER BY (c.status = 'human' AND c.unread > 0) DESC, c.last_at DESC LIMIT 80`
        ),
  ]);

  const tabs = (
    <div className="tabs">
      {TABS.map(([key, label]) => (
        <Link key={key} href={`/admin/inbox?tab=${key}`} className={tab === key ? "active" : ""}>{label} ({counts[key]})</Link>
      ))}
    </div>
  );
  const head = (
    <div className="head">
      <div><h1>Inbox</h1><p>Every customer chat from the website and WhatsApp. The assistant answers what it can; anything it hands over waits here for you.</p></div>
      <div className="head__actions">{can(viewer, "support") && <Link href="/admin/assistant" className="btn btn--ghost">Assistant settings</Link>}</div>
    </div>
  );

  if (tab === "carts") {
    const hours = settings.assistant.cart_hours;
    return (
      <>
        {head}{tabs}
        <div className="card">
          <p className="sub">
            People who typed their number at checkout, agreed to be contacted, and did not finish.{" "}
            {hours > 0 ? `One reminder is prepared automatically after ${hours} hours, listing only the items still in stock.` : "Automatic reminders are switched off in the assistant settings."}{" "}
            An entry disappears when the order is placed.
          </p>
          {list.length ? (
            <div className="tablewrap">
              <table className="table">
                <thead><tr><th>Customer</th><th>In the bag</th><th>Value</th><th>Last seen</th><th>Reminder</th><th /></tr></thead>
                <tbody>
                  {list.map((c) => (
                    <tr key={c.id}>
                      <td><b>{c.name || "No name yet"}</b><div className="dim">+{c.phone}</div></td>
                      <td>{c.items.map((i) => `${i.name} (${i.size}) × ${i.qty}`).join(", ")}</td>
                      <td>{money(c.total, cur)}</td>
                      <td className="dim">{fmtDate(c.updated_at, tz)}</td>
                      <td><span className={`pill ${c.reminded_at ? "ok" : "warn"}`}>{c.reminded_at ? `Prepared ${fmtDate(c.reminded_at, tz, false)}` : "Not yet"}</span></td>
                      <td><a className="btn btn--wa btn--sm" href={waLink(c.phone)} target="_blank" rel="noopener noreferrer">WhatsApp</a></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="empty">No unfinished checkouts right now.</p>}
        </div>
      </>
    );
  }

  const openId = Number(sp.c) || list[0]?.id || 0;
  const [conv] = openId ? await query("SELECT c.*, a.name AS assignee FROM conversations c LEFT JOIN admins a ON a.id = c.assigned_to WHERE c.id = $1", [openId]) : [];
  let messages = [], orders = [], contact = null, staff = [], saved = [];
  if (conv) {
    [messages, orders, [contact], staff, saved] = await Promise.all([
      query(
        `SELECT * FROM (SELECT m.id, m.sender, m.body, m.meta, m.status, m.created_at, a.name AS admin FROM chat_messages m
           LEFT JOIN admins a ON a.id = m.admin_id WHERE m.conversation_id = $1 ORDER BY m.id DESC LIMIT 200) t ORDER BY id`,
        [conv.id]
      ),
      conv.phone ? query("SELECT id, number, status, total, created_at FROM orders WHERE phone = $1 ORDER BY id DESC LIMIT 5", [conv.phone]) : [],
      conv.phone ? query("SELECT id, name, is_flagged FROM contacts WHERE phone = $1 LIMIT 1", [conv.phone]) : [],
      query("SELECT id, name FROM admins WHERE is_active AND (role = 'owner' OR 'support' = ANY(permissions)) ORDER BY name"),
      query("SELECT id, question, answer FROM faqs WHERE is_active ORDER BY sort_order, id"),
    ]);
    if (conv.unread > 0) await markRead(conv.id);
  }

  const hoursLeft = conv?.last_inbound_at ? 24 - (Date.now() - new Date(conv.last_inbound_at).getTime()) / 3600000 : 0;
  const waBlocked = conv?.channel === "whatsapp" && (!api || hoursLeft <= 0);

  return (
    <>
      {head}{tabs}
      <div className="inbox">
        <aside className="inbox__list" aria-label="Chats">
          {list.length ? list.map((c) => (
            <Link key={c.id} href={`/admin/inbox?tab=${tab}&c=${c.id}`} className={`inbox__row ${c.id === conv?.id ? "active" : ""}`} aria-current={c.id === conv?.id ? "true" : undefined}>
              <span className="inbox__name">
                <b>{who(c)}</b>
                <time>{ago(c.last_at)}</time>
              </span>
              <span className="inbox__last">{c.last_text || "…"}</span>
              <span className="inbox__meta">
                <span className={`chan chan--${c.channel === "whatsapp" ? "whatsapp" : "website"}`}>{c.channel === "whatsapp" ? "WhatsApp" : "Website"}</span>
                {c.status === "human" && !c.unread ? <span className="pill info">With {c.assignee || "staff"}</span> : <span className={`pill ${CHAT_STATUS[c.status].tone}`}>{CHAT_STATUS[c.status].label}</span>}
                {c.unread > 0 && c.id !== conv?.id && <i>{c.unread} new</i>}
              </span>
            </Link>
          )) : <p className="empty">{tab === "needs" ? "Nobody is waiting for a person." : "No chats here yet."}</p>}
        </aside>

        {conv ? (
          <>
            <section className="inbox__chat">
              <header className="inbox__head">
                <div>
                  <b>{who(conv)}</b>
                  <small>
                    {conv.channel === "whatsapp" ? "WhatsApp" : "Website chat"} · started {fmtDate(conv.created_at, tz)}
                    {conv.status === "human" && conv.handoff_reason && <> · <em>{conv.handoff_reason}</em></>}
                  </small>
                </div>
                <div className="inline">
                  {conv.status !== "human" && <form action={inboxStateAction}><input type="hidden" name="id" value={conv.id} /><button name="status" value="human" className="btn btn--sm">Take over</button></form>}
                  {conv.status === "human" && <form action={inboxStateAction}><input type="hidden" name="id" value={conv.id} /><button name="status" value="bot" className="btn btn--ghost btn--sm">Hand back to assistant</button></form>}
                  {conv.status !== "closed" && <form action={inboxStateAction}><input type="hidden" name="id" value={conv.id} /><button name="status" value="closed" className="btn btn--ghost btn--sm">Close</button></form>}
                </div>
              </header>
              <ChatThread
                timeZone={tz}
                messages={messages.map((m) => ({ id: m.id, sender: m.sender, body: m.body, at: m.created_at, admin: m.admin, products: m.meta?.products || [], miss: Boolean(m.meta?.miss), failed: m.status === "failed" }))}
              />
              <ReplyBox
                id={conv.id} saved={saved} disabled={waBlocked}
                hint={!api ? "The WhatsApp API is not connected." : "Over 24 hours since the customer wrote: WhatsApp only allows a template now. Use the WhatsApp button on the right."}
              />
            </section>

            <aside className="inbox__side">
              <div className="card">
                <h2>Customer</h2>
                <p><b>{who(conv)}</b></p>
                {conv.phone ? <p className="dim">+{conv.phone}</p> : <p className="dim">No phone number: this visitor has only used the website chat.</p>}
                {contact?.is_flagged && <p><span className="pill bad">Flagged customer</span></p>}
                <div className="inline" style={{ marginTop: 10 }}>
                  {conv.phone && <WhatsAppLink phone={conv.phone} />}
                  {contact && can(viewer, "customers") && <Link className="btn btn--ghost btn--sm" href={`/admin/customers/${contact.id}`}>Profile</Link>}
                  {can(viewer, "orders") && <Link className="btn btn--ghost btn--sm" href="/admin/orders/new">New order</Link>}
                </div>
                {conv.channel === "whatsapp" && api && (
                  <p className="hint" style={{ marginTop: 10 }}>
                    {hoursLeft > 0 ? `You can reply freely for another ${Math.max(1, Math.floor(hoursLeft))}h (WhatsApp's 24-hour rule).` : "The 24-hour reply window has closed."}
                  </p>
                )}
              </div>

              <div className="card">
                <h2>Handled by</h2>
                <form action={inboxStateAction} className="inline">
                  <input type="hidden" name="id" value={conv.id} />
                  <select name="assigned_to" key={conv.assigned_to || 0} defaultValue={conv.assigned_to || ""} className="input" style={{ flex: 1 }} aria-label="Assign to">
                    <option value="">Nobody yet</option>
                    {staff.map((s) => <option key={s.id} value={s.id}>{s.name || `Staff #${s.id}`}{s.id === viewer.id ? " (you)" : ""}</option>)}
                  </select>
                  <button className="btn btn--ghost btn--sm">Assign</button>
                </form>
              </div>

              {conv.phone && (
                <div className="card">
                  <h2>Their orders</h2>
                  {orders.length ? orders.map((o) => (
                    <p key={o.id} className="inbox__order">
                      {can(viewer, "orders") ? <Link className="link" href={`/admin/orders/${o.id}`}>{o.number}</Link> : <b>{o.number}</b>}
                      <span className={`pill ${ORDER_STATUS[o.status].tone}`}>{ORDER_STATUS[o.status].label}</span>
                      <span className="dim">{money(o.total, cur)}</span>
                    </p>
                  )) : <p className="dim">No orders with this number.</p>}
                </div>
              )}
            </aside>
          </>
        ) : (
          <section className="inbox__chat inbox__chat--empty">
            <p className="empty">{counts.all ? "Choose a chat on the left." : "No chats yet. They appear here as soon as a customer writes on the website chat or on WhatsApp."}</p>
          </section>
        )}
      </div>
    </>
  );
}

const WhatsAppLink = ({ phone }) => <a className="btn btn--wa btn--sm" href={waLink(phone)} target="_blank" rel="noopener noreferrer">Open WhatsApp</a>;
