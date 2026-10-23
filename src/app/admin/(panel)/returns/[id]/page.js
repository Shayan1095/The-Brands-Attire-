import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePerm } from "@/lib/auth";
import { getCase, exchangeFee } from "@/lib/cases";
import { query } from "@/lib/db";
import { getSettings, siteUrl } from "@/lib/settings";
import { money, fmtDate, waLink, can, CASE_TYPES, CASE_REASONS, CASE_STATUS, RESOLUTIONS, ORDER_STATUS } from "@/lib/format";
import CaseActions, { CaseNote, CaseAssign, DamagedButton } from "@/components/admin/CaseActions";
import AdminIcon from "@/components/admin/icons";

export const metadata = { title: "Return" };

const FLOW = [["requested", "Requested", "created_at"], ["approved", "Approved", "decided_at"], ["in_transit", "Pickup booked", null], ["received", "Collected", "received_at"], ["resolved", "Settled", "resolved_at"]];

export default async function CasePage({ params }) {
  const viewer = await requirePerm("returns");
  const { id } = await params;
  const [c, settings, [triage], staff] = await Promise.all([
    getCase(Number(id) || 0), getSettings(),
    query("SELECT data, status FROM agent_tasks WHERE dedupe = $1", [`triage:case:${Number(id) || 0}`]),
    query("SELECT id, name, email FROM admins WHERE is_active AND (role = 'owner' OR 'returns' = ANY(permissions)) ORDER BY name"),
  ]);
  if (!c) notFound();
  // the replacement order, while it is out with the rider (a swap) or after settling
  const [swap] = c.exchange_order_id ? await query("SELECT id, number, status, total FROM orders WHERE id = $1", [c.exchange_order_id]) : [];
  const tz = settings.store.timezone;
  const fmt = (n) => money(n, settings.store.currency);
  const st = CASE_STATUS[c.status];
  const value = c.items.reduce((s, i) => s + i.unit_price * i.qty, 0);

  // progress: a complaint has no parcel, a declined request ends in a red step
  const flow = c.type === "complaint" ? [FLOW[0], FLOW[4]] : FLOW;
  const at = flow.findIndex(([k]) => k === c.status);
  const steps = c.status === "rejected"
    ? [{ label: "Requested", time: c.created_at, state: "done" }, { label: "Declined", time: c.decided_at, state: "end" }]
    : flow.map(([, label, col], i) => ({ label, time: col ? c[col] : null, state: i <= at ? "done" : i === at + 1 ? "now" : "" }));

  return (
    <>
      <div className="head">
        <div>
          <h1>{c.number} <span className={`pill ${st.tone}`}>{st.label}</span></h1>
          <p>
            <Link href="/admin/returns" className="link">← All returns</Link>
            {" · "}<span className={`case-kind case-kind--${c.type}`}>{CASE_TYPES[c.type]}</span>
            {" · "}{CASE_REASONS[c.reason]?.[0]}
            {" · "}order <Link href={`/admin/orders/${c.order_id}`} className="link">{c.order_number}</Link>
            {" · "}{c.source === "staff" ? "opened by staff" : "from the customer"} {fmtDate(c.created_at, tz)}
          </p>
        </div>
      </div>
      {!c.eligible && <div className="note note--warn">This request is outside your return rules. It was {c.source === "staff" ? "opened by staff on purpose" : "accepted anyway"}; check the activity below for why.</div>}

      <ol className="osteps" style={{ "--n": steps.length }} aria-label="Progress">
        {steps.map((s, i) => (
          <li key={s.label} className={s.state} style={{ "--i": i }}>
            <span className="osteps__dot">{s.state === "done" ? <AdminIcon name="check" /> : s.state === "end" ? <AdminIcon name="x" /> : i + 1}</span>
            <b>{s.label}</b>
            <small>{s.time ? fmtDate(s.time, tz) : s.state === "now" ? "Next" : ""}</small>
          </li>
        ))}
      </ol>

      <div className="cols cols--order">
        <div>
          <div className="card">
            <h2>{c.type === "exchange" ? "Coming back, and going out instead" : c.type === "return" ? "Coming back" : "Pieces concerned"}</h2>
            {c.items.length ? (
              <div className="caseitems">
                {c.items.map((i) => (
                  <div className="caseitem" key={i.id}>
                    {i.image ? <img src={i.image} alt="" /> : <i className="invx__noimg" />}
                    <div className="caseitem__what">
                      <b>{i.name}</b>
                      <small>Size {i.size} × {i.qty} · {fmt(i.unit_price)} each</small>
                      {i.condition && <span className={`pill ${i.condition === "damaged" ? "bad" : "ok"}`}>{i.condition === "damaged" ? "Written off as damaged" : "Back in stock"}</span>}
                      {i.condition === "restock" && ["received", "resolved"].includes(c.status) && <DamagedButton caseId={c.id} itemId={i.id} />}
                    </div>
                    {i.want_size && (
                      <div className="caseitem__swap">
                        <AdminIcon name="arrow" />
                        <span><b>{i.want_size}</b>{c.exchange_order_id ? <small>held for {c.exchange_number}</small> : <small className={i.want_stock < i.qty ? "bad" : ""}>{i.want_stock >= i.qty ? `${i.want_stock} in stock` : i.want_stock ? `only ${i.want_stock} left` : "sold out now"}</small>}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : <p className="dim">No pieces chosen: this is about the order as a whole.</p>}
            {c.items.length > 0 && <p className="sub" style={{ margin: "12px 0 0" }}>Paid for these: <b>{fmt(value)}</b></p>}
          </div>

          <div className="card">
            <h2>In the customer's words</h2>
            <p className="casewords">{c.details || <span className="dim">No details given.</span>}</p>
          </div>

          <div className="card">
            <h2>Activity</h2>
            <p className="sub">Every step, who took it and what the customer was told.</p>
            <ul className="events">
              {c.events.map((e) => (
                <li key={e.id}><span><b>{e.actor}</b> · {e.note}</span><time>{fmtDate(e.created_at, tz)}</time></li>
              ))}
            </ul>
            <CaseNote id={c.id} />
          </div>
        </div>

        <div>
          {triage && c.status === "requested" && (
            <div className="card triagecard">
              <div className="guardcard__head">
                <AdminIcon name="refresh" />
                <b>Returns triage suggests: {{ approve: "approve", decline: "decline", review: "take a closer look", reply: "reply and put it right" }[triage.data?.verdict] || "review"}</b>
              </div>
              <ul className="ag__why">{(triage.data?.reasons || []).map((r, i) => <li key={i} className={/inside|always accepted|in stock/i.test(r) ? "good" : ""}>{r}</li>)}</ul>
              {triage.data?.draft && <p className="casewords">{triage.data.draft}</p>}
              <small className="hint">Copy the message into the box below, or decide from <Link href="/admin/agents" className="link">Agents</Link> with one click.</small>
            </div>
          )}
          <CaseActions
            c={{
              id: c.id, type: c.type, status: c.status, value, currency: settings.store.currency,
              swaps: c.items.filter((i) => i.want_variant_id).length, short: c.items.some((i) => i.want_variant_id && i.want_stock < i.qty),
              items: c.items.map((i) => ({ id: i.id, name: i.name, size: i.size, qty: i.qty })),
              courier: c.return_courier, tracking: c.return_tracking,
              method: c.pickup_method, by: c.pickup_by, date: c.pickup_date ? String(c.pickup_date instanceof Date ? c.pickup_date.toISOString() : c.pickup_date).slice(0, 10) : "",
              swap: swap ? { id: swap.id, number: swap.number, status: ORDER_STATUS[swap.status]?.label || swap.status, total: swap.total } : null,
              fee: c.type === "exchange" ? exchangeFee(c, settings) : 0, fault: Boolean(CASE_REASONS[c.reason]?.[1]),
              carrier: settings.returns.carrier,
            }}
            resolutions={RESOLUTIONS}
          />

          <CaseAssign id={c.id} assigned={c.assigned_to || ""} staff={staff.map((s) => ({ id: s.id, name: s.name || s.email }))} />

          {c.status === "resolved" && (
            <div className="card">
              <h2>How it was settled</h2>
              <p>{RESOLUTIONS[c.resolution] || "Settled"}</p>
              {c.exchange_order_id && <p><Link href={`/admin/orders/${c.exchange_order_id}`} className="link">Replacement order {c.exchange_number}</Link></p>}
              {c.refund_amount > 0 && <p className="dim">{c.credit_code ? `Store credit ${c.credit_code}` : `Refunded by ${c.refund_method}${c.refund_ref ? ` (${c.refund_ref})` : ""}`}: {fmt(c.refund_amount)}</p>}
            </div>
          )}

          <div className="card">
            <h2>Customer</h2>
            <p><b>{c.customer_name}</b></p>
            <p className="dim">{c.address}<br />{c.city}</p>
            {c.phone !== "0" && <p style={{ marginTop: 8 }}>+{c.phone}{c.email && <><br />{c.email}</>}</p>}
            <div className="inline" style={{ marginTop: 12 }}>
              {c.phone !== "0" && <a className="btn btn--wa btn--sm" href={waLink(c.phone, `Hi ${c.customer_name.split(" ")[0]}, this is ${settings.store.name} about your request ${c.number}.`)} target="_blank" rel="noopener noreferrer">Chat on WhatsApp</a>}
              <a className="btn btn--ghost btn--sm" href={`${siteUrl()}/order/${c.order_token}#returns`} target="_blank" rel="noopener">What they see ↗</a>
              {c.contact_id && can(viewer, "customers") && <Link href={`/admin/customers/${c.contact_id}`} className="btn btn--ghost btn--sm">Customer history</Link>}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
