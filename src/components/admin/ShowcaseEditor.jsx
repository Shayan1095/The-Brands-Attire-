"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Reorder, useDragControls } from "motion/react";
import { saveShowcaseAction, uploadShowcasePhotoAction } from "@/lib/admin-actions";
import { SHOWCASE_SECTIONS, SHOWCASE_PHOTOS, SHOWCASE_PAGES } from "@/lib/showcase-sections";
import { ProductPicker } from "./SaleForm";
import { shrinkImage } from "./shrink";
import AdminIcon from "./icons";

// the editor's menu, grouped by the shop page each part lives on (in the order a customer meets them)
const PANELS = [
  { key: "arrivals", label: SHOWCASE_SECTIONS.arrivals.label, kind: "section", page: "home" },
  { key: "sale", label: SHOWCASE_SECTIONS.sale.label, kind: "section", page: "home" },
  { key: "photos", label: "Home photos", kind: "photos", page: "home" },
  { key: "related", label: SHOWCASE_SECTIONS.related.label, kind: "section", page: "product" },
  { key: "bag", label: SHOWCASE_SECTIONS.bag.label, kind: "section", page: "bag" },
  { key: "waiting", label: SHOWCASE_SECTIONS.waiting.label, kind: "section", page: "order" },
  { key: "gallery", label: "Gallery photos", kind: "gallery", page: "lookbook" },
  { key: "lookbook", label: SHOWCASE_SECTIONS.lookbook.label, kind: "section", page: "lookbook" },
];
const MARK = { photos: ["photo-hero", "photo-ethos", "photo-look"], gallery: ["gallery"] };

/**
 * Where a part sits on the shop: a small map of the page top to bottom with this part in red, and a button
 * that opens that page, scrolls to it and outlines it (see components/store/spotlight.js).
 */
function Where({ page, marks, href, spot, dirty, note }) {
  const p = SHOWCASE_PAGES[page];
  const at = p.blocks.findIndex(([k]) => marks.includes(k));
  return (
    <div className="sc__where">
      <ol className="sc__map" aria-label={`${p.label}, top to bottom`}>
        {p.blocks.map(([k, label], i) => (
          <li key={i} className={marks.includes(k) ? "on" : ""} aria-current={marks.includes(k) ? "true" : undefined}>{label}</li>
        ))}
      </ol>
      <div className="sc__wheretext">
        <span className="sc__label" style={{ marginTop: 0 }}>Where customers see it</span>
        <b>{p.label}</b>
        <p>
          {marks.length > 1 ? "The parts in red" : at === 0 ? "The very top of the page" : `Part ${at + 1} of ${p.blocks.length}, after “${p.blocks[at - 1][1]}”`}
          {note ? `. ${note}` : "."}
        </p>
        {href ? (
          <a className="btn btn--ghost btn--sm" href={`${href}${href.includes("?") ? "&" : "?"}showcase=${spot}`} target="_blank" rel="noopener">
            <AdminIcon name="external" />Show me on the shop
          </a>
        ) : <small className="dim">There is no page like this yet to open.</small>}
        {dirty && <small className="sc__unsaved">The shop shows what is saved: save first to see your changes there.</small>}
      </div>
    </div>
  );
}

/**
 * Admin -> Showcase: choose what the storefront sections show.
 * Every section is Automatic (the shop's own rule) or Hand-picked (these products, in this order, with this
 * photo). Changes are kept on the page until "Save", then the shop shows them straight away.
 */
