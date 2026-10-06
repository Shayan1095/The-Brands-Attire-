import { requirePerm } from "@/lib/auth";
import Link from "next/link";
import { query } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { channelStatus } from "@/lib/notify";
import { fmtDate } from "@/lib/format";
import { CampaignForm } from "@/components/admin/Widgets";

export const metadata = { title: "Campaigns" };

export default async function Campaigns() {
  const viewer = await requirePerm("marketing");
  const [campaigns, [audience], settings] = await Promise.all([
    query(
      `SELECT c.*,
         (SELECT count(*)::int FROM messages m WHERE m.campaign_id = c.id AND m.status = 'sent') AS sent,
         (SELECT count(*)::int FROM messages m WHERE m.campaign_id = c.id AND m.status IN ('queued', 'sending')) AS queued,
         (SELECT count(*)::int FROM messages m WHERE m.campaign_id = c.id AND m.status = 'manual') AS manual,
         (SELECT count(*)::int FROM messages m WHERE m.campaign_id = c.id AND m.status IN ('failed', 'skipped')) AS failed
       FROM campaigns c ORDER BY c.id DESC LIMIT 50`
    ),
    query(
      `SELECT count(*) FILTER (WHERE email_opt_in AND email IS NOT NULL)::int AS email,
              count(*) FILTER (WHERE whatsapp_opt_in AND phone IS NOT NULL)::int AS whatsapp FROM contacts`
    ),
    getSettings(),
  ]);

  return (
    <>
      <div className="head">
        <div><h1>Campaigns</h1><p>Send an offer or update to everyone who subscribed. New-arrival and sale announcements are created for you from the product and offers pages.</p></div>
      </div>
      <div className="cols cols--even">
        <div className="card">
          <h2>New campaign</h2>
          <p className="sub">Only people who opted in receive it. Every email carries an unsubscribe link.</p>
          <CampaignForm audience={audience} channels={channelStatus()} />
        </div>
        <div className="card">
          <h2>Sent campaigns</h2>
          {campaigns.length ? (
            <div className="tablewrap" style={{ marginTop: 8 }}>
              <table className="table">
                <thead><tr><th>Campaign</th><th>Sent</th><th>Waiting</th><th>Failed</th></tr></thead>
                <tbody>
                  {campaigns.map((c) => (
                    <tr key={c.id}>
                      <td><b>{c.name}</b><div className="dim">{fmtDate(c.created_at, settings.store.timezone)} · {c.channels.join(" + ")}</div></td>
                      <td>{c.sent} / {c.recipients}</td>
                      <td>{c.queued + c.manual > 0 ? <Link href="/admin/messages" className="link">{c.queued + c.manual}</Link> : 0}</td>
                      <td>{c.failed || 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="dim">Nothing sent yet.</p>}
        </div>
      </div>
    </>
  );
}
