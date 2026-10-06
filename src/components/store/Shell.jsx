"use client";

import { Suspense, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { money, waLink } from "@/lib/format";
import { searchAction } from "@/lib/store-actions";
import ProductCard from "./ProductCard";
import Motion from "./Motion";
import { Icon } from "./icons";
import ChatWidget from "./ChatWidget";

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
  useEffect(() => setPanel(null), [pathname]);
  useEffect(() => {
    document.body.classList.toggle("locked", panel === "cart" || panel === "search");
    const onKey = (e) => e.key === "Escape" && setPanel(null);
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
      /** item: { variantId, productId, slug, name, size, image, price, max } */
      add(item, qty = 1) {
        setCart((list) => {
          const found = list.find((i) => i.variantId === item.variantId);
          const next = Math.min(item.max, (found?.qty || 0) + qty);
          if (found && next === found.qty) toast(`Only ${item.max} available`);
          return found ? list.map((i) => (i === found ? { ...i, ...item, qty: next } : i)) : [...list, { ...item, qty: Math.min(item.max, qty) }];
        });
        setPanel("cart");
      },
      setQty: (variantId, qty) => setCart((list) => list.map((i) => (i.variantId === variantId ? { ...i, qty: Math.max(1, Math.min(i.max || 20, qty)) } : i))),
      remove: (variantId) => setCart((list) => list.filter((i) => i.variantId !== variantId)),
      clear: () => setCart([]),
      toggleWish: (id) => setWish((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id])),
      markViewed: (id) => setViewed((list) => (list[0] === id ? list : [id, ...list.filter((x) => x !== id)].slice(0, 12))),
      openCart: () => setPanel("cart"),
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
              <Link key={href} href={href} className={(href === "/" ? pathname === "/" : pathname.startsWith(href)) ? "active" : ""}>{label}</Link>
            ))}
            <button className="theme-toggle theme-toggle--menu" aria-label="Switch light / dark theme" onClick={toggleTheme}>{themeIcons}</button>
          </div>
          <div className="nav__right">
            <button className="icon-btn" aria-label="Search" onClick={() => setPanel("search")}><Icon name="search" /></button>
            <button className="icon-btn" aria-label={`Open bag, ${api.count} items`} onClick={() => setPanel("cart")}>
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

      <div className={`scrim ${panel === "cart" ? "open" : ""}`} onClick={() => setPanel(null)} />
      <CartDrawer open={panel === "cart"} close={() => setPanel(null)} />
      <AnimatePresence>
        {panel === "search" && <Search categories={categories} close={() => setPanel(null)} />}
      </AnimatePresence>

      {store.chat ? (
        <ChatWidget assistant={store.chat} storeName={store.name} whatsapp={store.whatsapp} />
      ) : store.whatsapp && (
        <a className="wa-float" href={waLink(store.whatsapp)} target="_blank" rel="noopener noreferrer" aria-label="Chat with us on WhatsApp"><Icon name="whatsapp" /></a>
      )}
      <div className={`toast ${toastMsg ? "show" : ""}`} role="status" aria-live="polite">{toastMsg}</div>
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

function CartDrawer({ open, close }) {
  const { cart, fmt, subtotal, setQty, remove, store } = useStore();
  const freeOver = Number(store.shipping.free_over) || 0;
  const left = freeOver - subtotal;

  return (
    <aside className={`drawer ${open ? "open" : ""}`} aria-label="Shopping bag" aria-hidden={!open}>
      <div className="drawer__head">
        <h2>Your bag</h2>
        <button className="icon-btn" aria-label="Close bag" onClick={close}><Icon name="close" /></button>
      </div>
      {cart.length > 0 && freeOver > 0 && (
        <div className="ship-bar">
          {left > 0 ? <>Add {fmt(left)} more for free delivery</> : <>You have free delivery ✓</>}
          <i><b style={{ width: `${Math.min(100, (subtotal / freeOver) * 100)}%` }} /></i>
        </div>
      )}
      {cart.length === 0 ? (
        <div className="drawer__items">
          <div className="drawer__empty">
            <p>Your bag is empty.</p>
            <Link href="/products" className="btn btn--ghost" style={{ marginTop: 16 }}>Start shopping</Link>
          </div>
        </div>
      ) : (
        <>
          <div className="drawer__items" data-lenis-prevent>
            <AnimatePresence initial={false}>
              {cart.map((i) => (
                <motion.div
                  className="item" key={i.variantId} layout
                  initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 40 }}
                  transition={{ type: "spring", stiffness: 380, damping: 34 }}
                >
                  <Link href={`/products/${i.slug}`}><img src={i.image} alt="" width="72" height="90" /></Link>
                  <div>
                    <h4><Link href={`/products/${i.slug}`}>{i.name}</Link></h4>
                    <small>Size {i.size}</small>
                    <div className="qty">
                      <button aria-label="Decrease quantity" onClick={() => setQty(i.variantId, i.qty - 1)}>−</button>
                      <span>{i.qty}</span>
                      <button aria-label="Increase quantity" onClick={() => setQty(i.variantId, i.qty + 1)}>+</button>
                    </div>
                  </div>
                  <div className="item__side">
                    <span>{fmt(i.price * i.qty)}</span>
                    <button className="item__rm" onClick={() => remove(i.variantId)}>Remove</button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
          <div className="drawer__foot">
            <div className="row"><span className="eyebrow">Subtotal</span><b>{fmt(subtotal)}</b></div>
            <Link href="/checkout" className="btn btn--block">Checkout <span aria-hidden>→</span></Link>
            <span className="fine center">Cash on delivery · Delivery calculated at checkout</span>
          </div>
        </>
      )}
    </aside>
  );
}

function Search({ categories, close }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState(null);

  useEffect(() => {
    let live = true;
    const t = setTimeout(async () => {
      const list = await searchAction(q);
      if (live) setResults(list);
    }, q ? 220 : 0);
    return () => { live = false; clearTimeout(t); };
  }, [q]);

  return (
    <motion.div
      className="search" role="dialog" aria-modal="true" aria-label="Search products" data-lenis-prevent
      initial={{ opacity: 0, y: -24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -24 }} transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="wrap">
        <div className="search__bar">
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products…" aria-label="Search products" />
          <button className="icon-btn" aria-label="Close search" onClick={close}><Icon name="close" /></button>
        </div>
        <div className="chips">
          {categories.map((c) => <Link key={c.id} className="chip" href={`/products?category=${c.slug}`}>{c.name}</Link>)}
          <Link className="chip chip--sale" href="/products?sale=1">Sale</Link>
        </div>
        {results && results.length === 0 && <p className="muted">No products match “{q}”. Try a different word.</p>}
        <div className="search__results">
          {results?.map((p) => <ProductCard key={p.id} p={p} />)}
        </div>
      </div>
    </motion.div>
  );
}