export default function ShowcaseEditor({ initial, products, previews, chapters, originals, pages }) {
  const router = useRouter();
  const [state, setState] = useState(initial);
  const [saved, setSaved] = useState(JSON.stringify(initial));
  const [panel, setPanel] = useState(PANELS[0].key);
  const [toast, setToast] = useState("");
  const [pending, start] = useTransition();
  const dirty = JSON.stringify(state) !== saved;
  const changed = useMemo(() => {
    if (!dirty) return [];
    const before = JSON.parse(saved);
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    return PANELS.filter((p) =>
      p.kind === "section" ? !same(state.sections[p.key], before.sections[p.key])
      : p.kind === "photos" ? !same(state.photos, before.photos)
      : !same(state.gallery, before.gallery)
    ).map((p) => p.label);
  }, [state, saved, dirty]);
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const live = useMemo(() => products.filter((p) => p.status === "active"), [products]);

  // leaving with unsaved changes asks first
  useEffect(() => {
    if (!dirty) return;
    const warn = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(""), 3200); return () => clearTimeout(t); }, [toast]);

  const setSection = (key, patch) => setState((s) => ({ ...s, sections: { ...s.sections, [key]: { ...s.sections[key], ...patch } } }));
  const save = () => start(async () => {
    const res = await saveShowcaseAction(state);
    if (res?.ok) { setSaved(JSON.stringify(state)); setToast("Saved. The shop shows it now."); router.refresh(); }
    else setToast("Could not save. Please try again.");
  });

  const statusOf = (p) => {
    if (p.kind === "section") {
      const s = state.sections[p.key];
      return s.mode === "pick" ? `${Math.min(s.items.length, SHOWCASE_SECTIONS[p.key].max)} picked` : "Auto";
    }
    if (p.kind === "photos") { const n = Object.values(state.photos).filter(Boolean).length; return n ? `${n} replaced` : "Original"; }
    const n = Object.keys(state.gallery).length;
    return n ? `${n} curated` : "Auto";
  };
  const current = PANELS.find((p) => p.key === panel);

  return (
    <>
      <div className="head">
        <div>
          <h1>Showcase</h1>
          <p>Choose what the shop puts in front of customers: which products each section shows, in what order and with which photo. Anything left on Automatic keeps choosing for itself.</p>
        </div>
        <div className="head__actions"><a href="/" target="_blank" className="btn btn--ghost"><AdminIcon name="external" />View shop</a></div>
      </div>

      <div className="sc">
        <nav className="sc__nav" aria-label="Showcase sections">
          {PANELS.map((p, i) => (
            <div key={p.key} className="sc__navitem">
              {p.page !== PANELS[i - 1]?.page && <span className="sc__navpage">{SHOWCASE_PAGES[p.page].label}</span>}
              <button
                type="button" className={panel === p.key ? "active" : ""} onClick={() => setPanel(p.key)}
                aria-current={panel === p.key ? "true" : undefined}
              >
                <span>{p.label}{changed.includes(p.label) && <i className="sc__dot" title="Unsaved change" />}</span>
                <small className={statusOf(p) === "Auto" || statusOf(p) === "Original" ? "" : "on"}>{statusOf(p)}</small>
              </button>
            </div>
          ))}
        </nav>

        <div className="sc__panel" key={panel}>
          <Where
            page={current.page} marks={MARK[current.key] || [current.key]} href={pages[current.page]} dirty={dirty}
            spot={current.kind === "photos" ? "photo-hero" : current.key}
            note={current.key === "bag" ? "It appears once the bag has something in it" : current.key === "waiting" ? "The button opens your latest order to show it" : current.key === "related" ? "Shown on every product page; the button opens one of them" : ""}
          />
          {current.kind === "section" && (
            <SectionPanel
              id={panel} meta={SHOWCASE_SECTIONS[panel]} value={state.sections[panel]} preview={previews[panel]}
              byId={byId} live={live} onChange={(patch) => setSection(panel, patch)}
            />
          )}
          {current.kind === "photos" && (
            <PhotosPanel photos={state.photos} originals={originals} onChange={(key, url) => setState((s) => ({ ...s, photos: { ...s.photos, [key]: url } }))} />
          )}
          {current.kind === "gallery" && (
            <GalleryPanel
              chapters={chapters} gallery={state.gallery}
              onChange={(slug, ids) => setState((s) => {
                const gallery = { ...s.gallery };
                if (ids) gallery[slug] = ids; else delete gallery[slug];
                return { ...s, gallery };
              })}
            />
          )}
        </div>
      </div>

      <div className={`sc__bar ${dirty ? "on" : ""}`} role="region" aria-label="Unsaved changes" aria-hidden={!dirty}>
        <span><i aria-hidden />Unsaved: {changed.join(", ") || "changes"}</span>
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => setState(JSON.parse(saved))} disabled={pending} tabIndex={dirty ? 0 : -1}>Discard</button>
        <button type="button" className="btn btn--sm" onClick={save} disabled={pending} tabIndex={dirty ? 0 : -1}>{pending ? "Saving…" : "Save changes"}</button>
      </div>
      {toast && <div className="sc__toast" role="status">{toast}</div>}
    </>
  );
}

