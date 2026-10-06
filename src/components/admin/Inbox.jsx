"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { inboxReplyAction, assistantTestAction } from "@/lib/admin-actions";
import AdminIcon from "./icons";

const WHO = { customer: "Customer", bot: "Assistant", staff: "Staff" };

const time = (d, timeZone) => new Date(d).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone });

/** The messages of one chat. Re-reads the page every few seconds so new messages appear by themselves. */
export function ChatThread({ messages, timeZone }) {
  const router = useRouter();
  const box = useRef(null);

  useEffect(() => {
    const timer = setInterval(() => { if (!document.hidden) router.refresh(); }, 8000);
    return () => clearInterval(timer);
  }, [router]);
  useEffect(() => { box.current?.scrollTo({ top: box.current.scrollHeight }); }, [messages.length]);

  return (
    <div className="thread" ref={box}>
      {messages.map((m) =>
        m.sender === "system" ? (
          <p key={m.id} className="thread__note">{m.body} · {time(m.at, timeZone)}</p>
        ) : (
          <div key={m.id} className={`bubble bubble--${m.sender}`}>
            <span className="bubble__who">
              {m.sender === "staff" ? m.admin || "Staff" : WHO[m.sender]} · {time(m.at, timeZone)}
              {m.miss && <b> · not answered</b>}{m.failed && <b> · not delivered</b>}
            </span>
            <p>{m.body}</p>
            {m.products.length > 1 && <small>Shown: {m.products.map((p) => p.name).join(", ")}</small>}
          </div>
        )
      )}
      {!messages.length && <p className="empty">No messages yet.</p>}
    </div>
  );
}

/** Reply box with the saved answers one click away. Enter sends, Shift+Enter makes a new line. */
export function ReplyBox({ id, saved, disabled, hint }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(inboxReplyAction, null);
  const [text, setText] = useState("");
  const form = useRef(null);

  useEffect(() => {
    if (state?.ok) { setText(""); router.refresh(); }
  }, [state, router]);

  return (
    <form className="reply" action={action} ref={form}>
      <input type="hidden" name="id" value={id} />
      {state?.error && <p className="reply__error" role="alert">{state.error}</p>}
      <textarea
        name="text" rows={2} value={text} disabled={disabled} maxLength={2000}
        placeholder={disabled ? hint : "Write a reply. The assistant stays quiet once you answer."}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (text.trim()) form.current.requestSubmit(); } }}
      />
      <div className="reply__bar">
        {saved.length > 0 && (
          <select aria-label="Insert a saved answer" value="" disabled={disabled} onChange={(e) => { const a = saved.find((s) => String(s.id) === e.target.value); if (a) setText(a.answer); }}>
            <option value="">Insert a saved answer…</option>
            {saved.map((s) => <option key={s.id} value={s.id}>{s.question}</option>)}
          </select>
        )}
        <button className="btn" disabled={disabled || pending || !text.trim()}><AdminIcon name="send" /><span>{pending ? "Sending…" : "Send"}</span></button>
      </div>
    </form>
  );
}

const SAMPLES = ["Is the hoodie available in medium?", "Something black under 5000", "Where is my order?", "How much is delivery?", "I want to talk to a person"];

/** Try the assistant exactly as a customer would meet it. Nothing typed here is saved. */
export function AssistantTest({ name, brain }) {
  const [channel, setChannel] = useState("web");
  const [log, setLog] = useState([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const state = useRef({ context: {}, misses: 0 });
  const box = useRef(null);

  useEffect(() => { box.current?.scrollTo({ top: box.current.scrollHeight }); }, [log, busy]);

  const ask = async (value) => {
    const body = String(value ?? text).trim();
    if (!body || busy) return;
    setText("");
    setBusy(true);
    const history = log.filter((m) => m.sender !== "note").map(({ sender, body: b }) => ({ sender, body: b }));
    setLog((l) => [...l, { sender: "customer", body }]);
    try {
      const res = await assistantTestAction({ text: body, channel, state: { ...state.current, history } });
      state.current = res.handoff ? { context: {}, misses: 0 } : res.state;
      setLog((l) => [
        ...l,
        { sender: "bot", body: res.text, products: res.products, via: res.via, miss: res.miss },
        ...(res.handoff ? [{ sender: "note", body: `Handed to staff: ${res.handoff}. In a real chat the assistant now stays quiet and the inbox alerts your team.` }] : []),
      ]);
    } catch {
      setLog((l) => [...l, { sender: "note", body: "The test could not run. Reload the page and try again." }]);
    }
    setBusy(false);
  };

  return (
    <div className="tester">
      <div className="tester__top">
        <div className="seg" role="tablist" aria-label="Channel">
          {[["web", "Website chat"], ["whatsapp", "WhatsApp"]].map(([key, label]) => (
            <button key={key} type="button" role="tab" aria-selected={channel === key} className={channel === key ? "active" : ""} onClick={() => setChannel(key)}>{label}</button>
          ))}
        </div>
        {log.length > 0 && <button type="button" className="link" onClick={() => { setLog([]); state.current = { context: {}, misses: 0 }; }}>Start over</button>}
      </div>
      <div className="thread thread--test" ref={box}>
        {!log.length && (
          <div className="tester__empty">
            <p>Ask what a customer would ask. Answers use your real stock and settings ({brain}).</p>
            {SAMPLES.map((s) => <button key={s} type="button" onClick={() => ask(s)}>{s}</button>)}
          </div>
        )}
        {log.map((m, i) =>
          m.sender === "note" ? <p key={i} className="thread__note thread__note--warn">{m.body}</p> : (
            <div key={i} className={`bubble bubble--${m.sender}`}>
              <span className="bubble__who">{m.sender === "bot" ? `${name}${m.via === "ai" ? " · AI model" : " · built-in"}${m.miss ? " · could not answer" : ""}` : "You, as a customer"}</span>
              <p>{m.body}</p>
              {m.products?.length > 0 && <small>Product cards shown: {m.products.map((p) => `${p.name} (${p.note})`).join("; ")}</small>}
            </div>
          )
        )}
        {busy && <p className="thread__note">Thinking…</p>}
      </div>
      <form className="reply" onSubmit={(e) => { e.preventDefault(); ask(); }}>
        <div className="reply__bar">
          <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a customer's question…" maxLength={600} aria-label="Test question" />
          <button className="btn" disabled={busy || !text.trim()}>Ask</button>
        </div>
      </form>
    </div>
  );
}
