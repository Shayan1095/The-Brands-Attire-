"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { logoutAction, adminSearchAction } from "@/lib/admin-actions";
import { can } from "@/lib/format";
import AdminIcon from "./icons";

// [href, label, icon, permission needed (null = everyone), badge key]
const GROUPS = [
  { items: [["/admin", "Dashboard", "home", null], ["/admin/orders", "Orders", "orders", "orders", "orders"], ["/admin/returns", "Returns", "refresh", "returns", "returns"], ["/admin/inbox", "Inbox", "inbox", "support", "chats"], ["/admin/agents", "Agents", "agent", "agents", "agents"]] },
  { label: "Catalogue", items: [["/admin/products", "Products", "box", "products"], ["/admin/inventory", "Inventory", "layers", "inventory"], ["/admin/categories", "Categories", "folder", "products"], ["/admin/offers", "Offers & sales", "percent", "offers"]] },
  { label: "Marketing", items: [["/admin/customers", "Customers", "users", "customers"], ["/admin/campaigns", "Campaigns", "megaphone", "marketing"], ["/admin/assistant", "Assistant", "spark", "support"], ["/admin/automations", "Automations", "zap", "marketing"], ["/admin/messages", "Messages", "message", "marketing", "messages"]] },
  { label: "Store", items: [["/admin/showcase", "Showcase", "layout", "banners"], ["/admin/banners", "Banners", "image", "banners"], ["/admin/staff", "Staff", "users", "staff"], ["/admin/settings", "Settings", "settings", "settings"]] },
];
// the phone tab bar: the first four of these this person may open, then "Menu"
const TABS = ["/admin", "/admin/orders", "/admin/inbox", "/admin/products", "/admin/messages", "/admin/inventory"];
const ACTIONS = [
  { href: "/admin/orders/new", label: "Create an order (WhatsApp, call, walk-in)", icon: "plus", perm: "orders" },
  { href: "/admin/products/new", label: "Add a product", icon: "plus", perm: "products" },
  { href: "/admin/inventory/insights", label: "Restock suggestions", icon: "layers", perm: "inventory" },
  { href: "/admin/offers", label: "Start a sale", icon: "percent", perm: "offers" },
  { href: "/admin/campaigns", label: "Send a campaign", icon: "megaphone", perm: "marketing" },
  { href: "/admin/assistant#answers", label: "Teach the assistant an answer", icon: "spark", perm: "support" },
  { href: "/admin/orders?status=confirmed", label: "Orders ready to pack", icon: "truck", perm: "orders" },
];

const remember = (key, value) => { try { localStorage.setItem(key, value); } catch {} };

/**
 * Sidebar, top bar, alerts and quick search around every admin page. Only shows what this person may use.
 * Also: a red loading line while a page opens, a marker that slides to the open page, a slim (icons only)
 * sidebar and dark mode (both remembered on this device and applied before paint by the script in
 * admin/layout.js), and a tab bar on phones.
 */