/** Automatic / Hand-picked switch. */
function ModeSwitch({ mode, onChange, label }) {
  return (
    <div className="seg sc__mode" role="radiogroup" aria-label={label}>
      <button type="button" role="radio" aria-checked={mode === "auto"} className={mode === "auto" ? "active" : ""} onClick={() => onChange("auto")}>Automatic</button>
      <button type="button" role="radio" aria-checked={mode === "pick"} className={mode === "pick" ? "active" : ""} onClick={() => onChange("pick")}>Hand-picked</button>
    </div>
  );
}

/** One product section: the rule it follows, or the owner's ordered picks with a photo choice each. */
function SectionPanel({ id, meta, value, preview, byId, live, onChange }) {
  const items = value.items.filter((i) => byId.has(i.id));
  const ids = items.map((i) => i.id);
  // why a pick would not show in the shop right now
  const skipped = (p) =>
    p.status !== "active" ? (p.status === "draft" ? "Draft: hidden" : "Archived: hidden")
    : p.stock === 0 ? "Sold out: skipped"
    : id === "sale" && !(p.off > 0) ? "Not on sale: skipped"
    : "";

  const setMode = (mode) => {
    // first switch to hand-picked starts from what the shop shows now, so nothing jumps
    if (mode === "pick" && !value.items.length && preview?.length) onChange({ mode, items: preview.map((pid) => ({ id: pid, photo: null })) });
    else onChange({ mode });
  };
  const pickerChange = (next) => {
    const kept = items.filter((i) => next.includes(i.id));
    const added = next.filter((pid) => !ids.includes(pid)).map((pid) => ({ id: pid, photo: null }));
    onChange({ items: [...kept, ...added] });
  };
  // exactly what the section will show once saved: the picks that can show, then automatic top-ups
  const showable = (p) => p && p.status === "active" && p.stock > 0 && (id !== "sale" || p.off > 0);
  const result = (() => {
    const chosen = items.map((i) => ({ p: byId.get(i.id), photo: i.photo })).filter((x) => showable(x.p));
    const extra = value.fill && preview
      ? preview.filter((pid) => !chosen.some((c) => c.p.id === pid)).map((pid) => ({ p: byId.get(pid), auto: true })).filter((x) => showable(x.p))
      : [];
    return [...chosen, ...extra].slice(0, meta.max);
  })();
  const patchItem = (pid, patch) => onChange({ items: items.map((i) => (i.id === pid ? { ...i, ...patch } : i)) });
  const move = (index, by) => {
    const to = index + by;
    if (to < 0 || to >= items.length) return;
    const next = [...items];
    [next[index], next[to]] = [next[to], next[index]];
    onChange({ items: next });
  };

  return (
    <section className="card sc__card" aria-labelledby={`sc-${id}`}>
      <div className="sc__head">
        <div>
          <h2 id={`sc-${id}`}>{meta.label}</h2>
          <p className="sub">{meta.where}</p>
        </div>
        <ModeSwitch mode={value.mode} onChange={setMode} label={`${meta.label}: how products are chosen`} />
      </div>

      {value.mode === "auto" ? (
        <div className="sc__auto">
          <p><AdminIcon name="zap" /><span><b>Automatic:</b> {meta.auto.charAt(0).toLowerCase() + meta.auto.slice(1)}. It updates by itself as products are added, sell out or go on sale.</span></p>
          {preview ? (
            <>
              <span className="sc__label">Showing now</span>
              {preview.length ? (
                <div className="sc__strip">
                  {preview.map((pid) => { const p = byId.get(pid); return p && <figure key={pid}>{p.image ? <img src={p.image} alt="" /> : <i />}<figcaption>{p.name}</figcaption></figure>; })}
                </div>
              ) : <p className="dim">Nothing right now{id === "sale" ? ": no product is on sale, so the section is hidden." : "."}</p>}
            </>
          ) : <p className="dim">What it shows depends on {id === "bag" ? "what is in each customer's bag" : "the product being viewed"}.</p>}
          {meta.note && <p className="hint">{meta.note}</p>}
        </div>
      ) : (
        <div className="sc__pick">
          <div className="sc__tools">
            <div className="sc__add"><ProductPicker products={live} selected={ids} onChange={pickerChange} chips={false} label="Add or remove products…" /></div>
            <span className={`sc__count ${items.length > meta.max ? "over" : ""}`}>{Math.min(items.length, meta.max)} of {meta.max} places</span>
          </div>
          {meta.note && <p className="hint" style={{ marginTop: 0 }}>{meta.note}</p>}

          <span className="sc__label">Customers will see{preview ? "" : " (before anything is left out for the page they are on)"}</span>
          {result.length ? (
            <div className="sc__strip sc__strip--result">
              {result.map(({ p, photo, auto }, n) => {
                const img = p.images.find((i) => i.id === photo) || p.images[0];
                return (
                  <figure key={p.id} className={auto ? "auto" : ""}>
                    <span className="sc__pos">{n + 1}</span>
                    {img ? <img src={img.thumb} alt="" /> : <i />}
                    <figcaption>{p.name}{auto && <em>Added automatically</em>}</figcaption>
                  </figure>
                );
              })}
            </div>
          ) : <p className="dim">Nothing would show: the section is hidden until something can be shown.</p>}

          <span className="sc__label">Your picks · drag or use the arrows to change the order</span>

          {items.length ? (
            <Reorder.Group axis="y" values={items} onReorder={(next) => onChange({ items: next })} className="sc__list">
              {items.map((item, i) => (
                <PickRow
                  key={item.id} item={item} index={i} p={byId.get(item.id)} over={i >= meta.max} why={skipped(byId.get(item.id))}
                  onPhoto={(photo) => patchItem(item.id, { photo })} onRemove={() => onChange({ items: items.filter((x) => x.id !== item.id) })}
                  onUp={() => move(i, -1)} onDown={() => move(i, 1)} last={i === items.length - 1}
                />
              ))}
            </Reorder.Group>
          ) : <div className="sc__empty"><AdminIcon name="box" /><p>No products picked yet. Use “Add or remove products” above.</p></div>}

          <label className="check sc__fill">
            <input type="checkbox" checked={value.fill} onChange={(e) => onChange({ fill: e.target.checked })} />
            <span>Fill empty places automatically<small>When picks sell out or there are fewer than {meta.max}, the shop tops the section up with its automatic choices.</small></span>
          </label>
        </div>
      )}
    </section>
  );
}

