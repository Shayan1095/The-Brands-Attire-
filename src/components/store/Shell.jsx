"use client";

import { Suspense, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { money, waLink } from "@/lib/format";
import Motion from "./Motion";
import { Icon } from "./icons";
import ChatWidget from "./ChatWidget";
import QuickAdd from "./QuickAdd";
import Bag from "./Bag";
import ToTop from "./ToTop";
import SearchPanel from "./SearchPanel";
import NavLoading from "./NavLoading";
import { spotlight } from "./spotlight";

const CART_KEY = "tba_cart_v2";
const WISH_KEY = "tba_wish";
const VIEWED_KEY = "tba_viewed";
const StoreContext = createContext(null);

/** Cart, wishlist, toast and store settings for any client component in the shop. */
export const useStore = () => useContext(StoreContext);

const NAV = [
  ["/", "Home"],
  ["/products", "Products"],
  ["/lookbook", "Gallery"],
  ["/track", "Track order"],
  ["/contact", "Contact"],
];

export default function Shell({ store, categories, children }) {
  const pathname = usePathname();
  const [cart, setCart] = useState([]);
  const [wish, setWish] = useState([]);
  const [viewed, setViewed] = useState([]); // product ids, most recent first
  const [loaded, setLoaded] = useState(false);
  const [panel, setPanel] = useState(null); // "cart" | "search" | "menu" | null
  const [toastMsg, setToastMsg] = useState("");
  const [adding, setAdding] = useState(null); // { p, img } for the phone quick-add sheet
  const toastTimer = useRef();

  useEffect(() => {
    try {
      setCart(JSON.parse(localStorage.getItem(CART_KEY) || "[]"));
      setWish(JSON.parse(localStorage.getItem(WISH_KEY) || "[]"));
      // a product page may have recorded its view before this ran: keep that entry in front
      const stored = JSON.parse(localStorage.getItem(VIEWED_KEY) || "[]");
      setViewed((now) => [...new Set([...now, ...stored])].slice(0, 12));
    } catch {}
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (!loaded) return;
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
    localStorage.setItem(WISH_KEY, JSON.stringify(wish));
    localStorage.setItem(VIEWED_KEY, JSON.stringify(viewed));
  }, [cart, wish, viewed, loaded]);
  useEffect(() => { setPanel(null); setAdding(null); }, [pathname]);
  // opened from Admin -> Showcase ("Show me on the shop"): point out the section being edited
  useEffect(() => {
    const key = new URLSearchParams(window.location.search).get("showcase");
    if (!key) return;
    if (key === "bag") setPanel("cart");
    return spotlight(key);
  }, [pathname]);
  useEffect(() => {
    document.body.classList.toggle("locked", panel === "search"); // the bag (a vaul sheet) locks scrolling itself
    const onKey = (e) => {
      if (e.key === "Escape") return setPanel(null);
      // "/" or Ctrl+K / Cmd+K opens search from anywhere (not while typing in a field)
      const typing = e.target.closest?.("input, textarea, select, [contenteditable=true]");
      if ((e.key === "/" && !typing) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k")) { e.preventDefault(); setPanel("search"); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panel]);

  const toast = useCallback((msg) => {
    setToastMsg(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(""), 2600);
  }, []);

  const api = useMemo(() => {
    const fmt = (n) => money(n, store.currency);
    return {
      store, fmt, cart, wish, viewed, loaded, toast,
      count: cart.reduce((s, i) => s + i.qty, 0),
      subtotal: cart.reduce((s, i) => s + i.price * i.qty, 0),
      /** item: { variantId, productId, slug, name, size, image, price, max }. `open: false` leaves the bag closed (the caller opens it after its own animation). */
      add(item, qty = 1, { open = true } = {}) {
        setCart((list) => {
          const found = list.find((i) => i.variantId === item.variantId);
          const next = Math.min(item.max, (found?.qty || 0) + qty);
          if (found && next === found.qty) toast(`Only ${item.max} available`);
          return found ? list.map((i) => (i === found ? { ...i, ...item, qty: next } : i)) : [...list, { ...item, qty: Math.min(item.max, qty) }];
        });
        if (open) setPanel("cart");
      },
      setQty: (variantId, qty) => setCart((list) => list.map((i) => (i.variantId === variantId ? { ...i, qty: Math.max(1, Math.min(i.max || 20, qty)) } : i))),
      remove: (variantId) => setCart((list) => list.filter((i) => i.variantId !== variantId)),
      clear: () => setCart([]),
      toggleWish: (id) => setWish((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id])),
      markViewed: (id) => setViewed((list) => (list[0] === id ? list : [id, ...list.filter((x) => x !== id)].slice(0, 12))),
      openCart: () => setPanel("cart"),
      /** Phones: open the size sheet for a card. `img` is the card photo the fly-to-bag starts from. */
      quickAdd: (p, img) => setAdding({ p, img }),
    };
  }, [store, cart, wish, viewed, loaded, toast]);

  const words = store.name.toUpperCase().split(" ");
  const brandMark = words.length > 1 ? <>{words.slice(0, -1).join(" ")}<b>/</b>{words.at(-1)}</> : words[0];
  const themeIcons = <><Icon name="sun" className="theme-sun" /><Icon name="moon" className="theme-moon" /></>;

  return (
    <StoreContext.Provider value={api}>
      <MotionConfig reducedMotion="user">
      <Suspense fallback={null}><Motion paused={panel === "cart" || panel === "search"} /></Suspense>

      {store.announcement.enabled && store.announcement.text &&
        (store.announcement.link
          ? <Link className="announce" href={store.announcement.link}>{store.announcement.text}</Link>
          : <div className="announce">{store.announcement.text}</div>)}

      <nav className="nav" aria-label="Main">
        <div className="wrap nav__inner">
          <Link className="brand" href="/">{brandMark}</Link>
          <button className="icon-btn nav__burger" aria-label="Menu" aria-expanded={panel === "menu"} onClick={() => setPanel((p) => (p === "menu" ? null : "menu"))}>
            <Icon name={panel === "menu" ? "close" : "menu"} />
          </button>
          <div className={`nav__links ${panel === "menu" ? "open" : ""}`}>
            {NAV.map(([href, label]) => (
              // prefetch: the whole page is loaded ahead while the menu is on screen (these pages are dynamic,
              // so by default Next.js would fetch nothing until the tap); kept for 5 minutes
              <Link key={href} href={href} prefetch className={(href === "/" ? pathname === "/" : pathname.startsWith(href)) ? "active" : ""} onClick={() => setPanel(null)}>{label}</Link>
            ))}
            <button className="theme-toggle theme-toggle--menu" aria-label="Switch light / dark theme" onClick={toggleTheme}>{themeIcons}</button>
          </div>
          <div className="nav__right">
            <button className="icon-btn" aria-label="Search" onClick={() => setPanel("search")}><Icon name="search" /></button>
            <button id="nav-cart-trigger" className="icon-btn" aria-label={`Open bag, ${api.count} items`} onClick={() => setPanel("cart")}>
              <Icon name="bag" />
              <motion.span key={api.count} className="bag-count" initial={{ scale: 0.4 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 500, damping: 18 }}>
                {api.count}
              </motion.span>
            </button>
            <button className="theme-toggle" aria-label="Switch light / dark theme" onClick={toggleTheme}>{themeIcons}</button>
          </div>
        </div>
        <span className="progress" data-progress aria-hidden />
      </nav>

      <main>{children}</main>

      <footer className="footer">
        <div className="wrap">
          <div className="footer__grid">
            <div data-reveal>
              <div className="footer__brand">{brandMark}</div>
              <p>{store.tagline}</p>
            </div>
            <div data-reveal>
              <h4>Shop</h4>
              <ul>
                <li><Link href="/products">All products</Link></li>
                {categories.map((c) => <li key={c.id}><Link href={`/products?category=${c.slug}`}>{c.name}</Link></li>)}
                <li><Link href="/products?sale=1">Sale</Link></li>
              </ul>
            </div>
            <div data-reveal>
              <h4>Help</h4>
              <ul>
                <li><Link href="/track">Track your order</Link></li>
                <li><Link href="/policies">Shipping &amp; returns</Link></li>
                <li><Link href="/policies#confirmation">Order confirmation policy</Link></li>
                <li><Link href="/contact">Contact us</Link></li>
              </ul>
            </div>
            <div data-reveal>
              <h4>Follow</h4>
              <ul>
                <li><Link href="/lookbook">Lookbook</Link></li>
                {store.instagram && <li><a href={store.instagram} target="_blank" rel="noopener noreferrer">Instagram</a></li>}
                {store.facebook && <li><a href={store.facebook} target="_blank" rel="noopener noreferrer">Facebook</a></li>}
                {store.whatsapp && <li><a href={waLink(store.whatsapp)} target="_blank" rel="noopener noreferrer">WhatsApp</a></li>}
              </ul>
            </div>
          </div>
          <div className="footer__bottom">
            <span>© {new Date().getFullYear()} {store.name}</span>
            <span>Cash on delivery · Secure checkout</span>
          </div>
        </div>
        <div className="footer__mark" aria-hidden><span data-rise>{brandMark}</span></div>
      </footer>

      <Bag open={panel === "cart"} close={() => setPanel(null)} />
      <AnimatePresence>
        {panel === "search" && <SearchPanel categories={categories} close={() => setPanel(null)} />}
      </AnimatePresence>

      {store.chat ? (
        <ChatWidget assistant={store.chat} storeName={store.name} whatsapp={store.whatsapp} />
      ) : store.whatsapp && (
        <a className="wa-float" href={waLink(store.whatsapp)} target="_blank" rel="noopener noreferrer" aria-label="Chat with us on WhatsApp"><Icon name="whatsapp" /></a>
      )}
      <div className={`toast ${toastMsg ? "show" : ""}`} role="status" aria-live="polite">{toastMsg}</div>
      <ToTop />
      <NavLoading />
      <QuickAdd item={adding} close={() => setAdding(null)} add={api.add} fmt={api.fmt} toast={toast} />
      </MotionConfig>
    </StoreContext.Provider>
  );
}

/**
 * Switches light / dark. Every colour changes in one frame (CSS transitions are suspended),
 * and where the browser supports it the new theme is revealed as a circle growing from the button.
 */
function toggleTheme(event) {
  const root = document.documentElement;
  const apply = () => {
    const next = root.dataset.theme === "dark" ? "light" : "dark";
    root.dataset.theme = next;
    try { localStorage.setItem("tba_theme", next); } catch {}
  };
  const done = () => root.classList.remove("theme-switching");
  root.classList.add("theme-switching");

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!document.startViewTransition || reduced) {
    apply();
    requestAnimationFrame(() => requestAnimationFrame(done));
    return;
  }
  const x = event?.clientX ?? window.innerWidth - 40;
  const y = event?.clientY ?? 40;
  const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
  const transition = document.startViewTransition(apply);
  transition.ready.then(() => {
    root.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
      { duration: 650, easing: "cubic-bezier(.16, 1, .3, 1)", pseudoElement: "::view-transition-new(root)" }
    );
  }).catch(() => {});
  transition.finished.finally(done);
}

