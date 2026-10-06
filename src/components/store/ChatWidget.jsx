"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { money, waLink } from "@/lib/format";
import { chatSendAction, chatReadAction } from "@/lib/store-actions";
import { Icon } from "./icons";

const KEY = "tba_chat";
const QUICK = ["Track my order", "Delivery and returns", "What's new?", "Talk to a person"];

/** Turns the links inside a message into real links; everything else stays plain text. */
function Text({ body }) {
  return body.split(/(https?:\/\/[^\s]+)/g).map((part, i) =>
    /^https?:\/\//.test(part) ? <a key={i} href={part} target="_blank" rel="noopener noreferrer">{part.replace(/^https?:\/\/(www\.)?/, "").replace(/^(.{44}).+$/, "$1…")}</a> : part
  );
}

/** The shop's chat: the assistant answers from live stock and orders, and staff can join the same thread. */
export default function ChatWidget({ assistant, storeName, whatsapp }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [status, setStatus] = useState("bot");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fresh, setFresh] = useState(false); // a reply arrived while the panel was closed
  const token = useRef(null);
  const lastId = useRef(0);
  const loaded = useRef(false);
  const scroller = useRef(null);
  const input = useRef(null);

  const merge = useCallback((incoming) => {
    if (!incoming?.length) return;
    lastId.current = Math.max(lastId.current, ...incoming.map((m) => m.id));
    setMessages((list) => {
      const known = new Set(list.map((m) => m.id));
      return [...list.filter((m) => !m.pending), ...incoming.filter((m) => !known.has(m.id))];
    });
  }, []);

  const read = useCallback(async () => {
    if (!token.current) return;
    try {
      const res = await chatReadAction(token.current, lastId.current);
      if (res.gone) { token.current = null; localStorage.removeItem(KEY); return; }
      setStatus(res.status);
      if (res.messages.some((m) => m.sender !== "customer") && lastId.current) setFresh(true);
      merge(res.messages);
    } catch {}
  }, [merge]);

  useEffect(() => {
    try { token.current = localStorage.getItem(KEY); } catch {}
    // someone who chatted before gets their thread back
    if (token.current) { loaded.current = true; read(); }
  }, [read]);

  // keep checking for staff replies: often while the panel is open, slowly while a person is expected, otherwise not at all
  useEffect(() => {
    if (open) {
      setFresh(false);
      input.current?.focus({ preventScroll: true });
    }
    const every = open ? (status === "human" ? 6000 : 25000) : status === "human" ? 20000 : 0;
    if (!every) return;
    const timer = setInterval(() => { if (!document.hidden) read(); }, every);
    return () => clearInterval(timer);
  }, [open, status, read]);

  useEffect(() => {
    if (open) scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [messages, open, busy]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const send = async (value) => {
    const body = String(value ?? text).trim();
    if (!body || busy) return;
    setText("");
    setError("");
    setBusy(true);
    setMessages((list) => [...list, { id: `p${Date.now()}`, sender: "customer", body, products: [], pending: true }]);
    try {
      const res = await chatSendAction({ token: token.current, text: body, page: pathname });
      if (res.error) {
        setError(res.error);
        setMessages((list) => list.filter((m) => !m.pending));
      } else {
        token.current = res.token;
        try { localStorage.setItem(KEY, res.token); } catch {}
        setStatus(res.status);
        merge(res.messages);
      }
    } catch {
      setError("Could not send. Check your connection and try again.");
      setMessages((list) => list.filter((m) => !m.pending));
    }
    setBusy(false);
  };

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.section
            className="chat" role="dialog" aria-label={`Chat with ${storeName}`}
            initial={{ opacity: 0, y: 24, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          >
            <header className="chat__head">
              <span className="chat__avatar" aria-hidden>{assistant.name.charAt(0)}</span>
              <div>
                <b>{assistant.name}</b>
                <small><i className={status === "human" ? "team" : ""} />{status === "human" ? (messages.some((m) => m.sender === "staff") ? "Our team is in this chat" : "Our team has been asked to join") : `${storeName} assistant · answers from live stock`}</small>
              </div>
              <button aria-label="Close chat" onClick={() => setOpen(false)}><Icon name="close" /></button>
            </header>

            <div className="chat__body" ref={scroller} data-lenis-prevent>
              <div className="chat__msg chat__msg--them"><p>{assistant.greeting}</p></div>
              {messages.map((m) => (
                <div key={m.id} className={`chat__msg ${m.sender === "customer" ? "chat__msg--me" : "chat__msg--them"} ${m.pending ? "is-pending" : ""}`}>
                  {m.sender === "staff" && <span className="chat__who">Team</span>}
                  <p><Text body={m.body} /></p>
                  {m.products?.length > 0 && (
                    <div className="chat__products">
                      {m.products.map((p) => (
                        <Link key={p.slug} href={`/products/${p.slug}`} className="chat__product" onClick={() => setOpen(false)}>
                          {p.image && <img src={p.image} alt="" loading="lazy" />}
                          <span>
                            <b>{p.name}</b>
                            <em>{money(p.price)}{p.was && <s>{money(p.was)}</s>}</em>
                            <small>{p.note}</small>
                          </span>
                          <Icon name="arrow" />
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {busy && <div className="chat__msg chat__msg--them chat__typing" aria-label="Typing"><p><i /><i /><i /></p></div>}
              {messages.length === 0 && !busy && (
                <div className="chat__quick">
                  {QUICK.map((q) => <button key={q} onClick={() => send(q)}>{q}</button>)}
                </div>
              )}
            </div>

            {error && <p className="chat__error" role="alert">{error}</p>}
            <form className="chat__form" onSubmit={(e) => { e.preventDefault(); send(); }}>
              <input ref={input} value={text} onChange={(e) => setText(e.target.value)} maxLength={600} placeholder="Ask about a size, an order, delivery…" aria-label="Your message" autoComplete="off" />
              <button aria-label="Send" disabled={busy || !text.trim()}><Icon name="send" /></button>
            </form>
            {whatsapp && (
              <a className="chat__wa" href={waLink(whatsapp)} target="_blank" rel="noopener noreferrer"><Icon name="whatsapp" /> Prefer WhatsApp? Chat with us there</a>
            )}
          </motion.section>
        )}
      </AnimatePresence>

      <button className={`chat-fab ${open ? "is-open" : ""}`} aria-label={open ? "Close chat" : "Chat with us"} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <Icon name={open ? "close" : "chat"} />
        {fresh && !open && <i aria-hidden />}
      </button>
    </>
  );
}
