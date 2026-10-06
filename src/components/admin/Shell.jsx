"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { logoutAction, adminSearchAction } from "@/lib/admin-actions";
import { can } from "@/lib/format";
import AdminIcon from "./icons";

// [href, label, icon, permission needed (null = everyone), badge key]
const GROUPS = [
  { items: [["/admin", "Dashboard", "home", null], ["/admin/orders", "Orders", "orders", "orders", "orders"], ["/admin/inbox", "Inbox", "inbox", "support", "chats"]] },
  { label: "Catalogue", items: [["/admin/products", "Products", "box", "products"], ["/admin/inventory", "Inventory", "layers", "inventory"], ["/admin/categories", "Categories", "folder", "products"], ["/admin/offers", "Offers & sales", "percent", "offers"]] },
  { label: "Marketing", items: [["/admin/customers", "Customers", "users", "customers"], ["/admin/campaigns", "Campaigns", "megaphone", "marketing"], ["/admin/assistant", "Assistant", "spark", "support"], ["/admin/automations", "Automations", "zap", "marketing"], ["/admin/messages", "Messages", "message", "marketing", "messages"]] },
  { label: "Store", items: [["/admin/banners", "Banners", "image", "banners"], ["/admin/staff", "Staff", "users", "staff"], ["/admin/settings", "Settings", "settings", "settings"]] },
];
const ACTIONS = [
  { href: "/admin/orders/new", label: "Create an order (WhatsApp, call, walk-in)", icon: "plus", perm: "orders" },
  { href: "/admin/products/new", label: "Add a product", icon: "plus", perm: "products" },
  { href: "/admin/inventory/insights", label: "Restock suggestions", icon: "layers", perm: "inventory" },
  { href: "/admin/offers", label: "Start a sale", icon: "percent", perm: "offers" },
  { href: "/admin/campaigns", label: "Send a campaign", icon: "megaphone", perm: "marketing" },
  { href: "/admin/assistant#answers", label: "Teach the assistant an answer", icon: "spark", perm: "support" },
  { href: "/admin/orders?status=confirmed", label: "Orders ready to pack", icon: "truck", perm: "orders" },
];

/** Sidebar, top bar, alerts and quick search around every admin page. Only shows what this person may use. */
export default function Shell({ admin, counts, alerts, children }) {
  const pathname = usePathname();
  const [menu, setMenu] = useState(false);
  const [palette, setPalette] = useState(false);
  const [bell, setBell] = useState(false);
  const bellRef = useRef(null);

  const groups = useMemo(
    () => GROUPS.map((g) => ({ ...g, items: g.items.filter(([, , , perm]) => !perm || can(admin, perm)) })).filter((g) => g.items.length),
    [admin]
  );
  const pages = groups.flatMap((g) => g.items.map(([href, label, icon]) => ({ href, label, icon, group: g.label || "Overview" })));
  const actions = ACTIONS.filter((a) => can(admin, a.perm));

  useEffect(() => { setMenu(false); setPalette(false); setBell(false); }, [pathname]);
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPalette((v) => !v); }
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
      <aside className="side">
        <Link href="/admin" className="side__brand">The Brands<b>/</b>Attire <small>ADMIN</small></Link>
        <nav aria-label="Admin">
          {groups.map((g, gi) => (
            <div key={gi} style={{ display: "grid", gap: 2 }}>
              {g.label && <span className="side__group">{g.label}</span>}
              {g.items.map(([href, label, icon, , countKey]) => (
                <Link key={href} href={href} className={isActive(href) ? "active" : ""} aria-current={isActive(href) ? "page" : undefined}>
                  <AdminIcon name={icon} />{label}
                  {countKey && counts[countKey] > 0 && <i>{counts[countKey]}</i>}
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <div className="side__foot">
          <Link href="/" target="_blank"><AdminIcon name="external" />View shop</Link>
          <form action={logoutAction}><button><AdminIcon name="logout" />Sign out</button></form>
          <div className="side__user"><span>{initial}</span><div><b>{admin.name || "Owner"}</b><small>{admin.role === "owner" ? "Owner" : "Staff"} · {admin.email}</small></div></div>
        </div>
      </aside>
      <div className="scrim" onClick={() => setMenu(false)} />

      <div className="adm__body">
        <header className="top">
          <button className="iconbtn top__burger" aria-label="Menu" onClick={() => setMenu(true)}><AdminIcon name="menu" /></button>
          <span className="top__crumb">{here.group} / <b>{here.label}</b></span>
          <button className="top__search" onClick={() => setPalette(true)} aria-label="Search">
            <AdminIcon name="search" /><span>Search orders, products, customers…</span><kbd>Ctrl K</kbd>
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

          {primary && <Link href={primary[0]} className="btn"><AdminIcon name="plus" /><span>{primary[1]}</span></Link>}
        </header>
        <main className="main" key={pathname}>{children}</main>
      </div>

      {palette && <Palette close={() => setPalette(false)} pages={pages} actions={actions} />}
    </div>
  );
}

/** Quick search (Ctrl+K): jump to any page or find an order, product or customer. */
function Palette({ close, pages, actions }) {
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

  const go = (item) => { if (item) { close(); router.push(item.href); } };
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
