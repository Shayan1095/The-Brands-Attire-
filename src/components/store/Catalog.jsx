"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useStore } from "./Shell";
import ProductCard from "./ProductCard";
import Subscribe from "./Subscribe";
import { Icon } from "./icons";
import CategoryIcon, { IconGlyph } from "../CategoryIcon";
import { variantLabel } from "@/lib/format";
import ShopHero from "./shop/ShopHero";
import FilterSheet, { SORTS, SortDrawer } from "./shop/FilterSheet";
import QuickView from "./shop/QuickView";
import ProductRail from "./pdp/ProductRail";
import CategoryPanels from "./home/CategoryPanels";
import { srcSetOf, PHONE_FULL } from "@/lib/img-src";
import ShinyText from "@/components/bits/ShinyText/ShinyText";

const EASE = [0.16, 1, 0.3, 1];
const SIZE_ORDER = ["XS", "S", "M", "L", "XL", "XXL"];
const PAGE = 16; // cards added per step (automatically as the end of the grid comes near)

gsap.registerPlugin(ScrollTrigger);

/** One entry in the collection rail: thumbnail, name, count. The red line slides to the active one. */
function RailItem({ active, onClick, thumb, label, count, tone = "" }) {
  return (
    <button className={`rail__item ${tone} ${active ? "active" : ""}`} onClick={onClick} aria-pressed={active}>
      <span className="rail__thumb">{thumb}</span>
      <span className="rail__text"><b>{label}</b><small>{count}</small></span>
      {active && <motion.span layoutId="rail-line" className="rail__line" transition={{ type: "spring", stiffness: 420, damping: 38 }} />}
    </button>
  );
}

