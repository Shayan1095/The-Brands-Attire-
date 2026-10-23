"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { runAgentAction, decideTaskAction, saveAgentSettingsAction } from "@/lib/admin-actions";
import AdminIcon from "./icons";

const ease = [0.16, 1, 0.3, 1];

// what each agent is, in one line, and what approving its suggestion means
const AGENTS = {
  briefing: {
    name: "Daily briefing", icon: "sun",
    role: "Every morning: yesterday's sales, what needs doing today and what the other agents found.",
    approve: "Done",
  },
  guard: {
    name: "Order guard", icon: "shield",
    role: "Checks every new order for cash-on-delivery risk and tells you when to call first or ask for an advance.",
    approve: "Checked, it's fine",
  },
  restock: {
    name: "Restock", icon: "layers",
    role: "Warns before a size sells out, and when customers are waiting for a sold-out size.",
    approve: "Marked as ordered",
  },
  triage: {
    name: "Returns triage", icon: "refresh",
    role: "Looks at every new return, exchange or complaint, suggests approve or decline and writes the message.",
    approve: "Done",
  },
  writer: {
    name: "Marketing writer", icon: "megaphone",
    role: "Spots the moment for a campaign (new pieces, a sale, customers drifting away) and drafts it for the right group.",
    approve: "Open in Campaigns",
  },
  catalogue: {
    name: "Catalogue checker", icon: "box",
    role: "Finds products with missing photos, thin descriptions or odd prices, and drafts a description.",
    approve: "Fixed",
  },
  merch: {
    name: "Merchandiser", icon: "layout",
    role: "Suggests clear-out sales for slow pieces, keeps sold-out pieces out of your Showcase and points out best sellers to feature.",
    approve: "Done",
  },
  feedback: {
    name: "Feedback analyst", icon: "star",
    role: "Reads returns and ratings per product and finds the pattern: runs small or large, quality problems, low ratings.",
    approve: "Noted",
  },
};
// the Auto switch each agent may have, and what it lets the agent do by itself
const AUTO = {
  triage: ["triage_auto", "Auto: approve clear cases by itself", "Only requests inside your rules, from customers without frequent returns, with the sizes in stock. Declines always wait for you."],
  catalogue: ["catalogue_auto", "Auto: save a drafted description by itself", "Only for products with no description at all."],
  merch: ["merch_auto", "Auto: remove sold-out pieces from the Showcase by itself", "Sales are never started by themselves."],
  feedback: ["feedback_auto", "Auto: publish fit tips by itself", "Quality problems and low ratings always wait for you."],
};
const VERDICT = { approve: ["Approve", "ok"], decline: ["Decline", "bad"], review: ["Take a closer look", "warn"], reply: ["Reply and put it right", "warn"] };

/**
 * Admin -> Agents: the agents with their switches and settings, the suggestions they made (approve or
 * dismiss, with the drafted text editable first), today's briefing and what they did lately.
 * See lib/agents.js and lib/agents-writers.js.
 */
