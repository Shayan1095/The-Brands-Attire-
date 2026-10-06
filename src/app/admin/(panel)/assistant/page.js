import Link from "next/link";
import { requirePerm } from "@/lib/auth";
import { query } from "@/lib/db";
import { getSettings, siteUrl } from "@/lib/settings";
import { aiProvider } from "@/lib/assistant";
import { channelStatus } from "@/lib/notify";
import { saveSettingsAction, saveFaqAction, deleteFaqAction } from "@/lib/admin-actions";
import { fmtDate } from "@/lib/format";
import { AssistantTest } from "@/components/admin/Inbox";

export const metadata = { title: "Assistant" };

export default async function Assistant({ searchParams }) {
  await requirePerm("support");
  const { saved, q = "", error } = await searchParams;
  const settings = await getSettings();
  const a = settings.assistant;
  const tz = settings.store.timezone;
  const ai = aiProvider();
  const wa = channelStatus().whatsapp;
  const hook = Boolean(process.env.WHATSAPP_VERIFY_TOKEN && process.env.WHATSAPP_APP_SECRET);

  const [[stats], faqs, missed] = await Promise.all([
    query(`SELECT
      (SELECT count(*)::int FROM conversations WHERE last_at > now() - interval '7 days') AS chats,
      (SELECT count(*)::int FROM chat_messages WHERE sender = 'bot' AND created_at > now() - interval '7 days') AS answers,
      (SELECT count(*)::int FROM conversations c WHERE last_at > now() - interval '7 days'
         AND NOT EXISTS (SELECT 1 FROM chat_messages m WHERE m.conversation_id = c.id AND m.sender IN ('staff', 'system'))
         AND c.status <> 'human') AS alone,
      (SELECT count(*)::int FROM conversations WHERE status = 'human') AS waiting`),
    query("SELECT * FROM faqs ORDER BY sort_order, id"),
    query(
      `SELECT m.id, m.body, m.created_at, m.conversation_id FROM chat_messages m
       WHERE m.sender = 'customer' AND m.meta->>'miss' = 'true' ORDER BY m.id DESC LIMIT 12`
    ),
  ]);
  const share = stats.chats ? Math.round((stats.alone / stats.chats) * 100) : 0;

  return (
    <>
      <div className="head">
        <div>
          <h1>Assistant</h1>
          <p>{a.name} answers customers on the website chat and WhatsApp using your live stock, orders and policies. It never guesses: what it cannot answer goes to your team.</p>
        </div>
        <div className="head__actions"><Link href="/admin/inbox" className="btn btn--ghost">Open inbox</Link></div>
      </div>

      <div className="kpis">
        <div className="kpi"><span className="kpi__label">Chats, last 7 days</span><div className="kpi__value">{stats.chats}</div><div className="kpi__foot">{stats.answers} answers given</div></div>
        <div className="kpi"><span className="kpi__label">Handled without staff</span><div className="kpi__value">{share}%</div><div className="kpi__foot">{stats.alone} of {stats.chats} chats</div></div>
        <Link href="/admin/inbox" className="kpi kpi--btn"><span className="kpi__label">Waiting for a person</span><div className="kpi__value">{stats.waiting}</div><div className="kpi__foot">Open the inbox</div></Link>
        <div className="kpi"><span className="kpi__label">Saved answers</span><div className="kpi__value">{faqs.filter((f) => f.is_active).length}</div><div className="kpi__foot">Used {faqs.reduce((s, f) => s + f.hits, 0)} times</div></div>
      </div>

      <div className="cols cols--even" style={{ marginBottom: 16 }}>
        <div className="card">
          <h2>How it understands <span className={`pill ${ai ? "ok" : "info"}`}>{ai ? `${ai.label} connected` : "Built-in (free)"}</span></h2>
          <p className="sub" style={{ marginBottom: 0 }}>
            {ai
              ? <>Questions go to <b>{ai.model}</b>, which may only use your catalogue, orders and policies as its facts. If the model is unreachable, the built-in answers take over automatically.</>
              : <>The built-in mode recognises product names, sizes, colours, budgets, order tracking and policy questions in English and common Roman Urdu. For free-flowing conversation, add one key to your environment variables: <code>GEMINI_API_KEY</code> or <code>GROQ_API_KEY</code> (both have free tiers), or <code>ANTHROPIC_API_KEY</code>. Either way it only states facts from your own data.</>}
          </p>
        </div>
        <div className="card">
          <h2>WhatsApp <span className={`pill ${wa && hook ? "ok" : "warn"}`}>{wa && hook ? "Answering on WhatsApp" : wa ? "Sending only" : "Not connected"}</span></h2>
          <p className="sub" style={{ marginBottom: 0 }}>
            {wa && hook
              ? <>Customers' WhatsApp messages arrive at <code>{siteUrl()}/api/whatsapp</code> and are answered here. Replies within 24 hours of a customer's message are free on Meta's side.</>
              : <>To answer on WhatsApp, connect Meta's WhatsApp Cloud API: set <code>WHATSAPP_TOKEN</code>, <code>WHATSAPP_PHONE_ID</code>, <code>WHATSAPP_VERIFY_TOKEN</code> and <code>WHATSAPP_APP_SECRET</code>, then enter <code>{siteUrl()}/api/whatsapp</code> as the webhook in Meta's dashboard and subscribe to "messages". Until then the assistant works on the website chat.</>}
          </p>
        </div>
      </div>

      <div className="cols cols--even">
        <div>
          <form className="card" action={saveSettingsAction} id="settings">
            <input type="hidden" name="_key" value="assistant" />
            <h2>Behaviour {saved === "settings" && <span className="pill ok">Saved</span>}</h2>
            <p className="sub">You decide what it is called, when it steps aside and what it knows about the brand.</p>
            <label className="check"><input type="checkbox" name="enabled" defaultChecked={a.enabled} /> <span><b>Let the assistant answer.</b> Off = every chat goes straight to staff.</span></label>
            <label className="check"><input type="checkbox" name="web_chat" defaultChecked={a.web_chat} /> <span><b>Show the chat button in the shop.</b></span></label>
            <div className="frow">
              <div className="field"><label htmlFor="as-name">Name</label><input id="as-name" name="name" defaultValue={a.name} maxLength={30} required /></div>
              <div className="field"><label htmlFor="as-after">Call a person after</label><input id="as-after" name="handoff_after" type="number" min="1" max="5" defaultValue={a.handoff_after} /><small>unanswered questions in a row</small></div>
            </div>
            <div className="field"><label htmlFor="as-greet">Greeting</label><textarea id="as-greet" name="greeting" rows={2} defaultValue={a.greeting} /></div>
            <div className="field">
              <label htmlFor="as-words">Words that call a person immediately</label>
              <textarea id="as-words" name="handoff_words" rows={2} defaultValue={a.handoff_words} />
              <small>Separate with commas. Complaints and anything sensitive belong here.</small>
            </div>
            <div className="field"><label htmlFor="as-handoff">What it says when handing over</label><textarea id="as-handoff" name="handoff_message" rows={2} defaultValue={a.handoff_message} /></div>
            <div className="field">
              <label htmlFor="as-about">About the brand (optional)</label>
              <textarea id="as-about" name="about" rows={4} defaultValue={a.about} placeholder="Who you are, what you are known for, fabrics you use, where you ship from…" />
              <small>Used when an AI model is connected. For fixed answers, add them under Saved answers instead.</small>
            </div>
            <div className="field">
              <label htmlFor="as-cart">Remind about an unfinished checkout after (hours)</label>
              <input id="as-cart" name="cart_hours" type="number" min="0" max="72" defaultValue={a.cart_hours} />
              <small>Only for customers who ticked the box at checkout. One reminder, items still in stock only. 0 = never.</small>
            </div>
            <button className="btn">Save</button>
          </form>

          <div className="card" id="answers">
            <h2>Saved answers {saved === "answer" && <span className="pill ok">Saved</span>}{error && <span className="pill bad">Add a question and an answer</span>}</h2>
            <p className="sub">Your own words for the questions you get most. The assistant uses these before anything else, and staff can insert them into a reply with one click.</p>
            {faqs.map((f) => (
              <details key={f.id} className="faq">
                <summary><span>{f.question}</span>{!f.is_active && <span className="pill">Off</span>}<small>used {f.hits}×</small></summary>
                <form action={saveFaqAction}>
                  <input type="hidden" name="id" value={f.id} />
                  <div className="field"><label>Question</label><input name="question" defaultValue={f.question} required /></div>
                  <div className="field"><label>Answer</label><textarea name="answer" rows={3} defaultValue={f.answer} required /></div>
                  <div className="field"><label>Trigger words</label><input name="keywords" defaultValue={f.keywords} /><small>Comma separated. Any of these in a message gives this answer.</small></div>
                  <label className="check"><input type="checkbox" name="is_active" defaultChecked={f.is_active} /> In use</label>
                  <div className="inline">
                    <button className="btn btn--sm">Save</button>
                    <button formAction={deleteFaqAction} formNoValidate className="btn btn--danger btn--sm">Delete</button>
                  </div>
                </form>
              </details>
            ))}
            <form action={saveFaqAction} className="fold" style={faqs.length ? undefined : { borderTop: 0, marginTop: 0, paddingTop: 0 }}>
              <div className="field"><label htmlFor="faq-q">New question</label><input id="faq-q" name="question" defaultValue={q} placeholder="e.g. Do you deliver outside Pakistan?" required /></div>
              <div className="field"><label htmlFor="faq-a">Answer</label><textarea id="faq-a" name="answer" rows={3} required /></div>
              <div className="field"><label htmlFor="faq-k">Trigger words</label><input id="faq-k" name="keywords" placeholder="e.g. international, abroad, overseas, dubai" /><small>Comma separated. Add the words customers actually use, including Roman Urdu.</small></div>
              <button className="btn btn--sm">Add answer</button>
            </form>
          </div>
        </div>

        <div>
          <div className="card">
            <h2>Try it</h2>
            <AssistantTest name={a.name} brain={ai ? `${ai.label} model` : "built-in mode"} />
          </div>

          <div className="card">
            <h2>Questions it could not answer</h2>
            <p className="sub">Real customer messages. Write an answer once and it is handled from then on.</p>
            {missed.length ? missed.map((m) => (
              <div key={m.id} className="missed">
                <p>"{m.body}"</p>
                <span>
                  <small className="dim">{fmtDate(m.created_at, tz)}</small>
                  <Link className="link" href={`/admin/inbox?tab=all&c=${m.conversation_id}`}>See chat</Link>
                  <Link className="link" href={`/admin/assistant?q=${encodeURIComponent(m.body.slice(0, 200))}#answers`}>Write an answer</Link>
                </span>
              </div>
            )) : <p className="dim">Nothing yet. Unanswered questions will be listed here.</p>}
          </div>
        </div>
      </div>
    </>
  );
}
