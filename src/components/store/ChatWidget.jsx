"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { money, waLink } from "@/lib/format";
import { chatSendAction, chatReadAction, chatNudgeAction } from "@/lib/store-actions";
import { useStore } from "./Shell";
import { Icon } from "./icons";

const KEY = "tba_chat";
const QUICK = ["Track my order", "Delivery and returns", "What's new?", "Talk to a person"];

// the shop's own pages: opened in place (no new tab) with a short label instead of the raw address
const OWN = [
  [/^\/products\/[^/?#]+/, "View product"],
  [/^\/order\//, "Open your order"],
  [/^\/checkout/, "Go to checkout"],
  [/^\/track/, "Track your order"],
  [/^\/account/, "Open your account"],
  [/^\/(returns|updates|feedback)/, "Open the page"],
  [/^\/products/, "See the products"],
];
const ownPage = (url) => {
  try {
    const u = new URL(url);
    const hit = OWN.find(([re]) => re.test(u.pathname));
    return hit ? { path: u.pathname + u.search + u.hash, label: hit[1] } : null;
  } catch { return null; }
};

/**
 * A message with its links made tappable. Links to the shop's own pages become a small button that opens in place;
 * a product link is left out when the product's card is already under the message. Other links open in a new tab.
 */
function Text({ body, cards = [], go }) {
  const shown = cards.length
    ? body.replace(/https?:\/\/\S+/g, (u) => (cards.some((slug) => ownPage(u)?.path.startsWith(`/products/${slug}`)) ? "" : u)).replace(/\n{3,}/g, "\n\n").trim()
    : body;
  return shown.split(/(https?:\/\/[^\s]+)/g).map((part, i) => {
    if (!/^https?:\/\//.test(part)) return part;
    const own = ownPage(part);
    if (own) {
      return <a key={i} href={own.path} className="chat__link" onClick={(e) => { e.preventDefault(); go(own.path); }}>{own.label} <Icon name="arrow" /></a>;
    }
    return <a key={i} href={part} target="_blank" rel="noopener noreferrer">{part.replace(/^https?:\/\/(www\.)?/, "").replace(/^(.{36}).+$/, "$1…")}</a>;
  });
}

/** The shop's chat: the assistant answers from live stock and orders, and staff can join the same thread. */
export default function ChatWidget({ assistant, storeName, whatsapp }) {
  const pathname = usePathname();
  const router = useRouter();
  const { cart } = useStore() || { cart: [] };
  const [open, setOpen] = useState(false);
  const [nudge, setNudge] = useState(null); // a word about the bag, shown when the chat opens (not stored)
  const nudged = useRef(false);
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

  // phones: the panel fills the part of the screen above the keyboard, and the page behind it stays still
  const panel = useRef(null);
  const [keyboard, setKeyboard] = useState(false);
  useEffect(() => {
    if (!open) return;
    const phone = window.matchMedia("(max-width: 520px)").matches;
    if (!phone) return;
    const root = document.documentElement;
    root.classList.add("chat-open");
    const vv = window.visualViewport;
    const fit = () => {
      const el = panel.current;
      if (!el || !vv) return;
      // CSS variables, not transform: the opening animation owns transform
      el.style.setProperty("--vv-h", `${Math.round(vv.height)}px`);
      el.style.setProperty("--vv-top", `${Math.round(vv.offsetTop)}px`);
      setKeyboard(vv.height < window.innerHeight * 0.78);
      scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
    };
    fit();
    vv?.addEventListener("resize", fit);
    vv?.addEventListener("scroll", fit);
    return () => {
      root.classList.remove("chat-open");
      vv?.removeEventListener("resize", fit);
      vv?.removeEventListener("scroll", fit);
    };
  }, [open]);

  // keep checking for staff replies: often while the panel is open, slowly while a person is expected, otherwise not at all
  useEffect(() => {
    if (open) {
      setFresh(false);
      // a phone would throw the keyboard over the conversation the moment it opens: there the customer taps the box
      if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) input.current?.focus({ preventScroll: true });
    }
    const every = open ? (status === "human" ? 6000 : 25000) : status === "human" ? 20000 : 0;
    if (!every) return;
    const timer = setInterval(() => { if (!document.hidden) read(); }, every);
    return () => clearInterval(timer);
  }, [open, status, read]);

  useEffect(() => {
    if (open) scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [messages, open, busy, nudge]);

  useEffect(() => {
    if (!open || nudged.current || messages.length || !cart?.length || pathname.startsWith("/checkout")) return;
    nudged.current = true;
    try { if (sessionStorage.getItem("tba_nudged")) return; sessionStorage.setItem("tba_nudged", "1"); } catch {}
    chatNudgeAction(cart.map(({ variantId, qty }) => ({ variantId, qty }))).then((n) => n && setNudge(n)).catch(() => {});
  }, [open, messages.length, cart, pathname]);

  // a quick reply: a link goes there, anything else is sent as the customer's answer
  const pick = (q) => {
    if (typeof q === "object" && q?.href) { setOpen(false); router.push(q.href); return; }
    setNudge(null);
    send(typeof q === "object" ? q.label : q);
  };

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // a link to one of the shop's pages opens in place and the chat steps aside
  const go = (path) => { setOpen(false); router.push(path); };

  // a message sent while the reply to the previous one is still on its way goes out right after it
  const queued = useRef(null);
  const send = async (value) => {
    const body = String(value ?? text).trim();
    if (!body) return;
    if (busy) {
      queued.current = queued.current ? `${queued.current}\n${body}` : body;
      setText("");
      setMessages((list) => [...list, { id: `q${Date.now()}`, sender: "customer", body, products: [], queued: true }]);
      return;
    }
    setText("");
    setError("");
    setBusy(true);
    setMessages((list) => [...list.filter((m) => !m.queued), { id: `p${Date.now()}`, sender: "customer", body, products: [], pending: true }]);
    try {
      // the private links of orders placed on this device (and the order page being viewed), so the assistant
      // recognises the customer's own orders without asking for the number and phone
      let orders = [];
      try { orders = JSON.parse(localStorage.getItem("tba_orders") || "[]").map((o) => o.token).filter(Boolean); } catch {}
      const viewing = pathname.match(/^\/order\/([A-Za-z0-9_-]+)/)?.[1];
      if (viewing) orders = [viewing, ...orders.filter((x) => x !== viewing)];
      const res = await chatSendAction({ token: token.current, text: body, page: pathname, orders: orders.slice(0, 8) });
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

  // send what was typed during the wait
  useEffect(() => {
    if (busy || !queued.current) return;
    const next = queued.current;
    queued.current = null;
    send(next);
  }, [busy]); // eslint-disable-line react-hooks/exhaustive-deps

  const last = messages[messages.length - 1];

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.section
            ref={panel} className={`chat ${keyboard ? "is-kb" : ""}`} role="dialog" aria-label={`Chat with ${storeName}`}
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
                <div key={m.id} className={`chat__msg ${m.sender === "customer" ? "chat__msg--me" : "chat__msg--them"} ${m.pending || m.queued ? "is-pending" : ""}`}>
                  {m.sender === "staff" && <span className="chat__who">Team</span>}
                  <p><Text body={m.body} cards={m.sender === "customer" ? [] : (m.products || []).map((p) => p.slug)} go={go} /></p>
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
              {nudge && messages.length === 0 && (
                <div className="chat__msg chat__msg--them"><p>{nudge.text}</p></div>
              )}
              {busy && <div className="chat__msg chat__msg--them chat__typing" aria-label="Typing"><p><i /><i /><i /></p></div>}
              {messages.length === 0 && !busy && (
                <div className="chat__quick">
                  {(nudge?.quick || QUICK).map((q) => <button key={typeof q === "object" ? q.label : q} onClick={() => pick(q)}>{typeof q === "object" ? q.label : q}</button>)}
                </div>
              )}
              {!busy && last?.sender === "bot" && last.quick?.length > 0 && (
                <div className="chat__quick" role="group" aria-label="Quick replies">
                  {last.quick.map((q) => <button key={typeof q === "object" ? q.label : q} onClick={() => pick(q)}>{typeof q === "object" ? q.label : q}</button>)}
                </div>
              )}
            </div>

            {error && <p className="chat__error" role="alert">{error}</p>}
            <form className="chat__form" onSubmit={(e) => { e.preventDefault(); send(); }}>
              <input ref={input} value={text} onChange={(e) => setText(e.target.value)} maxLength={600} placeholder="Ask about sizes, orders, delivery…" aria-label="Your message" autoComplete="off" />
              <button aria-label="Send" disabled={!text.trim()}><Icon name="send" /></button>
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