/** "Ends in 2d 5h" for a sale with an end date; refreshes every minute. */
function Countdown({ until }) {
  const [now, setNow] = useState(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  if (!until || now === null) return null;
  const left = new Date(until).getTime() - now;
  if (left <= 0) return null;
  const d = Math.floor(left / 86_400_000), h = Math.floor((left % 86_400_000) / 3_600_000), m = Math.floor((left % 3_600_000) / 60_000);
  return <span className="countdown">Ends in {d > 0 && `${d}d `}{h}h{d === 0 && ` ${m}m`}</span>;
}

/** How many columns the grid has right now (it changes with the screen and the density toggle). */
function useColumns(ref, deps) {
  const [cols, setCols] = useState(4);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => setCols(getComputedStyle(el).gridTemplateColumns.split(" ").filter(Boolean).length || 1);
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  return cols;
}

/**
 * The whole Products page. Every active product is loaded once; collection, size, colour, price, stock,
 * search and sort are applied in the browser, so results re-arrange instantly with animation.
 * The address bar mirrors the choices (links such as /products?category=tech&size=M keep working and can be shared);
 * the server reads it for the first paint (`query`), after that the page keeps it in step itself.
 */
export default function Catalog({ query, products, categories, banners, sale, perks }) {
  const { fmt, wish, viewed, store } = useStore();
  const [qs, setQs] = useState(() => new URLSearchParams(query).toString());
  const sp = useMemo(() => new URLSearchParams(qs), [qs]);

  // a link elsewhere on the site (menu, footer) brought new filters from the server
  const firstQuery = useRef(true);
  useEffect(() => {
    if (firstQuery.current) { firstQuery.current = false; return; }
    setQs(new URLSearchParams(query).toString());
  }, [query]);
  // back / forward between collections
  useEffect(() => {
    const pop = () => window.location.pathname === "/products" && setQs(window.location.search.slice(1));
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);

  const category = sp.get("category") || "";
  const onlySale = sp.get("sale") === "1";
  const onlySaved = sp.get("saved") === "1";
  const sort = sp.get("sort") || "";
  const inStock = sp.get("stock") === "1";
  const price = sp.get("price") || "";
  const q = sp.get("q") || "";
  const sizeParam = sp.get("size") || "";
  const colorParam = sp.get("color") || "";
  const sizes = useMemo(() => sizeParam.split(",").filter(Boolean), [sizeParam]);
  const colors = useMemo(() => colorParam.split(",").filter(Boolean), [colorParam]);

  const [roomy, setRoomy] = useState(false);
  const [panel, setPanel] = useState(false);
  const [sorting, setSorting] = useState(false); // phone sort sheet
  const [barOn, setBarOn] = useState(false); // phone action bar (while the grid is on screen)
  const [quick, setQuick] = useState(null);
  const [shown, setShown] = useState(PAGE);
  const [lite, setLite] = useState(false);
  useEffect(() => setLite(document.documentElement.dataset.lite === "1"), []);
  // the search box keeps its own text so typing never waits for the filtering
  const [qText, setQText] = useState(q);
  useEffect(() => { if (!q) setQText(""); }, [q]);
  const gridRef = useRef(null);
  const topRef = useRef(null);
  const endRef = useRef(null);
  const catbarRef = useRef(null); // slides away while scrolling down the grid

  /** Change filters: new state + rewrite the address bar (no server round-trip). */
  const qsRef = useRef(qs);
  qsRef.current = qs;
  const setParams = useCallback((patch, push = false) => {
    const next = new URLSearchParams(qsRef.current);
    for (const [k, v] of Object.entries(patch)) v ? next.set(k, v) : next.delete(k);
    const str = next.toString();
    qsRef.current = str; // two changes in one click both count
    setQs(str);
    window.history[push ? "pushState" : "replaceState"](null, "", `/products${str ? `?${str}` : ""}`);
    setShown(PAGE);
    // if the reader is deep in the list, bring the new results to the top
    const top = topRef.current.getBoundingClientRect().top + window.scrollY - 160;
    if (window.scrollY > top + 40) (window.__lenis ? window.__lenis.scrollTo(top) : window.scrollTo({ top, behavior: "smooth" }));
  }, []);
  /** Switch collection. Price and search belong to a collection, so they reset; size, colour and sort are kept. */
  const setScope = (patch) => setParams({ category: "", sale: "", saved: "", price: "", q: "", ...patch }, true);
  const toggleIn = (list, key, value) => setParams({ [key]: (list.includes(value) ? list.filter((x) => x !== value) : [...list, value]).join(",") });
  const toggleSize = (s) => toggleIn(sizes, "size", s);
  const toggleColor = (c) => toggleIn(colors, "color", c);

  const current = categories.find((c) => c.slug === category);
  const scope = onlySaved ? "saved" : onlySale ? "sale" : current ? current.slug : "all";
  const scopeName = scope === "saved" ? "your saved pieces" : scope === "sale" ? "the sale" : current ? current.name : "the full collection";

  // products in the chosen collection, before the finer filters
  const pool = useMemo(
    () => products.filter((p) => (onlySaved ? wish.includes(p.id) : onlySale ? p.off > 0 : current ? p.cat === current.slug : true)),
    [products, onlySaved, onlySale, current, wish]
  );

  const sizeOptions = useMemo(() => {
    const all = [...new Set(pool.flatMap((p) => p.variants.map((v) => v.size)))];
    const rank = (s) => (SIZE_ORDER.includes(s) ? SIZE_ORDER.indexOf(s) : 100 + (parseFloat(s) || 0));
    return all.sort((a, b) => rank(a) - rank(b));
  }, [pool]);
  const colorOptions = useMemo(() => [...new Set(pool.flatMap((p) => p.variants.map((v) => v.color).filter(Boolean)))], [pool]);

  // the price slider runs between the collection's cheapest and dearest piece
  const bounds = useMemo(() => {
    const ps = pool.map((p) => p.price);
    if (!ps.length) return [0, 0];
    const step = Math.max(...ps) - Math.min(...ps) > 20000 ? 500 : 100;
    return [Math.floor(Math.min(...ps) / step) * step, Math.ceil(Math.max(...ps) / step) * step];
  }, [pool]);
  const range = useMemo(() => {
    if (!price) return bounds;
    const [a, b] = price.split("-").map((n) => (n === "" ? NaN : Number(n)));
    return [Number.isFinite(a) ? Math.max(bounds[0], a) : bounds[0], Number.isFinite(b) ? Math.min(bounds[1], b) : bounds[1]];
  }, [price, bounds]);
  const setRange = ([a, b]) => setParams({ price: a <= bounds[0] && b >= bounds[1] ? "" : `${a}-${b}` });

  const list = useMemo(() => {
    // every word typed must appear somewhere in the piece (same rule as the search panel)
    const needles = q.toLowerCase().split(/\s+/).filter(Boolean);
    const hay = (p) => `${p.name} ${p.category} ${p.desc || ""} ${p.variants.map((v) => v.color || "").join(" ")}`.toLowerCase();
    // a size and a colour must be available together in the same variant
    const fits = (v) => v.stock > 0 && (!sizes.length || sizes.includes(v.size)) && (!colors.length || colors.includes(v.color));
    const out = pool.filter(
      (p) =>
        (!inStock || !p.soldOut) &&
        (!(sizes.length || colors.length) || p.variants.some(fits)) &&
        (!price || (p.price >= range[0] && p.price <= range[1])) &&
        (!needles.length || needles.every((w) => hay(p).includes(w)))
    );
    if (sort === "price-asc") out.sort((a, b) => a.price - b.price);
    else if (sort === "price-desc") out.sort((a, b) => b.price - a.price);
    else if (sort === "featured") out.sort((a, b) => Number(b.featured) - Number(a.featured));
    else if (sort === "discount") out.sort((a, b) => b.off - a.off);
    // sold-out pieces sink to the end, whatever the order
    return out.sort((a, b) => Number(a.soldOut) - Number(b.soldOut));
  }, [pool, sizes, colors, inStock, price, range, q, sort]);

  // removable tags for whatever is switched on
  const tags = [
    ...sizes.map((s) => [`Size ${s}`, () => toggleSize(s)]),
    ...colors.map((c) => [c, () => toggleColor(c)]),
    ...(price ? [[`${fmt(range[0])} – ${fmt(range[1])}`, () => setParams({ price: "" })]] : []),
    ...(inStock ? [["In stock", () => setParams({ stock: "" })]] : []),
    ...(q ? [[`“${q}”`, () => setParams({ q: "" })]] : []),
    ...(sort ? [[SORTS.find(([v]) => v === sort)?.[1], () => setParams({ sort: "" })]] : []),
  ];
  const refined = tags.length > (sort ? 1 : 0);
  const clearAll = () => setParams({ size: "", color: "", stock: "", price: "", q: "", sort: "" });

  // the untouched "all products" view opens with an editor's pick
  const feature = scope === "all" && !tags.length ? products.find((p) => p.featured && !p.soldOut) || null : null;
  const cards = useMemo(() => (feature ? list.filter((p) => p.id !== feature.id) : list), [list, feature]);
  const visible = useMemo(() => cards.slice(0, shown), [cards, shown]);
  const more = cards.length - visible.length;
  const showPromo = sale && scope !== "sale" && scope !== "saved" && !refined && visible.length > 6;

  // fill the gap at the end of the last row with a closing tile, so the grid always ends square
  const cols = useColumns(gridRef, [roomy]);
  const promoSpan = showPromo ? Math.min(2, cols) : 0;
  const fill = !more && visible.length ? (cols - ((visible.length + promoSpan) % cols)) % cols : 0;
  // the collection a wide end-of-grid gap points to
  const next = categories.find((c) => c.slug !== category && c.image_url && c.product_count > 0);

  // desktop: every other column drifts against the scroll, so the grid gains depth (set per card from its column)
  const lags = useMemo(() => {
    const out = {};
    let pos = 0;
    visible.forEach((p, i) => {
      out[p.id] = (pos % cols) % 2;
      pos += 1;
      if (showPromo && i === 5) pos += promoSpan;
    });
    return out;
  }, [visible, cols, showPromo, promoSpan]);
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid || lite || !window.matchMedia("(min-width: 901px) and (prefers-reduced-motion: no-preference)").matches) return;
    // the drifting cards are moved directly (an inherited CSS variable would restyle every card on every frame)
    const lagging = [...grid.querySelectorAll('.catalog__drift[data-lag="1"]')];
    const setY = lagging.map((el) => gsap.quickSetter(el, "y", "px"));
    const st = ScrollTrigger.create({
      trigger: grid, start: "top bottom", end: "bottom top",
      onUpdate: (self) => { const y = (0.5 - self.progress) * 90; setY.forEach((set) => set(y)); },
    });
    st.update?.();
    return () => { st.kill(); gsap.set(lagging, { clearProps: "transform" }); };
  }, [lite, visible, roomy, cols, lags]);

  // scrolling down the grid slides the collection bar away; any scroll up brings it back
  useEffect(() => {
    let lastY = window.scrollY;
    let frame = 0;
    const run = () => {
      frame = 0;
      const y = window.scrollY;
      if (Math.abs(y - lastY) < 8) return;
      const top = (topRef.current?.getBoundingClientRect().top ?? 0) + y;
      // a class on the bar itself: a React state here would re-render the whole grid on every change of direction
      catbarRef.current?.classList.toggle("is-tucked", y > lastY && y > top + 120);
      lastY = y;
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(run); };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { window.removeEventListener("scroll", onScroll); cancelAnimationFrame(frame); };
  }, []);

  // phones: the action bar shows while the products are on screen
  useEffect(() => {
    const io = new IntersectionObserver(([e]) => setBarOn(e.isIntersecting), { rootMargin: "-30% 0px -20% 0px" });
    io.observe(topRef.current);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    document.body.classList.toggle("has-shopbar", barOn);
    return () => document.body.classList.remove("has-shopbar");
  }, [barOn]);

  // more cards load by themselves as the end of the grid comes near
  useEffect(() => {
    if (!more || !endRef.current) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setShown((n) => n + PAGE), { rootMargin: "0px 0px 900px 0px" });
    io.observe(endRef.current);
    return () => io.disconnect();
  }, [more, shown]);

  // facts about the collection, shown in the hero
  const stats = useMemo(() => {
    const prices = pool.map((p) => p.price);
    return { from: prices.length ? Math.min(...prices) : 0, inStock: pool.filter((p) => !p.soldOut).length, onSale: pool.filter((p) => p.off > 0).length };
  }, [pool]);

  const recent = useMemo(() => viewed.map((id) => products.find((p) => p.id === id)).filter(Boolean).slice(0, 10), [viewed, products]);
  // rows that mount after the page's scroll animations were set up ask for them to be wired up too
  useEffect(() => { if (recent.length) window.dispatchEvent(new Event("tba:motion")); }, [recent.length > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  // collection rail: arrows only when there is more to scroll to
  const railRef = useRef(null);
  const [edge, setEdge] = useState({ left: false, right: false });
  useEffect(() => {
    const el = railRef.current;
    const sync = () => setEdge({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
    sync();
    el.addEventListener("scroll", sync, { passive: true });
    window.addEventListener("resize", sync);
    return () => { el.removeEventListener("scroll", sync); window.removeEventListener("resize", sync); };
  }, [categories.length, wish.length]);
  const nudge = (dir) => railRef.current.scrollBy({ left: dir * 280, behavior: "smooth" });

  const hero =
    scope === "saved" ? { title: [{ text: "Your" }, { text: "saved", accent: true }], image: banners.shop, text: "The pieces you hearted, kept on this device.", crumbs: [["Shop", "/products"], ["Saved"]] }
    : scope === "sale" ? { title: [{ text: "The" }, { text: "sale", accent: true }], image: banners.sale, text: `${sale?.name || "Limited-time prices"}. Up to ${sale?.top || 0}% off while sizes last.`, crumbs: [["Shop", "/products"], ["Sale"]] }
    : current ? { title: [{ text: current.name }, { text: "/", accent: true }], image: current.image_url ? { desktop: current.image_url, mobile: current.image_url } : banners.shop, text: current.description || "Filter by size to find your fit.", crumbs: [["Shop", "/products"], [current.name]] }
    : { title: [{ text: "All" }, { text: "products", accent: true }], image: banners.shop, text: "Everything we make, in one place. Choose a collection, then filter by size and price to find your fit.", crumbs: [["Shop"]] };

  const worlds = [
    { key: "all", label: "All", count: products.length, image: banners.shop, active: scope === "all", pick: () => setScope({}) },
    ...categories.map((c) => ({
      key: c.slug, label: c.name, count: c.product_count, image: c.image_url ? { desktop: c.image_url, mobile: c.image_url } : null,
      active: scope === c.slug, pick: () => setScope({ category: c.slug }),
    })),
    ...(sale ? [{ key: "sale", label: "Sale", count: `−${sale.top}%`, image: banners.sale, active: scope === "sale", pick: () => setScope({ sale: "1" }), tone: "is-sale" }] : []),
  ];

  const heading = scope === "saved" ? "Saved pieces" : scope === "sale" ? sale?.name || "Sale" : current ? `The ${current.name} collection` : "The full collection";
  const cell = (i) => ({
    initial: { opacity: 0, y: 36 }, whileInView: { opacity: 1, y: 0 }, exit: { opacity: 0, scale: 0.94 },
    viewport: { once: true, margin: "0px 0px -6% 0px" },
    transition: { duration: 0.6, ease: EASE, delay: (i % 4) * 0.06, layout: { type: "spring", stiffness: 300, damping: 34 } },
  });

  return (
    <>
      <ShopHero
        worlds={worlds} title={hero.title} crumbs={hero.crumbs} text={hero.text} image={hero.image} currency={store.currency}
        stats={[[pool.length, pool.length === 1 ? "Piece" : "Pieces"], [stats.inStock, "In stock"], [stats.onSale, "On sale"], [stats.from, "From", true]]}
        ticker={perks.map(([, title]) => title)}
      />

      {/* the bar stays pinned only while the products are on screen */}
      <div className="shop-body">
      {/* sticky bar: collection rail + tools */}
      <div className="catbar" ref={catbarRef}>
        <div className="wrap catbar__inner">
          <div className={`rail ${edge.left ? "rail--left" : ""} ${edge.right ? "rail--right" : ""}`}>
            <button className="rail__arrow rail__arrow--prev" aria-label="Scroll collections left" onClick={() => nudge(-1)} tabIndex={edge.left ? 0 : -1}><Icon name="arrow" /></button>
            <div className="rail__scroll" ref={railRef} data-lenis-prevent>
              <RailItem active={scope === "all"} onClick={() => setScope({})} label="All" count={products.length} thumb={<Icon name="grid" />} />
              {categories.map((c) => (
                <RailItem
                  key={c.id} active={scope === c.slug} onClick={() => setScope({ category: c.slug })} label={c.name} count={c.product_count}
                  thumb={<CategoryIcon name={c.name} icon={c.icon} />}
                />
              ))}
              {sale && <RailItem active={scope === "sale"} onClick={() => setScope({ sale: "1" })} label="Sale" count={`−${sale.top}%`} thumb={<IconGlyph name="tag" />} tone="rail__item--sale" />}
              {wish.length > 0 && <RailItem active={scope === "saved"} onClick={() => setScope({ saved: "1" })} label="Saved" count={wish.length} thumb={<Icon name="heart" />} />}
            </div>
            <button className="rail__arrow rail__arrow--next" aria-label="Scroll collections right" onClick={() => nudge(1)} tabIndex={edge.right ? 0 : -1}><Icon name="arrow" /></button>
          </div>

          <div className="catbar__tools">
            <span className="catbar__count">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.b key={list.length} initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -10, opacity: 0 }} transition={{ duration: 0.2 }}>{list.length}</motion.b>
              </AnimatePresence>
              {list.length === 1 ? " piece" : " pieces"}
            </span>
            <button className={`tool ${tags.length ? "active" : ""}`} onClick={() => setPanel(true)} aria-haspopup="dialog">
              <Icon name="filter" /> <span>Filter &amp; sort</span>{tags.length > 0 && <i>{tags.length}</i>}
            </button>
            <div className="viewtoggle" role="group" aria-label="Card size">
              <button className={!roomy ? "active" : ""} onClick={() => setRoomy(false)} aria-label="Compact cards" aria-pressed={!roomy}><Icon name="grid" /></button>
              <button className={roomy ? "active" : ""} onClick={() => setRoomy(true)} aria-label="Larger cards" aria-pressed={roomy}><Icon name="rows" /></button>
            </div>
          </div>
        </div>
      </div>

      <FilterSheet
        open={panel} onOpenChange={setPanel} count={list.length} pool={pool} scopeName={scopeName} fmt={fmt}
        sort={sort} sizes={sizes} sizeOptions={sizeOptions} colors={colors} colorOptions={colorOptions}
        range={range} bounds={bounds} inStock={inStock} qText={qText} active={tags.length > 0}
        setSort={(v) => setParams({ sort: v })} toggleSize={toggleSize} toggleColor={toggleColor} setRange={setRange}
        setInStock={(v) => setParams({ stock: v ? "1" : "" })}
        setQ={(v) => { setQText(v); setParams({ q: v.trim() }); }}
        clearAll={() => { setQText(""); clearAll(); }}
      />

      <section className="section--tight catalog" ref={topRef}>
        <div className="wrap">
          {/* what is being browsed, and what is switched on */}
          <div className="results">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={scope} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.35, ease: EASE }}>
                <span className="eyebrow">{scope === "sale" ? <>Limited time <Countdown until={sale?.endsAt} /></> : "You are browsing"}</span>
                <h2 className="display results__title">{heading}</h2>
              </motion.div>
            </AnimatePresence>
            <div className="results__sort" role="group" aria-label="Sort">
              {SORTS.slice(0, 4).map(([value, label]) => (
                <button key={value} type="button" className={sort === value ? "is-on" : ""} aria-pressed={sort === value} onClick={() => setParams({ sort: value })}>
                  {sort === value && <motion.i layoutId="results-sort" transition={{ type: "spring", stiffness: 420, damping: 36 }} />}
                  <span>{label.replace("Price: ", "")}</span>
                </button>
              ))}
            </div>
          </div>

          <AnimatePresence initial={false}>
            {tags.length > 0 && (
              <motion.div className="ftags" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
                {tags.map(([label, remove]) => (
                  <button key={label} className="ftag" onClick={remove} aria-label={`Remove ${label}`}>{label} <span aria-hidden>✕</span></button>
                ))}
                <button className="link-arrow" onClick={() => { setQText(""); clearAll(); }}>Clear all</button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* editor's pick */}
          <AnimatePresence initial={false}>
            {feature && (
              <motion.div key="feature" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.6, ease: EASE }} style={{ overflow: "hidden" }}>
                <div className="feature">
                  <Link href={`/products/${feature.slug}`} className="feature__media" data-parallax-box aria-label={feature.name}>
                    {feature.images[0] && <img src={feature.images[0].url} srcSet={srcSetOf(feature.images[0].url, [480, 800])} sizes={PHONE_FULL} alt={feature.name} decoding="async" data-parallax />}
                    {feature.off > 0 && <span className="card__tag card__tag--sale">−{feature.off}%</span>}
                  </Link>
                  <div className="feature__text">
                    <span className="eyebrow feature__eyebrow" data-reveal>Editor’s pick · {feature.category}</span>
                    <h2 className="display" data-split>{feature.name}</h2>
                    <p data-reveal>{feature.desc}</p>
                    <div className="feature__foot" data-reveal>
                      <div className="price">
                        <span className={feature.was ? "sale" : ""}>{fmt(feature.price)}</span>
                        {feature.was && <s>{fmt(feature.was)}</s>}
                      </div>
                      <Link href={`/products/${feature.slug}`} className="btn btn--light">View the piece <span aria-hidden>→</span></Link>
                      <button type="button" className="btn btn--outline-light" onClick={() => setQuick(feature.id)}><Icon name="eye" /> Quick view</button>
                    </div>
                    <span className="feature__sizes" data-reveal>
                      {feature.variants.map((v) => <i key={v.id} className={v.stock ? "" : "out"}>{variantLabel(v)}</i>)}
                    </span>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className={`grid catalog__grid ${roomy ? "grid--roomy" : ""}`} ref={gridRef}>
            <AnimatePresence mode="popLayout" initial={false}>
              {visible.flatMap((p, i) => {
                const card = (
                  <motion.div key={p.id} layout={lite ? false : "position"} className="catalog__cell" {...cell(i)}>
                    <div className="catalog__drift" data-lag={lags[p.id] || 0}>
                      <ProductCard p={p} eager={i < 4} reveal={false} onQuickView={setQuick} photos />
                    </div>
                  </motion.div>
                );
                if (!(showPromo && i === 5)) return [card];
                return [
                  card,
                  <motion.button key="promo" layout={lite ? false : "position"} className="promo" onClick={() => setScope({ sale: "1" })} {...cell(0)}>
                    <span className="eyebrow">Limited time <Countdown until={sale.endsAt} /></span>
                    <b className="display">{sale.name}</b>
                    <span className="promo__big display" aria-hidden>−{sale.top}%</span>
                    <span className="promo__cta"><ShinyText text={`Up to ${sale.top}% off · Shop the sale →`} color="#ffffff" shineColor="#ffd2cf" speed={2.8} /></span>
                  </motion.button>,
                ];
              })}
              {fill > 0 && (
                next && fill > 1 ? (
                  // a wide gap: the next collection, as a photo
                  <motion.button
                    key={`end-${next.slug}-${fill}`} type="button" layout={lite ? false : "position"} className="endtile endtile--next"
                    style={{ gridColumn: `span ${fill}` }} onClick={() => setScope({ category: next.slug })} {...cell(1)}
                  >
                    <img src={next.image_url} alt="" loading="lazy" decoding="async" />
                    <span className="eyebrow">End of {scopeName} · Up next</span>
                    <b className="display">{next.name}</b>
                    <span className="endtile__go">{next.product_count} {next.product_count === 1 ? "piece" : "pieces"} <Icon name="arrow" /></span>
                  </motion.button>
                ) : (
                  <motion.div key={`end-${fill}`} layout={lite ? false : "position"} className="endtile" style={{ gridColumn: `span ${fill}` }} {...cell(1)}>
                    <span className="eyebrow">End of {scopeName}</span>
                    <b className="display">That’s all.</b>
                    <div className="endtile__links">
                      {scope !== "all" && <button type="button" className="link-arrow" onClick={() => setScope({})}>All products</button>}
                      <Link href="/lookbook" className="link-arrow">See them styled</Link>
                    </div>
                  </motion.div>
                )
              )}
            </AnimatePresence>
          </div>

          {more > 0 && (
            <div className="loadmore" ref={endRef}>
              <span>Showing {visible.length} of {cards.length}</span>
              <span className="loadmore__bar" aria-hidden><i style={{ transform: `scaleX(${visible.length / cards.length})` }} /></span>
              <button type="button" className="btn btn--ghost" onClick={() => setShown((n) => n + PAGE)}>Show {Math.min(PAGE, more)} more</button>
            </div>
          )}

          <AnimatePresence>
            {list.length === 0 && (
              <motion.div className="empty" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <h2>{scope === "saved" && !refined ? "Nothing saved yet" : "Nothing matches"}</h2>
                <p>
                  {scope === "saved" && !refined ? "Tap the heart on any piece to keep it here."
                    : scope === "sale" && !refined ? "There are no offers running right now. Check back soon."
                    : "Try another size or price, or clear the filters to see everything."}
                </p>
                <button className="btn" onClick={() => (refined ? clearAll() : setScope({}))}>{refined ? "Clear filters" : "View all products"}</button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </section>
      </div>

      <SortDrawer open={sorting} onOpenChange={setSorting} sort={sort} setSort={(v) => setParams({ sort: v })} />

      {/* phones: filter, sort and layout within thumb reach */}
      <AnimatePresence>
        {barOn && !panel && !sorting && !quick && (
          <motion.div
            className="shopbar" role="toolbar" aria-label="Filter, sort and layout"
            initial={{ y: 96, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 96, opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 34 }}
          >
            <button type="button" onClick={() => setPanel(true)}>
              <Icon name="filter" /><span>Filter</span>{tags.length > 0 && <i>{tags.length}</i>}
            </button>
            <button type="button" onClick={() => setSorting(true)}>
              <Icon name="sort" /><span>{sort ? SORTS.find(([v]) => v === sort)?.[1].replace("Price: ", "") : "Sort"}</span>
            </button>
            <button type="button" className="shopbar__view" onClick={() => setRoomy((v) => !v)} aria-pressed={roomy} aria-label={roomy ? "Two per row" : "One per row"}>
              <AnimatePresence mode="wait" initial={false}>
                <motion.span key={String(roomy)} initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.2 }}>
                  <Icon name={roomy ? "grid" : "rows"} />
                </motion.span>
              </AnimatePresence>
            </button>
            <span className="shopbar__count"><b>{list.length}</b> {list.length === 1 ? "piece" : "pieces"}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <QuickView list={feature ? [feature, ...visible] : visible} id={quick} setId={setQuick} />

      {/* why buy here */}
      <section className="trust trust--top" aria-label="Why shop with us">
        <div className="wrap trust__grid">
          {perks.map(([icon, title, text]) => (
            <div className="trust__item" key={title} data-reveal><Icon name={icon} /><div><b>{title}</b><span>{text}</span></div></div>
          ))}
        </div>
      </section>

      {/* picked up where you left off (kept in this browser) */}
      {recent.length > 0 && <ProductRail id="recent" eyebrow="Pick up where you left off" title="Recently viewed" items={recent} />}

      {/* onward journeys */}
      {categories.length > 1 && (
        <section className="section section--bone shop-worlds">
          <div className="wrap">
            <div className="section__head">
              <div><span className="eyebrow" data-reveal>Keep exploring</span><h2 data-split>{current ? "Other worlds" : "Shop by world"}</h2></div>
              <Link href="/lookbook" className="link-arrow" data-reveal>See the lookbook</Link>
            </div>
            <CategoryPanels
              categories={categories.filter((c) => c.slug !== category)}
              onPick={(slug) => { setScope({ category: slug }); (window.__lenis ? window.__lenis.scrollTo(0) : window.scrollTo({ top: 0, behavior: "smooth" })); }}
            />
          </div>
        </section>
      )}

      {/* closing: the same black finale as the home page, flowing into the footer */}
      <section className="close close--compact" aria-label="Get the next drop">
        <span className="close__ghost" data-drift aria-hidden>New every week ✦ New every week ✦ New every week</span>
        <div className="wrap close__grid">
          <div className="close__copy">
            <span className="eyebrow close__eyebrow" data-reveal><span className="hero__pulse" /> Not found it yet?</span>
            <h2 className="display close__title" data-split>First to the <em>drop</em>.</h2>
            <p className="close__lede" data-reveal>New pieces land every week and the popular sizes go first. Get them on WhatsApp or by email the day they arrive.</p>
          </div>
          <div className="close__copy">
            <div className="close__form" data-reveal><Subscribe /></div>
            <p className="close__fine" data-reveal>No spam. Unsubscribe any time with one tap.</p>
            <Link href="/lookbook" className="btn btn--light close__shop" data-reveal>See the gallery <span aria-hidden>→</span></Link>
          </div>
        </div>
      </section>
    </>
  );
}
