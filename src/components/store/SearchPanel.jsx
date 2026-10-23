"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { searchAction } from "@/lib/store-actions";
import ProductCard from "./ProductCard";
import { useStore } from "./Shell";
import { Icon } from "./icons";

const EASE = [0.16, 1, 0.3, 1];
const RECENT_KEY = "tba_searches";
const SUGGEST = 5; // rows in the quick list (arrow keys move through them)

/** The typed words in bold inside a product name. */
function Mark({ text, q }) {
  const ws = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!ws.length) return text;
  const re = new RegExp(`(${ws.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "ig");
  return text.split(re).map((part, i) => (ws.some((w) => part.toLowerCase() === w) ? <mark key={i}>{part}</mark> : part));
}

const readRecent = () => { try { return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"); } catch { return []; } };

/**
 * Full-screen search. Before typing: recent searches, popular picks, the collections and what is trending.
 * While typing (results arrive as you type): a quick list you can move through with the arrow keys, matching
 * collections, product cards and "see all"; typos are corrected from the shop's own words ("jaket" -> jacket).
 * Opens from the header, or with "/" or Ctrl+K anywhere; Esc closes.
 */
export default function SearchPanel({ categories, close }) {
  const router = useRouter();
  const { fmt } = useStore();
  const [q, setQ] = useState("");
  const [res, setRes] = useState(null);
  const [trending, setTrending] = useState(null);
  const [loading, setLoading] = useState(false);
  const [at, setAt] = useState(-1);
  const [recent, setRecent] = useState([]);
  const input = useRef(null);
  const text = q.trim();

  useEffect(() => {
    setRecent(readRecent());
    searchAction("").then(setTrending).catch(() => {});
    // focus after the panel has slid in (focusing at once can make phones jump)
    const t = setTimeout(() => input.current?.focus(), 60);
    return () => clearTimeout(t);
  }, []);

  // results follow the typing, a beat behind it
  useEffect(() => {
    if (!text) { setRes(null); setLoading(false); return; }
    let live = true;
    setLoading(true);
    const t = setTimeout(() => {
      searchAction(text).then((r) => { if (live) { setRes(r); setAt(-1); } }).catch(() => {}).finally(() => live && setLoading(false));
    }, 180);
    return () => { live = false; clearTimeout(t); };
  }, [text]);

  const remember = (term) => {
    const t = term.trim();
    if (!t) return;
    const next = [t, ...readRecent().filter((x) => x.toLowerCase() !== t.toLowerCase())].slice(0, 6);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch {}
    setRecent(next);
  };
  const forget = (term) => {
    const next = term ? readRecent().filter((x) => x !== term) : [];
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch {}
    setRecent(next);
  };
  const go = (href, term = text) => {
    remember(term);
    window.dispatchEvent(new CustomEvent("tba:navigate", { detail: href })); // loading outline (NavLoading)
    router.push(href);
    close();
  };
  const seeAll = () => go(`/products?q=${encodeURIComponent(res?.corrected || text)}`);

  const quick = res?.items.slice(0, SUGGEST) || [];
  const onKey = (e) => {
    if (e.key === "ArrowDown" && quick.length) { e.preventDefault(); setAt((i) => (i + 1) % quick.length); }
    else if (e.key === "ArrowUp" && quick.length) { e.preventDefault(); setAt((i) => (i <= 0 ? quick.length - 1 : i - 1)); }
    else if (e.key === "Enter" && text) {
      e.preventDefault();
      if (at >= 0 && quick[at]) go(`/products/${quick[at].slug}`);
      else if (res?.total) seeAll();
    }
  };

  const popular = [
    ...categories.filter((c) => c.count > 0).map((c) => [c.name, `/products?category=${c.slug}`]),
    ["Sale", "/products?sale=1"],
    ["New in", "/products"],
  ];

  const empty = res && res.total === 0;

  return (
    <motion.div
      className="srch" role="dialog" aria-modal="true" aria-label="Search the shop" data-lenis-prevent
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.2 } }} transition={{ duration: 0.25 }}
    >
      <motion.div className="srch__top" initial={{ y: -40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.45, ease: EASE }}>
        <div className="wrap srch__bar">
          <Icon name="search" />
          <input
            ref={input} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey}
            placeholder="Search jackets, black, merino…" aria-label="Search the shop" enterKeyHint="search" autoComplete="off" spellCheck={false}
            role="combobox" aria-expanded={quick.length > 0} aria-controls="srch-quick" aria-activedescendant={at >= 0 ? `srch-q-${at}` : undefined}
          />
          <AnimatePresence>
            {q && (
              <motion.button type="button" className="srch__clear" onClick={() => { setQ(""); input.current?.focus(); }} initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.6, opacity: 0 }}>
                Clear
              </motion.button>
            )}
          </AnimatePresence>
          <kbd className="srch__esc">Esc</kbd>
          <button type="button" className="icon-btn" aria-label="Close search" onClick={close}><Icon name="close" /></button>
        </div>
        <span className={`srch__loading ${loading ? "is-on" : ""}`} aria-hidden />
      </motion.div>

      <div className="wrap srch__body">
        <AnimatePresence mode="wait" initial={false}>
          {!text ? (
            /* before typing */
            <motion.div key="start" className="srch__start" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.35, ease: EASE }}>
              {recent.length > 0 && (
                <section className="srch__block">
                  <header><span className="eyebrow">Recent searches</span><button type="button" className="srch__link" onClick={() => forget()}>Clear</button></header>
                  <div className="srch__chips">
                    {recent.map((r) => (
                      <span key={r} className="srch__chip srch__chip--recent">
                        <button type="button" onClick={() => setQ(r)}><Icon name="clock" /> {r}</button>
                        <button type="button" aria-label={`Remove ${r}`} onClick={() => forget(r)}><Icon name="close" /></button>
                      </span>
                    ))}
                  </div>
                </section>
              )}

              <section className="srch__block">
                <header><span className="eyebrow">Popular</span></header>
                <div className="srch__chips">
                  {popular.map(([label, href]) => (
                    <Link key={label} href={href} className={`srch__chip ${label === "Sale" ? "is-sale" : ""}`} onClick={close}>{label}</Link>
                  ))}
                </div>
              </section>

              {categories.some((c) => c.image) && (
                <section className="srch__block">
                  <header><span className="eyebrow">Collections</span></header>
                  <div className="srch__worlds">
                    {categories.filter((c) => c.count > 0).map((c, i) => (
                      <motion.div key={c.id} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.05 * i, ease: EASE }}>
                        <Link href={`/products?category=${c.slug}`} className="srch__world" onClick={close}>
                          {c.image && <img src={c.image} alt="" loading="lazy" decoding="async" />}
                          <span><b>{c.name}</b><small>{c.count} {c.count === 1 ? "piece" : "pieces"}</small></span>
                          <Icon name="arrow" />
                        </Link>
                      </motion.div>
                    ))}
                  </div>
                </section>
              )}

              {trending?.items.length > 0 && (
                <section className="srch__block">
                  <header><span className="eyebrow">Trending now</span><Link href="/products" className="srch__link" onClick={close}>Shop all {trending.total}</Link></header>
                  <div className="srch__cards">{trending.items.slice(0, 4).map((p) => <ProductCard key={p.id} p={p} reveal={false} />)}</div>
                </section>
              )}
            </motion.div>
          ) : !res ? (
            <motion.div key="wait" className="srch__wait" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {[0, 1, 2].map((i) => <span key={i} className="srch__ghost" />)}
            </motion.div>
          ) : empty ? (
            /* nothing found */
            <motion.div key="none" className="srch__none" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.35, ease: EASE }}>
              <h2 className="display">Nothing for “{text}”</h2>
              <p>Try a simpler word (jacket, tee, black), or browse a collection.</p>
              <div className="srch__chips">
                {popular.map(([label, href]) => <Link key={label} href={href} className="srch__chip" onClick={close}>{label}</Link>)}
              </div>
              {trending?.items.length > 0 && (
                <section className="srch__block">
                  <header><span className="eyebrow">You might like</span></header>
                  <div className="srch__cards">{trending.items.slice(0, 4).map((p) => <ProductCard key={p.id} p={p} reveal={false} />)}</div>
                </section>
              )}
            </motion.div>
          ) : (
            /* results */
            <motion.div key="results" className="srch__results" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
              {res.partial && !res.corrected && (
                <p className="srch__fix">No piece matches every word of “{text}”. Here are the closest.</p>
              )}
              {res.corrected && (
                <p className="srch__fix">No exact match for “{text}”. Showing results for <button type="button" onClick={() => setQ(res.corrected)}>“{res.corrected}”</button>.</p>
              )}
              <aside className="srch__side">
                <header><span className="eyebrow">{res.partial ? "Closest pieces" : `${res.total} ${res.total === 1 ? "match" : "matches"}`}</span></header>
                <ul className="srch__quick" id="srch-quick" role="listbox">
                  {quick.map((p, i) => (
                    <motion.li key={p.id} id={`srch-q-${i}`} role="option" aria-selected={i === at} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3, delay: i * 0.035, ease: EASE }}>
                      <Link href={`/products/${p.slug}`} className={i === at ? "is-on" : ""} onClick={() => remember(text)} onMouseEnter={() => setAt(i)}>
                        {p.images[0] && <img src={p.images[0].thumb} alt="" width="48" height="60" />}
                        <span className="srch__qtext">
                          <b><Mark text={p.name} q={res.corrected || text} /></b>
                          <small>{p.category} · <em className={p.was ? "is-sale" : ""}>{fmt(p.price)}</em>{p.soldOut && " · Sold out"}</small>
                        </span>
                        <Icon name="arrow" />
                      </Link>
                    </motion.li>
                  ))}
                </ul>
                {res.collections.length > 0 && (
                  <div className="srch__in">
                    <span className="eyebrow">In collections</span>
                    <div className="srch__chips">
                      {res.collections.map((c) => <button key={c.slug} type="button" className="srch__chip" onClick={() => go(`/products?category=${c.slug}`)}>{c.name} <small>{c.count}</small></button>)}
                    </div>
                  </div>
                )}
                {!res.partial && (
                  <button type="button" className="btn btn--block srch__all" onClick={seeAll}>
                    See all {res.total} {res.total === 1 ? "result" : "results"} <span aria-hidden>→</span>
                  </button>
                )}
                <p className="srch__tip"><kbd>↑</kbd><kbd>↓</kbd> to move · <kbd>Enter</kbd> to open</p>
              </aside>
              <div className="srch__cards srch__cards--results" onClickCapture={() => remember(text)}>
                {res.items.slice(0, 8).map((p, i) => (
                  <motion.div key={p.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay: i * 0.04, ease: EASE }}>
                    <ProductCard p={p} reveal={false} />
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
