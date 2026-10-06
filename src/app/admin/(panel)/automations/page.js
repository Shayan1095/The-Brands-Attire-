import { requirePerm } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { EVENTS, automation, channelStatus } from "@/lib/notify";
import { saveAutomationAction } from "@/lib/admin-actions";

export const metadata = { title: "Automations" };

export default async function Automations({ searchParams }) {
  const viewer = await requirePerm("marketing");
  const { saved } = await searchParams;
  const settings = await getSettings();
  const channels = channelStatus();
  const groups = [...new Set(Object.values(EVENTS).map((e) => e.group))];

  return (
    <>
      <div className="head">
        <div><h1>Automations</h1><p>Messages the system sends for you. Switch each one on or off and edit the wording.</p></div>
      </div>

      <div className="cols cols--even" style={{ marginBottom: 16 }}>
        <div className="card">
          <h2>Email <span className={`pill ${channels.email ? "ok" : "warn"}`}>{channels.email ? "Connected" : "Not connected"}</span></h2>
          <p className="sub" style={{ marginBottom: 0 }}>
            {channels.email
              ? "Emails are sent automatically through your SMTP account."
              : <>Add <code>SMTP_HOST</code>, <code>SMTP_PORT</code>, <code>SMTP_USER</code>, <code>SMTP_PASS</code> and <code>EMAIL_FROM</code> to your environment variables. A Gmail account with an app password works (smtp.gmail.com, port 465, about 500 emails a day, free).</>}
          </p>
        </div>
        <div className="card">
          <h2>WhatsApp <span className={`pill ${channels.whatsapp ? "ok" : "warn"}`}>{channels.whatsapp ? "API connected" : "One-click mode"}</span></h2>
          <p className="sub" style={{ marginBottom: 0 }}>
            {channels.whatsapp
              ? "Messages with a template name below are sent automatically through the WhatsApp Cloud API. Messages without one wait for one-click sending."
              : <>Free mode: each WhatsApp message is written for you and waits in Messages. One click opens WhatsApp with the text ready. For fully automatic sending, add <code>WHATSAPP_TOKEN</code> and <code>WHATSAPP_PHONE_ID</code> from Meta's WhatsApp Cloud API and enter an approved template name per message.</>}
          </p>
        </div>
      </div>

      {groups.map((group) => (
        <section key={group} style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: "1.05rem", margin: "0 0 10px" }}>{group}</h2>
          {Object.entries(EVENTS).filter(([, e]) => e.group === group).map(([key, def]) => {
            const cfg = automation(settings, key);
            return (
              <details className="card" key={key} id={key} open={saved === key} style={{ marginTop: 8 }}>
                <summary style={{ cursor: "pointer", fontWeight: 600 }}>
                  {def.label}{" "}
                  {!def.templateOnly && <span className={`pill ${cfg.email ? "info" : ""}`}>Email {cfg.email ? "on" : "off"}</span>}{" "}
                  {!def.owner && !def.templateOnly && <span className={`pill ${cfg.whatsapp ? "ok" : ""}`}>WhatsApp {cfg.whatsapp ? "on" : "off"}</span>}
                  {saved === key && <span className="pill ok" style={{ marginLeft: 6 }}>Saved</span>}
                </summary>
                <form action={saveAutomationAction} style={{ marginTop: 14 }}>
                  <input type="hidden" name="event" value={key} />
                  {def.templateOnly ? (
                    <>
                      <input type="hidden" name="email" value="on" /><input type="hidden" name="whatsapp" value="on" />
                      <p className="sub">Custom campaigns are written on the Campaigns page. This only sets the WhatsApp API template they use.</p>
                    </>
                  ) : (
                    <>
                      <div className="inline" style={{ marginBottom: 6 }}>
                        <label className="check"><input type="checkbox" name="email" defaultChecked={cfg.email} /> Send by email</label>
                        {!def.owner && <label className="check"><input type="checkbox" name="whatsapp" defaultChecked={cfg.whatsapp} /> Send by WhatsApp</label>}
                      </div>
                      <div className="field"><label>Email subject</label><input name="subject" defaultValue={cfg.subject} /></div>
                      <div className="field">
                        <label>Message</label>
                        <textarea name="body" rows={9} defaultValue={cfg.body} />
                        <small>Words in double curly brackets are filled in automatically, e.g. <code>{"{{name}}"}</code>, <code>{"{{order_number}}"}</code>, <code>{"{{total}}"}</code>, <code>{"{{order_url}}"}</code>, <code>{"{{store}}"}</code>. Clear the box to restore the original text.</small>
                      </div>
                    </>
                  )}
                  {!def.owner && (
                    <div className="field">
                      <label>WhatsApp API template name (optional)</label>
                      <input name="wa_template" defaultValue={cfg.wa_template} placeholder="e.g. order_confirm" />
                      <small>Only needed for automatic API sending. The approved template must have these variables, in order: {def.params.map((p, i) => `{{${i + 1}}} = ${p}`).join(", ")}.</small>
                    </div>
                  )}
                  <button className="btn btn--sm">Save</button>
                </form>
              </details>
            );
          })}
        </section>
      ))}
    </>
  );
}