export default function AgentsBoard({ view, settings, currency, counts, last, tasks, runs, briefing, ai }) {
  const router = useRouter();
  const [cfg, setCfg] = useState(settings);
  const [saved, setSaved] = useState(JSON.stringify(settings));
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState(null);
  const [gone, setGone] = useState([]); // suggestions handled on this page, removed at once
  const [notes, setNotes] = useState({});
  const dirty = JSON.stringify(cfg) !== saved;

  const flash = (text, bad = false) => { setMsg({ text, bad }); setTimeout(() => setMsg(null), 3600); };
  const call = async (key, fn) => {
    setBusy(key);
    const res = await fn().catch(() => ({ error: "Something went wrong. Please try again." }));
    setBusy("");
    return res;
  };

  const run = async (agent) => {
    const res = await call(`run-${agent || "all"}`, () => runAgentAction(agent || ""));
    if (res?.error) return flash(res.error, true);
    const lines = Object.entries(res.ran || {}).map(([k, v]) => `${AGENTS[k]?.name}: ${v.split("\n")[0]}`);
    flash(lines.length ? lines.join(" · ") : "Nothing to do right now.");
    router.refresh();
  };
  // drafted text the owner may edit before approving (a message, a product description)
  const [texts, setTexts] = useState({});
  const [sale, setSale] = useState({}); // clear-out sale percent / days per suggestion
  // triage: the box shows the wording for the suggested decision; pressing the other button uses that one's wording
  // unless the owner edited the text
  const textOf = (t, decision) => texts[t.id] ?? (decision && t.data?.drafts?.[decision]) ?? t.data?.draft ?? "";
  const shownText = (t) => texts[t.id] ?? (t.agent === "triage" && t.data?.drafts ? t.data.drafts[t.data.verdict === "decline" ? "decline" : "approve"] : t.data?.draft) ?? "";
  const decide = async (t, approve, payload = {}) => {
    const res = await call(`task-${t.id}`, () => decideTaskAction(t.id, approve, notes[t.id] || "", payload));
    if (res?.error) return flash(res.error, true);
    setGone((g) => [...g, t.id]);
    if (res?.redirect) return router.push(res.redirect);
    flash(payload.decision === "approve" ? "Request approved and the customer told." : payload.decision === "decline" ? "Request declined and the customer told."
      : payload.description ? "Description saved on the product." : t.kind === "clearout" && approve ? "Sale started. It is live in the shop now."
      : t.kind === "fit_note" && approve ? "Fit tip published on the product page." : t.kind === "showcase_clean" && approve ? "Removed from the Showcase."
      : approve ? "Done." : "Dismissed.");
    router.refresh();
  };
  const save = async () => {
    const res = await call("save", () => saveAgentSettingsAction(cfg));
    if (res?.error) return flash(res.error, true);
    setSaved(JSON.stringify(cfg));
    flash("Saved.");
    router.refresh();
  };
  const set = (k, v) => setCfg((c) => ({ ...c, [k]: v }));
  const num = (k) => (e) => set(k, e.target.value === "" ? "" : Number(e.target.value));

  const shown = tasks.filter((t) => !gone.includes(t.id));

  return (
    <>
      <div className="head">
        <div>
          <h1>Agents</h1>
          <p>They watch the shop for you and suggest what to do. Nothing changes without your say: approve a suggestion (after editing its text if you like) or dismiss it. They work from your own data with built-in wording, so they cost nothing; a free AI model can polish their writing.</p>
        </div>
        <div className="head__actions">
          <button type="button" className="btn" onClick={() => run(null)} disabled={Boolean(busy)}>
            <AdminIcon name="zap" />{busy === "run-all" ? "Running…" : "Run all now"}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {msg && (
          <motion.div className={`note ${msg.bad ? "note--bad" : "note--ok"} ag__msg`} initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.3, ease }} role="status">
            {msg.text}
          </motion.div>
        )}
      </AnimatePresence>

      <section className={`card ag__ai ${ai.provider ? "is-on" : ""}`}>
        <span className="ag__icon"><AdminIcon name="spark" /></span>
        <div className="ag__aitext">
          <b>AI writing {ai.provider ? <span className="pill ok">{ai.provider.label} connected</span> : <span className="pill">Not connected</span>}</b>
          {ai.provider ? (
            <p>The agents use {ai.provider.label} ({ai.provider.model}) to polish their messages, campaigns and descriptions. Decisions stay rule-based. {ai.enabled ? `${ai.used} of ${ai.limit} calls used today.` : "Switched off: they use their built-in wording."}</p>
          ) : (
            <p>Everything works without it, using built-in wording. To connect a free model, add <code>GEMINI_API_KEY</code> (free at aistudio.google.com) or <code>GROQ_API_KEY</code> (free at console.groq.com) to the environment variables in Vercel, then redeploy.</p>
          )}
        </div>
        <div className="ag__aiset">
          <label className="check"><input type="checkbox" checked={cfg.ai} onChange={(e) => set("ai", e.target.checked)} /> Use AI for wording</label>
          <label><span>Most calls per day</span><input type="number" min="0" value={cfg.ai_daily_limit} onChange={num("ai_daily_limit")} /></label>
        </div>
      </section>

      <div className="ag__agents">
        {Object.entries(AGENTS).map(([key, a]) => {
          const on = Boolean(cfg[key]);
          const l = last[key];
          return (
            <section key={key} className={`card ag__agent ${on ? "is-on" : ""}`}>
              <div className="ag__top">
                <span className="ag__icon"><AdminIcon name={a.icon} /></span>
                <div className="ag__name">
                  <b>{a.name}</b>
                  <small>{on ? (key === "briefing" ? `Every day from ${String(cfg.briefing_hour).padStart(2, "0")}:00` : "Watching") : "Switched off"}</small>
                </div>
                <button type="button" role="switch" aria-checked={on} aria-label={`${a.name} on or off`} className={`ag__switch ${on ? "on" : ""}`} onClick={() => set(key, !on)}><i /></button>
              </div>
              <p className="ag__role">{a.role}</p>
              <div className="ag__last">
                <span className={`ag__dot ${l ? (l.ok ? "ok" : "bad") : ""}`} />
                <span>{l ? <><b>{l.when}</b> · {l.summary.split("\n")[0]}</> : "Has not run yet."}</span>
              </div>
              <div className="ag__foot">
                {key !== "briefing" && <span className="ag__count">{counts.byAgent[key]} open</span>}
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => run(key)} disabled={Boolean(busy)}>{busy === `run-${key}` ? "Running…" : "Run now"}</button>
              </div>
              <details className="fold ag__settings">
                <summary>Settings</summary>
                {key === "briefing" && (
                  <div className="ag__fields">
                    <label><span>Write it from (hour, store time)</span><input type="number" min="0" max="23" value={cfg.briefing_hour} onChange={num("briefing_hour")} /></label>
                    <label className="check"><input type="checkbox" checked={cfg.briefing_email} onChange={(e) => set("briefing_email", e.target.checked)} /> Also email it to me</label>
                  </div>
                )}
                {key === "guard" && (
                  <div className="ag__fields">
                    <label><span>Call first from risk</span><input type="number" min="0" max="100" value={cfg.guard_call} onChange={num("guard_call")} /></label>
                    <label><span>Ask for an advance from risk</span><input type="number" min="0" max="100" value={cfg.guard_advance} onChange={num("guard_advance")} /></label>
                    <label><span>High first order ({currency})</span><input type="number" min="0" value={cfg.guard_high_value} onChange={num("guard_high_value")} /></label>
                  </div>
                )}
                {key === "restock" && (
                  <div className="ag__fields">
                    <label><span>Warn this many days ahead (plus supplier time)</span><input type="number" min="1" value={cfg.restock_days} onChange={num("restock_days")} /></label>
                  </div>
                )}
                {AUTO[key] && (
                  <div className="ag__fields">
                    <label className="check"><input type="checkbox" checked={Boolean(cfg[AUTO[key][0]])} onChange={(e) => set(AUTO[key][0], e.target.checked)} /> <span>{AUTO[key][1]}<small className="hint">{AUTO[key][2]}</small></span></label>
                  </div>
                )}
                {(key === "writer" || key === "catalogue" || key === "merch" || key === "feedback") && (
                  <p className="hint" style={{ margin: 0 }}>{key === "writer" ? "Looks once a day. Nothing is sent: a draft opens in Campaigns for you to send." : key === "catalogue" ? "Looks once a day and raises up to 10 products at a time." : "Looks once a day."}</p>
                )}
              </details>
            </section>
          );
        })}
      </div>

      <div className={`sc__bar ${dirty ? "on" : ""}`} role="region" aria-label="Unsaved changes" aria-hidden={!dirty}>
        <span><i aria-hidden />Agent settings changed</span>
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => setCfg(JSON.parse(saved))} tabIndex={dirty ? 0 : -1}>Discard</button>
        <button type="button" className="btn btn--sm" onClick={save} disabled={busy === "save"} tabIndex={dirty ? 0 : -1}>{busy === "save" ? "Saving…" : "Save"}</button>
      </div>

      <div className="cols">
        <div>
          <div className="tabs">
            {[["open", "Waiting for you"], ["done", "Done"], ["dismissed", "Dismissed"]].map(([k, label]) => (
              <Link key={k} href={`/admin/agents${k === "open" ? "" : `?view=${k}`}`} className={view === k ? "active" : ""}>{label} ({counts[k]})</Link>
            ))}
          </div>

          {shown.length ? (
            <ul className="ag__tasks">
              <AnimatePresence initial={false}>
                {shown.map((t) => {
                  const a = AGENTS[t.agent] || { name: t.agent, icon: "spark", approve: "Done" };
                  return (
                    <motion.li key={t.id} layout className={`card ag__task is-${t.severity}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 40, height: 0, marginTop: 0, paddingTop: 0, paddingBottom: 0 }} transition={{ duration: 0.35, ease }}>
                      <div className="ag__thead">
                        <span className="ag__tag"><AdminIcon name={a.icon} />{a.name}</span>
                        <small>{t.when}</small>
                      </div>
                      <b className="ag__title">{t.title}</b>
                      {t.agent === "guard" && t.data?.score != null && (
                        <div className="ag__risk">
                          <span className="ag__meter"><i style={{ "--p": t.data.score / 100 }} /></span>
                          <b>{t.data.score}<small>/100 risk</small></b>
                          <span className="dim">{[t.data.customer, t.data.city, t.total].filter(Boolean).join(" · ")}</span>
                        </div>
                      )}
                      {t.agent === "guard" ? (
                        <ul className="ag__why">{(t.data?.reasons || []).map((r, i) => <li key={i} className={r.includes("delivered and paid") ? "good" : ""}>{r}</li>)}</ul>
                      ) : t.agent === "restock" && t.data?.sizes ? (
                        <div className="ag__sizes">
                          {t.data.sizes.map((s) => (
                            <span key={s.label} className={s.available === 0 ? "out" : "low"}>
                              <b>{s.label}</b>
                              <small>{s.available === 0 ? "sold out" : `${s.available} left · ~${s.daysLeft}d`}{s.waiting ? ` · ${s.waiting} waiting` : ""}</small>
                              {s.order > 0 && <em>order ~{s.order}</em>}
                            </span>
                          ))}
                        </div>
                      ) : t.agent === "triage" ? (
                        <>
                          <div className="ag__verdict">
                            <span className={`pill ${VERDICT[t.data?.verdict]?.[1] || ""}`}>Suggests: {VERDICT[t.data?.verdict]?.[0] || "Review"}</span>
                            <span className="dim">{t.data?.customer}</span>
                          </div>
                          <ul className="ag__why">{(t.data?.reasons || []).map((r, i) => <li key={i} className={/inside|always accepted|in stock/i.test(r) ? "good" : ""}>{r}</li>)}</ul>
                          {view === "open" && (
                            <label className="ag__draft"><span>Message to the customer {t.data?.drafts ? "(the other button sends its own wording unless you edit this)" : ""}</span>
                              <textarea rows={3} value={shownText(t)} onChange={(e) => setTexts((x) => ({ ...x, [t.id]: e.target.value }))} maxLength={600} />
                            </label>
                          )}
                        </>
                      ) : t.agent === "writer" ? (
                        <div className="ag__mail">
                          <span className="ag__mailto">To: {t.data?.audience ? t.data.audience.startsWith("segment:") ? "the “At risk” group" : "people who bought from this collection" : "everyone who subscribed"} · {t.detail}</span>
                          <b>{t.data?.subject}</b>
                          <p>{t.data?.body}</p>
                        </div>
                      ) : t.agent === "catalogue" ? (
                        <>
                          <ul className="ag__why">{(t.data?.problems || []).map((r, i) => <li key={i}>{r}</li>)}</ul>
                          {t.data?.draft && view === "open" && (
                            <label className="ag__draft"><span>Suggested description</span>
                              <textarea rows={4} value={shownText(t)} onChange={(e) => setTexts((x) => ({ ...x, [t.id]: e.target.value }))} maxLength={4000} />
                            </label>
                          )}
                        </>
                      ) : t.kind === "clearout" ? (
                        <>
                          <p className="ag__detail">{t.detail}</p>
                          <div className="ag__sizes">{(t.data?.products || []).map((p) => <span key={p.id} className="low"><b>{p.name}</b><small>{p.stock} in stock</small></span>)}</div>
                          {view === "open" && (
                            <div className="ag__sale">
                              <label><span>Off</span><span className="mo__money"><input type="number" min="5" max="70" value={sale[t.id]?.percent ?? t.data?.percent ?? 20} onChange={(e) => setSale((x) => ({ ...x, [t.id]: { ...x[t.id], percent: e.target.value } }))} /><i>%</i></span></label>
                              <label><span>For</span><span className="mo__money"><input type="number" min="1" max="60" value={sale[t.id]?.days ?? t.data?.days ?? 14} onChange={(e) => setSale((x) => ({ ...x, [t.id]: { ...x[t.id], days: e.target.value } }))} /><i>days</i></span></label>
                            </div>
                          )}
                        </>
                      ) : t.kind === "fit_note" ? (
                        <>
                          <p className="ag__detail">{t.detail}</p>
                          {t.data?.quotes && <p className="ag__quote">“{t.data.quotes}”</p>}
                          {view === "open" ? (
                            <label className="ag__draft"><span>Fit tip shown above the sizes</span>
                              <textarea rows={2} value={texts[t.id] ?? t.data?.note ?? ""} onChange={(e) => setTexts((x) => ({ ...x, [t.id]: e.target.value }))} maxLength={200} />
                            </label>
                          ) : <p className="ag__quote">Tip: {t.data?.note}</p>}
                        </>
                      ) : t.detail && <p className="ag__detail">{t.detail}</p>}

                      {view === "open" ? (
                        <div className="ag__act">
                          <input className="input" placeholder="Note (optional)" value={notes[t.id] || ""} onChange={(e) => setNotes((n) => ({ ...n, [t.id]: e.target.value }))} maxLength={300} />
                          {t.ref && t.agent !== "writer" && <Link href={t.ref.href} className="btn btn--ghost btn--sm">{t.ref.label}</Link>}
                          <button type="button" className="btn btn--ghost btn--sm" onClick={() => decide(t, false)} disabled={busy === `task-${t.id}`}>Dismiss</button>
                          {t.agent === "triage" && t.data?.type !== "complaint" ? (
                            <>
                              <button type="button" className={`btn btn--sm ${t.data?.verdict === "decline" ? "" : "btn--ghost"}`} onClick={() => decide(t, true, { decision: "decline", message: textOf(t, "decline") })} disabled={busy === `task-${t.id}`}>Decline request</button>
                              <button type="button" className={`btn btn--sm ${t.data?.verdict === "decline" ? "btn--ghost" : ""}`} onClick={() => decide(t, true, { decision: "approve", message: textOf(t, "approve") })} disabled={busy === `task-${t.id}`}><AdminIcon name="check" />Approve request</button>
                            </>
                          ) : t.kind === "clearout" ? (
                            <button type="button" className="btn btn--sm" onClick={() => decide(t, true, { percent: Number(sale[t.id]?.percent ?? t.data?.percent ?? 20), days: Number(sale[t.id]?.days ?? t.data?.days ?? 14) })} disabled={busy === `task-${t.id}`}><AdminIcon name="percent" />Start the sale</button>
                          ) : t.kind === "showcase_clean" ? (
                            <button type="button" className="btn btn--sm" onClick={() => decide(t, true)} disabled={busy === `task-${t.id}`}><AdminIcon name="check" />Remove them</button>
                          ) : t.kind === "fit_note" ? (
                            <button type="button" className="btn btn--sm" onClick={() => decide(t, true, { message: texts[t.id] ?? t.data?.note })} disabled={busy === `task-${t.id}`}><AdminIcon name="check" />Publish fit tip</button>
                          ) : t.agent === "catalogue" && t.data?.draft ? (
                            <button type="button" className="btn btn--sm" onClick={() => decide(t, true, { description: textOf(t) })} disabled={busy === `task-${t.id}`}><AdminIcon name="check" />Save description</button>
                          ) : (
                            <button type="button" className="btn btn--sm" onClick={() => decide(t, true)} disabled={busy === `task-${t.id}`}><AdminIcon name="check" />{t.agent === "triage" ? "Handled" : a.approve}</button>
                          )}
                        </div>
                      ) : (
                        <p className="ag__decided">{view === "done" ? "Done" : "Dismissed"} · {t.decided}{t.note ? ` · “${t.note}”` : ""}</p>
                      )}
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </ul>
          ) : (
            <div className="card ag__empty">
              <span><AdminIcon name="check" /></span>
              <b>{view === "open" ? "Nothing waiting for you" : "Nothing here yet"}</b>
              <p>{view === "open" ? "The agents will put anything that needs a decision here. Press “Run all now” to check straight away." : "Handled suggestions appear here."}</p>
            </div>
          )}
        </div>

        <div>
          <div className="card ag__brief">
            <div className="card__head">
              <h2>Today's briefing</h2>
              <span className="dim" style={{ fontSize: 12 }}>{briefing.live.day}</span>
            </div>
            <p className="ag__yday"><span>Yesterday</span>{briefing.live.yesterday}</p>
            <span className="sc__label">Today</span>
            {briefing.live.todo.length ? <ul className="ag__list">{briefing.live.todo.map((x) => <li key={x}>{x}</li>)}</ul> : <p className="dim">Nothing is waiting on you.</p>}
            {briefing.live.watch.length > 0 && (
              <>
                <span className="sc__label">Agents suggest</span>
                <ul className="ag__list ag__list--watch">{briefing.live.watch.map((x) => <li key={x}>{x}</li>)}</ul>
              </>
            )}
            <p className="sub" style={{ margin: "12px 0 0" }}>
              {briefing.sent ? `Last written ${briefing.sent.when}${cfg.briefing_email ? " and emailed to you" : ""}.` : "It is written each morning from the hour you choose."} This box always shows the latest picture.
            </p>
          </div>

          <div className="card">
            <h2>What they did</h2>
            {runs.length ? (
              <ul className="ag__runs">
                {runs.map((r, i) => (
                  <li key={i}>
                    <span className={`ag__dot ${r.ok ? "ok" : "bad"}`} />
                    <span><b>{AGENTS[r.agent]?.name || r.agent}</b> <small>{r.when} · {r.trigger === "manual" ? "run by hand" : r.trigger === "event" ? "on a new order" : "on schedule"}</small><br />{r.summary}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="dim" style={{ marginTop: 8 }}>No runs yet.</p>}
          </div>
        </div>
      </div>
    </>
  );
}