export default function Shell({ admin, counts, alerts, children }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const [menu, setMenu] = useState(false);
  const [palette, setPalette] = useState(false);
  const [bell, setBell] = useState(false);
  const [slim, setSlim] = useState(false);
  const [dark, setDark] = useState(false);
  const bellRef = useRef(null);
  const navRef = useRef(null);
  const markRef = useRef(null);
  const loadRef = useRef(null);
  const tipRef = useRef(null);

  const groups = useMemo(
    () => GROUPS.map((g) => ({ ...g, items: g.items.filter(([, , , perm]) => !perm || can(admin, perm)) })).filter((g) => g.items.length),
    [admin]
  );
  const pages = groups.flatMap((g) => g.items.map(([href, label, icon, , countKey]) => ({ href, label, icon, countKey, group: g.label || "Overview" })));
  const actions = ACTIONS.filter((a) => can(admin, a.perm));
  const tabs = TABS.map((href) => pages.find((p) => p.href === href)).filter(Boolean).slice(0, 4);

  // ---- loading line: starts on any click that opens another admin page, completes once it has arrived
  const startLoad = useCallback(() => {
    const el = loadRef.current;
    if (!el) return;
    el.getAnimations().forEach((a) => a.cancel());
    el.dataset.on = "1";
    el.animate(
      [{ transform: "scaleX(0)", opacity: 1 }, { transform: "scaleX(.35)", opacity: 1, offset: 0.12 }, { transform: "scaleX(.9)", opacity: 1 }],
      { duration: 9000, easing: "cubic-bezier(.08, .6, .2, 1)", fill: "forwards" }
    );
  }, []);
  const url = `${pathname}?${search}`;
  useEffect(() => {
    const el = loadRef.current;
    if (!el?.dataset.on) return;
    delete el.dataset.on;
    const now = getComputedStyle(el).transform;
    el.getAnimations().forEach((a) => a.cancel());
    el.animate(
      [{ transform: now, opacity: 1 }, { transform: "scaleX(1)", opacity: 1, offset: 0.55 }, { transform: "scaleX(1)", opacity: 0 }],
      { duration: 520, easing: "ease-out", fill: "forwards" }
    );
  }, [url]);
  useEffect(() => {
    // capture phase: runs before the link's own handler takes the click over
    const onClick = (e) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target.closest?.("a[href]");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const to = new URL(a.href, location.href);
      if (to.origin !== location.origin || !to.pathname.startsWith("/admin")) return;
      if (to.pathname + to.search === location.pathname + location.search) return;
      startLoad();
    };
    window.addEventListener("click", onClick, true);
    return () => window.removeEventListener("click", onClick, true);
  }, [startLoad]);

  // ---- remembered preferences (already on <html> before paint)
  useEffect(() => {
    setSlim(document.documentElement.dataset.slim === "1");
    setDark(document.documentElement.dataset.theme === "dark");
  }, []);
  const toggleSlim = () => {
    const next = !slim;
    setSlim(next);
    if (next) document.documentElement.dataset.slim = "1"; else delete document.documentElement.dataset.slim;
    remember("tba_adm_slim", next ? "1" : "0");
  };
  const toggleDark = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.dataset.theme = next ? "dark" : "light";
    remember("tba_adm_theme", next ? "dark" : "light");
  };

  // ---- the marker behind the open page slides there instead of jumping
  useLayoutEffect(() => {
    const place = () => {
      const a = navRef.current?.querySelector("a.active");
      const m = markRef.current;
      if (!m) return;
      if (!a) { m.style.opacity = "0"; return; }
      m.style.opacity = "1";
      m.style.transform = `translateY(${a.getBoundingClientRect().top - navRef.current.getBoundingClientRect().top}px)`;
      m.style.height = `${a.offsetHeight}px`;
      // glide only after the first placement, so opening the panel does not slide it in from the top
      if (!m.dataset.ready) requestAnimationFrame(() => { m.dataset.ready = "1"; });
    };
    place();
    // the slim sidebar hides the group titles, which moves every row: measure again once it has settled
    const t = setTimeout(place, 360);
    return () => clearTimeout(t);
  }, [pathname, slim]);

  // ---- page names beside the icons while the sidebar is slim
  const hideTip = () => tipRef.current?.classList.remove("on");
  const showTip = (e) => {
    const a = e.target.closest?.(".side nav a, .side__foot a, .side__foot button");
    const tip = tipRef.current;
    if (!tip) return;
    if (!a || document.documentElement.dataset.slim !== "1" || window.innerWidth <= 960) return hideTip();
    const r = a.getBoundingClientRect();
    tip.textContent = a.dataset.label || a.textContent;
    tip.style.transform = `translate(${Math.round(r.right + 12)}px, ${Math.round(r.top + r.height / 2)}px) translateY(-50%)`;
    tip.classList.add("on");
  };

  useEffect(() => { setMenu(false); setPalette(false); setBell(false); hideTip(); }, [pathname]);
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPalette((v) => !v); }
      if ((e.ctrlKey || e.metaKey) && e.key === "\\") { e.preventDefault(); document.querySelector(".side__slim")?.click(); }
      if (e.key === "Escape") { setPalette(false); setMenu(false); setBell(false); }
    };
    const away = (e) => { if (!bellRef.current?.contains(e.target)) setBell(false); };
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", away);
    return () => { window.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", away); };
  }, []);
  useEffect(() => { document.body.classList.toggle("locked", palette || menu); }, [palette, menu]);

  const isActive = (href) => (href === "/admin" ? pathname === href : pathname.startsWith(href));
  const here = pages.find((p) => isActive(p.href) && p.href !== "/admin") || pages[0];
  const initial = (admin.name || admin.email || "A").charAt(0).toUpperCase();
  const urgent = alerts.filter((a) => a.tone === "bad").length;
  const primary = can(admin, "orders") ? ["/admin/orders/new", "New order"] : can(admin, "products") ? ["/admin/products/new", "Add product"] : null;

  return (
    <div className={`adm ${menu ? "adm--open" : ""}`}>
      <span className="adm-load" ref={loadRef} aria-hidden />
      <aside className="side" onMouseOver={showTip} onMouseLeave={hideTip}>
        <Link href="/admin" className="side__brand" aria-label="Dashboard">
          <span className="side__word">The Brands<b>/</b>Attire <small>ADMIN</small></span>
          <span className="side__mono" aria-hidden>B<b>/</b>A</span>
        </Link>
        <nav aria-label="Admin" ref={navRef}>
          <span className="side__mark" ref={markRef} aria-hidden />
          {groups.map((g, gi) => (
            <div key={gi} className="side__set">
              {g.label && <span className="side__group">{g.label}</span>}
              {g.items.map(([href, label, icon, , countKey]) => (
                <Link key={href} href={href} data-label={label} className={isActive(href) ? "active" : ""} aria-current={isActive(href) ? "page" : undefined}>
                  <AdminIcon name={icon} /><span className="side__label">{label}</span>
                  {countKey && counts[countKey] > 0 && <i>{counts[countKey]}</i>}
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <div className="side__foot">
          <Link href="/" target="_blank" data-label="View shop"><AdminIcon name="external" /><span className="side__label">View shop</span></Link>
          <button type="button" className="side__slim" onClick={toggleSlim} aria-pressed={slim} data-label={slim ? "Show labels" : "Collapse menu"} title="Ctrl + \">
            <AdminIcon name="sidebar" /><span className="side__label">{slim ? "Show labels" : "Collapse menu"}</span>
          </button>
          <form action={logoutAction}><button data-label="Sign out"><AdminIcon name="logout" /><span className="side__label">Sign out</span></button></form>
          <div className="side__user"><span>{initial}</span><div><b>{admin.name || "Owner"}</b><small>{admin.role === "owner" ? "Owner" : "Staff"} · {admin.email}</small></div></div>
        </div>
      </aside>
      <span className="side__tip" ref={tipRef} aria-hidden />
      <div className="scrim" onClick={() => setMenu(false)} />

      <div className="adm__body">
        <header className="top">
          <button className="iconbtn top__burger" aria-label="Menu" onClick={() => setMenu(true)}><AdminIcon name="menu" /></button>
          <span className="top__crumb">{here.group} / <b>{here.label}</b></span>
          <button className="top__search" onClick={() => setPalette(true)} aria-label="Search">
            <AdminIcon name="search" /><span>Search orders, products, customers…</span><kbd>Ctrl K</kbd>
          </button>

          <button className="iconbtn top__theme" onClick={toggleDark} aria-label={dark ? "Switch to light mode" : "Switch to dark mode"} title={dark ? "Light mode" : "Dark mode"}>
            <AdminIcon name={dark ? "sun" : "moon"} />
          </button>

          <div className="bell" ref={bellRef}>
            <button className={`iconbtn ${alerts.length ? "bell--on" : ""}`} aria-label={`${alerts.length} things need attention`} aria-expanded={bell} onClick={() => setBell((v) => !v)}>
              <AdminIcon name="bell" />
              {alerts.length > 0 && <i className={urgent ? "hot" : ""}>{alerts.length}</i>}
            </button>
            {bell && (
              <div className="bell__panel">
                <div className="bell__head"><b>Needs attention</b><span>{alerts.length ? "Updated just now" : ""}</span></div>
                {alerts.length ? alerts.map((a) => (
                  <Link key={a.key} href={a.href} className="bell__item">
                    <span className={`bell__n ${a.tone}`}>{a.n}</span>
                    <span>{a.label}</span>
                    <AdminIcon name="arrow" />
                  </Link>
                )) : <p className="bell__empty">All clear. Nothing is waiting on you.</p>}
              </div>
            )}
          </div>

          {primary && <Link href={primary[0]} className="btn top__new"><AdminIcon name="plus" /><span>{primary[1]}</span></Link>}
        </header>
        <main className="main" key={pathname}>{children}</main>
      </div>

      <nav className="tabbar" aria-label="Quick links">
        {tabs.map((t) => (
          <Link key={t.href} href={t.href} className={isActive(t.href) ? "active" : ""} aria-current={isActive(t.href) ? "page" : undefined}>
            <span className="tabbar__icon"><AdminIcon name={t.icon} />{t.countKey && counts[t.countKey] > 0 && <i>{counts[t.countKey]}</i>}</span>
            <span>{t.label}</span>
          </Link>
        ))}
        <button type="button" onClick={() => setMenu(true)} className={menu ? "active" : ""}>
          <span className="tabbar__icon"><AdminIcon name="menu" /></span><span>Menu</span>
        </button>
      </nav>

      {palette && <Palette close={() => setPalette(false)} pages={pages} actions={actions} onGo={startLoad} />}
    </div>
  );
}

/** Quick search (Ctrl+K): jump to any page or find an order, product or customer. */
function Palette({ close, pages, actions, onGo }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [found, setFound] = useState({ orders: [], products: [], customers: [] });
  const [index, setIndex] = useState(0);
  const listRef = useRef(null);

  useEffect(() => {
    if (q.trim().length < 2) { setFound({ orders: [], products: [], customers: [] }); return; }
    let live = true;
    const t = setTimeout(async () => { const res = await adminSearchAction(q); if (live) setFound(res); }, 200);
    return () => { live = false; clearTimeout(t); };
  }, [q]);

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const match = (items) => (needle ? items.filter((i) => i.label.toLowerCase().includes(needle)) : items);
    return [
      ["Orders", found.orders.map((o) => ({ ...o, icon: "orders" }))],
      ["Products", found.products.map((p) => ({ ...p, icon: "box" }))],
      ["Customers", found.customers.map((c) => ({ ...c, icon: "users" }))],
      ["Quick actions", match(actions)],
      ["Go to", match(pages)],
    ].filter(([, items]) => items.length);
  }, [q, found, actions, pages]);
  const flat = groups.flatMap(([, items]) => items);

  useEffect(() => setIndex(0), [q, found]);
  useEffect(() => { listRef.current?.querySelector(".on")?.scrollIntoView({ block: "nearest" }); }, [index]);

  const go = (item) => { if (item) { close(); onGo?.(); router.push(item.href); } };
  const onKey = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setIndex((i) => Math.min(flat.length - 1, i + 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setIndex((i) => Math.max(0, i - 1)); }
    if (e.key === "Enter") { e.preventDefault(); go(flat[index]); }
  };

  let n = -1;
  return (
    <div className="palette" role="dialog" aria-modal="true" aria-label="Search" onClick={(e) => e.target === e.currentTarget && close()}>
      <div className="palette__box">
        <div className="palette__input">
          <AdminIcon name="search" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} placeholder="Order number, product, customer or page…" aria-label="Search" />
          <kbd>Esc</kbd>
        </div>
        <div className="palette__list" ref={listRef}>
          {groups.map(([title, items]) => (
            <div key={title}>
              <div className="palette__group">{title}</div>
              {items.map((item) => {
                n += 1;
                const i = n;
                return (
                  <button key={`${title}-${item.href}-${item.label}`} className={`palette__item ${i === index ? "on" : ""}`} onMouseEnter={() => setIndex(i)} onClick={() => go(item)}>
                    <AdminIcon name={item.icon} /><span>{item.label}</span>{item.hint && <small>{item.hint}</small>}
                  </button>
                );
              })}
            </div>
          ))}
          {!flat.length && <div className="palette__empty">Nothing found for “{q}”.</div>}
        </div>
        <div className="palette__foot"><span><kbd>↑</kbd> <kbd>↓</kbd> move</span><span><kbd>Enter</kbd> open</span><span><kbd>Esc</kbd> close</span></div>
      </div>
    </div>
  );
}