/** One hand-picked product: drag handle, chosen photo, the photos to choose from, move and remove. */
function PickRow({ item, index, p, over, why, onPhoto, onRemove, onUp, onDown, last }) {
  const drag = useDragControls();
  const photo = p.images.find((i) => i.id === item.photo) || p.images[0];
  return (
    <Reorder.Item
      value={item} dragListener={false} dragControls={drag} className={`sc__row ${over ? "is-over" : ""} ${why ? "is-skip" : ""}`}
      whileDrag={{ scale: 1.02, boxShadow: "0 18px 40px -18px rgba(0,0,0,.45)", zIndex: 5 }}
    >
      <button type="button" className="sc__grip" onPointerDown={(e) => drag.start(e)} aria-label={`Drag ${p.name} to reorder`}>
        <svg viewBox="0 0 24 24" aria-hidden><circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" /><circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" /><circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" /></svg>
      </button>
      <span className="sc__n">{index + 1}</span>
      {photo ? <img className="sc__thumb" src={photo.thumb} alt="" /> : <i className="sc__thumb" />}
      <div className="sc__info">
        <b>{p.name}</b>
        <small>{p.category}{over ? " · beyond the section's places, not shown" : ""}</small>
        {why && <span className="pill warn">{why}</span>}
        {p.images.length > 1 && (
          <div className="sc__photos" role="radiogroup" aria-label={`Photo used for ${p.name}`}>
            {p.images.map((img, n) => (
              <button
                key={img.id} type="button" role="radio" aria-checked={photo?.id === img.id} aria-label={`Photo ${n + 1}`}
                className={photo?.id === img.id ? "on" : ""} onClick={() => onPhoto(n === 0 ? null : img.id)}
              ><img src={img.thumb} alt="" /></button>
            ))}
          </div>
        )}
      </div>
      <div className="sc__acts">
        <button type="button" className="iconbtn" onClick={onUp} disabled={index === 0} aria-label="Move up"><AdminIcon name="up" /></button>
        <button type="button" className="iconbtn sc__down" onClick={onDown} disabled={last} aria-label="Move down"><AdminIcon name="up" /></button>
        <button type="button" className="iconbtn sc__x" onClick={onRemove} aria-label={`Remove ${p.name}`}><AdminIcon name="x" /></button>
      </div>
    </Reorder.Item>
  );
}

/** The three fixed photos: keep the original or upload a replacement. */
function PhotosPanel({ photos, originals, onChange }) {
  return (
    <section className="card sc__card">
      <div className="sc__head"><div><h2>Photos</h2><p className="sub">The big photos on the home page. Upload your own to replace the originals; they keep their shape.</p></div></div>
      <div className="sc__photogrid">
        {Object.entries(SHOWCASE_PHOTOS).map(([key, meta]) => (
          <PhotoSlot key={key} spot={`photo-${key}`} meta={meta} value={photos[key]} original={originals[key]} onChange={(url) => onChange(key, url)} />
        ))}
      </div>
    </section>
  );
}

