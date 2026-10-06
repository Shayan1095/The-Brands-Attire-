"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { useStore } from "./Shell";
import ProductCard from "./ProductCard";
import { PageHero, Marquee } from "./ui";
import { Icon } from "./icons";
import CategoryIcon, { IconGlyph } from "../CategoryIcon";
import { variantLabel } from "@/lib/format";

const EASE = [0.16, 1, 0.3, 1];
const SIZE_ORDER = ["XS", "S", "M", "L", "XL", "XXL"];
const SORTS = [["", "Newest"], ["featured", "Featured"], ["price-asc", "Price: low to high"], ["price-desc", "Price: high to low"]];

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

/** A titled block inside the filter panel. New filter types are added as more of these. */
function FilterGroup({ title, children, wide }) {
  return (
    <div className={`fgroup ${wide ? "fgroup--wide" : ""}`}>
      <span className="fgroup__title">{title}</span>
      {children}
    </div>
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

/**
 * The whole Products page. Every active product is loaded once; collection, size, price, stock,
 * search and sort are applied in the browser, so results re-arrange instantly with animation.
 * The address bar stays the source of truth (links such as /products?category=tech keep working).
 */
export default function Catalog({ products, categories, banners, sale, perks }) {
  const { fmt, wish, viewed } = useStore();
  const sp = useSearchParams();
  const category = sp.get("category") || "";
  const onlySale = sp.get("sale") === "1";
  const onlySaved = sp.get("saved") === "1";
  const sort = sp.get("sort") || "";
  const inStock = sp.get("stock") === "1";
  const price = sp.get("price") || "";
  const q = sp.get("q") || "";
  const sizeParam = sp.get("size") || "";
  const sizes = useMemo(() => sizeParam.split(",").filter(Boolean), [sizeParam]);

  const [roomy, setRoomy] = useState(false);
  const [panel, setPanel] = useState(false);
  // the search box keeps its own text so typing never waits for the address bar to update
  const [qText, setQText] = useState(q);
  useEffect(() => { if (!q) setQText(""); }, [q]);
  const gridRef = useRef(null);

  /** Change filters by rewriting the query string (no server round-trip). */
  const setParams = (patch, push = false) => {
    const next = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(patch)) v ? next.set(k, v) : next.delete(k);
    window.history[push ? "pushState" : "replaceState"](null, "", `/products${next.size ? `?${next}` : ""}`);
    // if the reader is deep in the list, bring the new results to the top
    const top = gridRef.current.getBoundingClientRect().top + window.scrollY - 200;
    if (window.scrollY > top) (window.__lenis ? window.__lenis.scrollTo(top) : window.scrollTo({ top, behavior: "smooth" }));
  };
  /** Switch collection. Price bands and search belong to a collection, so they reset; size is kept. */
  const setScope = (patch) => setParams({ category: "", sale: "", saved: "", price: "", q: "", ...patch }, true);
  const toggleSize = (s) => setParams({ size: (sizes.includes(s) ? sizes.filter((x) => x !== s) : [...sizes, s]).join(",") });

  const current = categories.find((c) => c.slug === category);
  const scope = onlySaved ? "saved" : onlySale ? "sale" : current ? current.slug : "all";

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

  // three price bands cut from the collection's own prices
  const bands = useMemo(() => {
    const ps = pool.map((p) => p.price).sort((a, b) => a - b);
    if (ps.length < 4) return [];
    const round = (v) => Math.round(v / 500) * 500;
    const a = round(ps[Math.floor(ps.length / 3)]), b = round(ps[Math.floor((ps.length * 2) / 3)]);
    if (!(a > 0 && b > a)) return [];
    return [[`0-${a}`, `Under ${fmt(a)}`], [`${a}-${b}`, `${fmt(a)} – ${fmt(b)}`], [`${b}-`, `Over ${fmt(b)}`]];
  }, [pool, fmt]);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const [lo, hi] = price ? price.split("-").map((n) => (n === "" ? Infinity : Number(n))) : [0, Infinity];
    const out = pool.filter(
      (p) =>
        (!inStock || !p.soldOut) &&
        (!sizes.length || p.variants.some((v) => sizes.includes(v.size) && v.stock > 0)) &&
        (!price || (p.price >= lo && p.price < hi)) &&
        (!needle || `${p.name} ${p.category}`.toLowerCase().includes(needle))
    );
    if (sort === "price-asc") out.sort((a, b) => a.price - b.price);
    else if (sort === "price-desc") out.sort((a, b) => b.price - a.price);
    else if (sort === "featured") out.sort((a, b) => Number(b.featured) - Number(a.featured));
    return out;
  }, [pool, sizes, inStock, price, q, sort]);

  // removable tags for whatever is switched on
  const tags = [
    ...sizes.map((s) => [`Size ${s}`, () => toggleSize(s)]),
    ...(price ? [[bands.find(([v]) => v === price)?.[1] || "Price", () => setParams({ price: "" })]] : []),
    ...(inStock ? [["In stock", () => setParams({ stock: "" })]] : []),
    ...(q ? [[`“${q}”`, () => setParams({ q: "" })]] : []),
    ...(sort ? [[SORTS.find(([v]) => v === sort)?.[1], () => setParams({ sort: "" })]] : []),
  ];
  const refined = tags.length > (sort ? 1 : 0);
  const clearAll = () => setParams({ size: "", stock: "", price: "", q: "", sort: "" });

  // the untouched "all products" view opens with an editor's pick
  const feature = scope === "all" && !tags.length ? products.find((p) => p.featured && !p.soldOut) || null : null;
  const cards = feature ? list.filter((p) => p.id !== feature.id) : list;
  const showPromo = sale && scope !== "sale" && scope !== "saved" && !refined && cards.length > 6;

  // facts about the collection, shown above the grid
  const stats = useMemo(() => {
    const prices = pool.map((p) => p.price);
    return {
      from: prices.length ? Math.min(...prices) : 0,
      to: prices.length ? Math.max(...prices) : 0,
      inStock: pool.filter((p) => !p.soldOut).length,
      onSale: pool.filter((p) => p.off > 0).length,
      isNew: pool.filter((p) => p.badge === "New").length,
    };
  }, [pool]);

  // "XS – XXL" or "28 – 38"; a mix of letter and waist sizes is shown as a count instead
  const letters = sizeOptions.filter((s) => SIZE_ORDER.includes(s));
  const sizeRange = !sizeOptions.length ? "–"
    : letters.length && letters.length < sizeOptions.length ? `${sizeOptions.length} sizes`
    : sizeOptions.length > 1 ? `${sizeOptions[0]} – ${sizeOptions.at(-1)}` : sizeOptions[0];

  const recent = useMemo(() => viewed.map((id) => products.find((p) => p.id === id)).filter(Boolean).slice(0, 8), [viewed, products]);

  // the hero is swapped without a page load, so ask the motion layer to wire up the new one
  const firstScope = useRef(true);
  useEffect(() => {
    if (firstScope.current) { firstScope.current = false; return; }
    window.dispatchEvent(new Event("tba:motion"));
  }, [scope]);

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
  }, [categories.length]);
  const nudge = (dir) => railRef.current.scrollBy({ left: dir * 280, behavior: "smooth" });

  const hero =
    scope === "saved" ? { title: "Your", accent: "saved", ghost: "Saved", image: banners.shop, text: "The pieces you hearted, kept on this device.", crumbs: [["Shop", "/products"], ["Saved"]] }
    : scope === "sale" ? { title: "The", accent: "sale", ghost: "Sale", image: banners.sale, text: "Limited-time prices. When they're gone, they're gone.", crumbs: [["Shop", "/products"], ["Sale"]] }
    : current ? { title: current.name, accent: "", ghost: current.name, image: current.image_url || banners.shop, text: current.description || "Filter by size to find your fit.", crumbs: [["Shop", "/products"], [current.name]] }
    : { title: "All", accent: "products", ghost: "Shop", image: banners.shop, text: "Everything we make, in one place. Choose a collection, then filter by size and price to find your fit.", crumbs: [["Shop"]] };
  const heading = scope === "saved" ? "Saved pieces" : scope === "sale" ? sale?.name || "Sale" : current ? `The ${current.name} collection` : "The full collection";

  return (
    <>
      <motion.div key={scope} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}>
        <PageHero {...hero} tall ticker={perks.map(([, title]) => title)} meta={[[pool.length, pool.length === 1 ? "Piece" : "Pieces"], [stats.onSale, "On sale"], [stats.inStock, "In stock"]]} />
      </motion.div>

      {/* sticky bar: collection rail + tools */}
      <div className="catbar">
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
            <button className={`tool ${panel || tags.length ? "active" : ""}`} onClick={() => setPanel((v) => !v)} aria-expanded={panel}>
              <Icon name="filter" /> <span>Filter &amp; sort</span>{tags.length > 0 && <i>{tags.length}</i>}
            </button>
            <div className="viewtoggle" role="group" aria-label="Card size">
              <button className={!roomy ? "active" : ""} onClick={() => setRoomy(false)} aria-label="Compact cards" aria-pressed={!roomy}><Icon name="grid" /></button>
              <button className={roomy ? "active" : ""} onClick={() => setRoomy(true)} aria-label="Larger cards" aria-pressed={roomy}><Icon name="rows" /></button>
            </div>
          </div>
        </div>

        <AnimatePresence initial={false}>
          {panel && (
            <motion.div className="catpanel" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.4, ease: EASE }}>
              <div className="wrap catpanel__inner">
                <FilterGroup title="Size" wide>
                  <div className="fopts">
                    {sizeOptions.map((s) => (
                      <motion.button key={s} whileTap={{ scale: 0.92 }} className={`fopt ${sizes.includes(s) ? "active" : ""}`} onClick={() => toggleSize(s)} aria-pressed={sizes.includes(s)}>{s}</motion.button>
                    ))}
                  </div>
                </FilterGroup>
                {bands.length > 0 && (
                  <FilterGroup title="Price">
                    <div className="fopts">
                      {bands.map(([value, label]) => (
                        <motion.button key={value} whileTap={{ scale: 0.95 }} className={`fopt ${price === value ? "active" : ""}`} onClick={() => setParams({ price: price === value ? "" : value })} aria-pressed={price === value}>{label}</motion.button>
                      ))}
                    </div>
                  </FilterGroup>
                )}
                <FilterGroup title="Availability">
                  <div className="fopts">
                    <motion.button whileTap={{ scale: 0.95 }} className={`fopt ${inStock ? "active" : ""}`} onClick={() => setParams({ stock: inStock ? "" : "1" })} aria-pressed={inStock}>In stock only</motion.button>
                  </div>
                </FilterGroup>
                <FilterGroup title="Sort by" wide>
                  <div className="fopts">
                    {SORTS.map(([value, label]) => (
                      <motion.button key={value} whileTap={{ scale: 0.95 }} className={`fopt ${sort === value ? "active" : ""}`} onClick={() => setParams({ sort: value })} aria-pressed={sort === value}>{label}</motion.button>
                    ))}
                  </div>
                </FilterGroup>
                <FilterGroup title="Search this collection">
                  <input className="input catpanel__search" value={qText} onChange={(e) => { setQText(e.target.value); setParams({ q: e.target.value.trim() }); }} placeholder="Type a name…" aria-label="Search this collection" />
                </FilterGroup>
              </div>
              <div className="wrap catpanel__foot">
                <span>{list.length} of {pool.length} pieces match</span>
                <span>
                  {tags.length > 0 && <button className="link-arrow" onClick={clearAll}>Clear all</button>}
                  <button className="btn" onClick={() => setPanel(false)}>Show {list.length} {list.length === 1 ? "piece" : "pieces"}</button>
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <section className="section--tight catalog">
        <div className="wrap" ref={gridRef}>
          {/* about this collection */}
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={scope} className="collection" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.4, ease: EASE }}>
              <div>
                <span className="eyebrow">{scope === "sale" ? <>Limited time <Countdown until={sale?.endsAt} /></> : "You are browsing"}</span>
                <h2 className="display">{heading}</h2>
              </div>
              <dl className="collection__stats">
                <div><dt>Pieces</dt><dd>{pool.length}</dd></div>
                <div><dt>Price</dt><dd>{pool.length ? <>{fmt(stats.from)}{stats.to > stats.from && <> – {fmt(stats.to)}</>}</> : "–"}</dd></div>
                <div><dt>Sizes</dt><dd>{sizeRange}</dd></div>
                <div><dt>In stock</dt><dd>{stats.inStock}</dd></div>
                {stats.isNew > 0 && <div><dt>New in</dt><dd>{stats.isNew}</dd></div>}
              </dl>
            </motion.div>
          </AnimatePresence>

          {/* what is switched on */}
          <AnimatePresence initial={false}>
            {tags.length > 0 && (
              <motion.div className="ftags" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
                {tags.map(([label, remove]) => (
                  <button key={label} className="ftag" onClick={remove} aria-label={`Remove ${label}`}>{label} <span aria-hidden>✕</span></button>
                ))}
                <button className="link-arrow" onClick={clearAll}>Clear all</button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* editor's pick */}
          <AnimatePresence initial={false}>
            {feature && (
              <motion.div key="feature" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.6, ease: EASE }} style={{ overflow: "hidden" }}>
                <Link href={`/products/${feature.slug}`} className="feature">
                  <div className="feature__media" data-parallax-box>
                    {feature.images[0] && <img src={feature.images[0].url} alt={feature.name} data-parallax />}
                    {feature.off > 0 && <span className="card__tag card__tag--sale">−{feature.off}%</span>}
                  </div>
                  <div className="feature__text">
                    <span className="eyebrow" style={{ color: "var(--signal)" }} data-reveal>Editor’s pick · {feature.category}</span>
                    <h2 className="display" data-split>{feature.name}</h2>
                    <p data-reveal>{feature.desc}</p>
                    <div className="feature__foot" data-reveal>
                      <div className="price">
                        <span className={feature.was ? "sale" : ""}>{fmt(feature.price)}</span>
                        {feature.was && <s>{fmt(feature.was)}</s>}
                      </div>
                      <span className="btn btn--light">View the piece <span aria-hidden>→</span></span>
                    </div>
                    <span className="feature__sizes" data-reveal>
                      {feature.variants.map((v) => <i key={v.id} className={v.stock ? "" : "out"}>{variantLabel(v)}</i>)}
                    </span>
                  </div>
                </Link>
              </motion.div>
            )}
          </AnimatePresence>

          <div className={`grid catalog__grid ${roomy ? "grid--roomy" : ""}`}>
            <AnimatePresence mode="popLayout" initial={false}>
              {cards.flatMap((p, i) => {
                const card = (
                  <motion.div
                    key={p.id} layout="position" className="catalog__cell"
                    initial={{ opacity: 0, y: 36 }} whileInView={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.94 }}
                    viewport={{ once: true, margin: "0px 0px -6% 0px" }}
                    transition={{ duration: 0.6, ease: EASE, delay: (i % 4) * 0.06, layout: { type: "spring", stiffness: 300, damping: 34 } }}
                  >
                    <ProductCard p={p} eager={i < 4} reveal={false} />
                  </motion.div>
                );
                if (!(showPromo && i === 5)) return [card];
                return [
                  card,
                  <motion.button
                    key="promo" layout="position" className="promo" onClick={() => setScope({ sale: "1" })}
                    initial={{ opacity: 0, y: 36 }} whileInView={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} viewport={{ once: true }} transition={{ duration: 0.6, ease: EASE }}
                  >
                    <span className="eyebrow">Limited time <Countdown until={sale.endsAt} /></span>
                    <b className="display">{sale.name}</b>
                    <span className="promo__big display">−{sale.top}%</span>
                    <span className="btn btn--light">Shop the sale <span aria-hidden>→</span></span>
                  </motion.button>,
                ];
              })}
            </AnimatePresence>
          </div>

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

      {/* why buy here */}
      <section className="trust trust--top" aria-label="Why shop with us">
        <div className="wrap trust__grid">
          {perks.map(([icon, title, text]) => (
            <div className="trust__item" key={title} data-reveal><Icon name={icon} /><div><b>{title}</b><span>{text}</span></div></div>
          ))}
        </div>
      </section>

      {/* picked up where you left off */}
      {recent.length > 0 && (
        <section className="section section--bone">
          <div className="wrap">
            <div className="section__head">
              <div><span className="eyebrow" data-reveal>Pick up where you left off</span><h2 data-split>Recently viewed</h2></div>
            </div>
            <div className="strip" data-lenis-prevent>
              {recent.map((p) => <ProductCard key={p.id} p={p} reveal={false} />)}
            </div>
          </div>
        </section>
      )}

      <Marquee className="marquee--band" items={["Cash on delivery", "Easy 7-day exchange", "Confirm before we ship", "Nationwide delivery"]} />

      {/* onward journeys */}
      <section className="section">
        <div className="wrap">
          <div className="section__head">
            <div><span className="eyebrow" data-reveal>Keep exploring</span><h2 data-split>{current ? "Other worlds" : "Shop by world"}</h2></div>
            <Link href="/lookbook" className="link-arrow" data-reveal>See the lookbook</Link>
          </div>
          <div className="cats cats--short">
            {categories.filter((c) => c.slug !== category).map((c, i) => (
              <button key={c.id} className="cat" onClick={() => { setScope({ category: c.slug }); (window.__lenis ? window.__lenis.scrollTo(0) : window.scrollTo({ top: 0, behavior: "smooth" })); }}>
                <div className="cat__img">{c.image_url && <img src={c.image_url} alt="" loading="lazy" decoding="async" />}</div>
                <span className="cat__num">/ {String(i + 1).padStart(2, "0")}</span>
                <div className="cat__label">
                  <div><h3>{c.name}</h3><small>{c.product_count} {c.product_count === 1 ? "piece" : "pieces"}</small></div>
                  <span className="cat__go" aria-hidden><Icon name="arrow" /></span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