function PhotoSlot({ spot, meta, value, original, onChange }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const input = useRef(null);
  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true); setError("");
    const fd = new FormData();
    fd.append("file", await shrinkImage(file, 2600));
    const res = await uploadShowcasePhotoAction(fd);
    setBusy(false);
    if (res.error) setError(res.error); else onChange(res.url);
  };
  return (
    <div className="sc__slot">
      <div className="sc__frame">
        <img src={value || original} alt="" />
        <span className={`sc__tag ${value ? "on" : ""}`}>{value ? "Your photo" : "Original"}</span>
        {busy && <span className="sc__busy">Uploading…</span>}
      </div>
      <b>{meta.label} <a className="link sc__showme" href={`/?showcase=${spot}`} target="_blank" rel="noopener">Show me</a></b>
      <small>{meta.where}</small>
      <small className="dim">{meta.shape}</small>
      <div className="inline" style={{ marginTop: 8 }}>
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => input.current?.click()} disabled={busy}>{value ? "Replace" : "Upload photo"}</button>
        {value && <button type="button" className="btn btn--danger btn--sm" onClick={() => onChange("")}>Use original</button>}
        <input ref={input} type="file" accept="image/*" hidden onChange={onFile} />
      </div>
      {error && <small style={{ color: "var(--bad)" }}>{error}</small>}
    </div>
  );
}

/** Gallery chapters: automatic (up to 3 photos per piece) or the owner's own photos in their order; the first is the cover. */
function GalleryPanel({ chapters, gallery, onChange }) {
  if (!chapters.length) return <section className="card sc__card"><p className="empty">No product photos yet. Add photos to products and the gallery builds itself.</p></section>;
  return chapters.map((c) => <Chapter key={c.slug} chapter={c} ids={gallery[c.slug] || null} onChange={(ids) => onChange(c.slug, ids)} />);
}

function Chapter({ chapter, ids, onChange }) {
  const photo = useMemo(() => new Map(chapter.photos.map((p) => [p.id, p])), [chapter.photos]);
  const picked = (ids || []).filter((id) => photo.has(id));
  const mode = ids ? "pick" : "auto";
  const toggle = (id) => onChange(picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id]);
  const autoIds = chapter.photos.filter((p) => p.auto).map((p) => p.id);

  return (
    <section className="card sc__card">
      <div className="sc__head">
        <div><h2>{chapter.name}</h2><p className="sub">{mode === "auto" ? `Automatic: up to 3 photos of each piece, ${autoIds.length} in all.` : `${picked.length} photos chosen. The first one is the chapter's cover.`}</p></div>
        <ModeSwitch mode={mode} onChange={(m) => onChange(m === "pick" ? autoIds : null)} label={`${chapter.name}: how photos are chosen`} />
      </div>
      {mode === "pick" && (
        <>
          <span className="sc__label">In the gallery · drag to reorder</span>
          {picked.length ? (
            <Reorder.Group axis="x" values={picked} onReorder={onChange} className="sc__film">
              {picked.map((id, i) => (
                <Reorder.Item key={id} value={id} className="sc__frameitem" whileDrag={{ scale: 1.06, zIndex: 5 }}>
                  <img src={photo.get(id).thumb} alt="" draggable={false} />
                  <span>{i === 0 ? "Cover" : i + 1}</span>
                  <button type="button" onClick={() => toggle(id)} aria-label="Remove from the gallery"><AdminIcon name="x" /></button>
                </Reorder.Item>
              ))}
            </Reorder.Group>
          ) : <p className="dim">No photos chosen: the chapter shows its automatic photos until you pick some.</p>}
          <span className="sc__label">All photos of this collection · tap to add or remove</span>
          <div className="sc__all">
            {chapter.photos.map((p) => {
              const at = picked.indexOf(p.id);
              return (
                <button key={p.id} type="button" className={at >= 0 ? "on" : ""} onClick={() => toggle(p.id)} aria-pressed={at >= 0} title={p.product}>
                  <img src={p.thumb} alt={p.product} />
                  {at >= 0 && <span>{at === 0 ? "Cover" : at + 1}</span>}
                </button>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
