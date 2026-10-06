"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { saveProductAction, uploadImageAction, deleteProductAction } from "@/lib/admin-actions";
import { ConfirmButton } from "./Widgets";
import { shrinkImage } from "./shrink";

const PRESETS = {
  "XS–XXL": ["XS", "S", "M", "L", "XL", "XXL"],
  "S–XL": ["S", "M", "L", "XL"],
  "Waist 28–38": ["28", "30", "32", "34", "36", "38"],
  "One size": ["One size"],
};

export default function ProductForm({ product, categories, subscribers, types = [] }) {
  const router = useRouter();
  const p = product || {};
  const [images, setImages] = useState(p.images?.map(({ url, thumb }) => ({ url, thumb })) || []);
  const [variants, setVariants] = useState(p.variants?.length ? p.variants.map((v) => ({ id: v.id, size: v.size, color: v.color || "", sku: v.sku, stock: v.on_hand ?? v.stock, reserved: v.reserved || 0 })) : [{ size: "", color: "", sku: "", stock: 0 }]);
  const [fit, setFit] = useState("cover");
  const [uploading, setUploading] = useState(0);
  const [message, setMessage] = useState(null);
  const [saving, start] = useTransition();
  const neverAnnounced = !p.announced_at;

  const upload = async (files) => {
    setMessage(null);
    for (const file of files) {
      setUploading((n) => n + 1);
      const fd = new FormData();
      fd.append("file", await shrinkImage(file));
      fd.append("fit", fit);
      const res = await uploadImageAction(fd);
      setUploading((n) => n - 1);
      if (res.error) setMessage({ bad: true, text: `${file.name}: ${res.error}` });
      else setImages((list) => [...list, { url: res.url, thumb: res.thumb }]);
    }
  };

  const move = (i, dir) => setImages((list) => {
    const next = [...list];
    const j = i + dir;
    if (j < 0 || j >= next.length) return list;
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });

  const setVariant = (i, patch) => setVariants((list) => list.map((v, k) => (k === i ? { ...v, ...patch } : v)));
  const applyPreset = (sizes) => setVariants((list) => sizes.map((size) => list.find((v) => v.size === size) || { size, color: "", sku: "", stock: 0 }));

  const submit = (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget));
    start(async () => {
      const res = await saveProductAction({
        ...f, id: p.id, images, variants,
        is_featured: f.is_featured === "on", announce: f.announce === "on",
      });
      if (res.error) return setMessage({ bad: true, text: res.error });
      setMessage({ text: res.announced ? `Saved. Announcement prepared for ${res.announced} subscriber messages.` : "Saved." });
      if (!p.id) router.push(`/admin/products/${res.id}`);
      else router.refresh();
    });
  };

  return (
    <>
      <form onSubmit={submit}>
        <div className="head">
          <div>
            <h1>{p.id ? p.name : "New product"}</h1>
            <p><Link href="/admin/products" className="link">← All products</Link>{p.id && p.status === "active" && <> · <Link href={`/products/${p.slug}`} target="_blank" className="link">View in shop ↗</Link></>}</p>
          </div>
          <div className="head__actions">
            <button className="btn" disabled={saving || uploading > 0}>{saving ? "Saving…" : "Save product"}</button>
          </div>
        </div>
        {message && <div className={`note ${message.bad ? "note--bad" : "note--ok"}`} role="status">{message.text}</div>}

        <div className="cols">
          <div>
            <div className="card">
              <h2>Details</h2>
              <div className="field"><label htmlFor="name">Product name</label><input id="name" name="name" required defaultValue={p.name} /></div>
              <div className="field"><label htmlFor="description">Description</label><textarea id="description" name="description" rows={4} defaultValue={p.description} /></div>
              <div className="frow">
                <div className="field"><label>Fabric</label><input name="fabric" defaultValue={p.fabric} placeholder="100% cotton" /></div>
                <div className="field"><label>Care</label><input name="care" defaultValue={p.care} placeholder="Machine wash cold" /></div>
                <div className="field"><label>Made in</label><input name="origin" defaultValue={p.origin} /></div>
              </div>
            </div>

            <div className="card">
              <h2>Photos</h2>
              <p className="sub">
                Upload any photo, straight from the phone or camera. It is automatically rotated, cropped to the shop's 4:5 format,
                resized to 1200×1500 and converted to a fast-loading WebP. The first photo is the main one.
              </p>
              <div className="inline" style={{ marginBottom: 12 }}>
                <span className="lbl" style={{ margin: 0 }}>When a photo is not 4:5:</span>
                <label className="check" style={{ margin: 0 }}><input type="radio" name="_fit" checked={fit === "cover"} onChange={() => setFit("cover")} /> Smart crop around the subject</label>
                <label className="check" style={{ margin: 0 }}><input type="radio" name="_fit" checked={fit === "contain"} onChange={() => setFit("contain")} /> Keep whole photo (add background)</label>
              </div>
              <div className="photos">
                {images.map((im, i) => (
                  <div className="photo" key={im.url}>
                    <img src={im.thumb} alt="" />
                    {i === 0 && <span>Main</span>}
                    <div className="photo__bar">
                      <button type="button" aria-label="Move left" onClick={() => move(i, -1)}>←</button>
                      <button type="button" aria-label="Remove photo" onClick={() => setImages((l) => l.filter((_, k) => k !== i))}>✕</button>
                      <button type="button" aria-label="Move right" onClick={() => move(i, 1)}>→</button>
                    </div>
                  </div>
                ))}
                <label className="drop">
                  {uploading ? `Processing ${uploading}…` : <>+ Add photos<br />(any size)</>}
                  <input type="file" accept="image/*" multiple onChange={(e) => { upload([...e.target.files]); e.target.value = ""; }} />
                </label>
              </div>
            </div>

            <div className="card">
              <h2>Sizes &amp; stock</h2>
              <p className="sub">One row per size. If the design comes in several colours, add a row for each size and colour; otherwise leave colour empty. Stock goes down by itself when an order is confirmed.</p>
              <div className="presets">
                {Object.entries(PRESETS).map(([label, sizes]) => (
                  <button type="button" key={label} className="btn btn--ghost btn--sm" onClick={() => applyPreset(sizes)}>{label}</button>
                ))}
              </div>
              <div className="vrow dim"><span>Size</span><span>Colour (optional)</span><span>SKU (optional)</span><span>On hand</span><span /></div>
              {variants.map((v, i) => (
                <div className="vrow" key={i}>
                  <input className="input" value={v.size} onChange={(e) => setVariant(i, { size: e.target.value })} placeholder="M" aria-label="Size" />
                  <input className="input" value={v.color || ""} onChange={(e) => setVariant(i, { color: e.target.value })} placeholder="Black" aria-label="Colour" list="colours" />
                  <input className="input" value={v.sku || ""} onChange={(e) => setVariant(i, { sku: e.target.value })} aria-label="SKU" />
                  <input className="input" type="number" min="0" value={v.stock} onChange={(e) => setVariant(i, { stock: e.target.value })} aria-label="Stock" />
                  <button type="button" className="x" aria-label="Remove size" onClick={() => setVariants((l) => l.filter((_, k) => k !== i))}>✕</button>
                </div>
              ))}
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setVariants((l) => [...l, { size: l.at(-1)?.size || "", color: "", sku: "", stock: 0 }])}>+ Add row</button>
              <datalist id="colours">{[...new Set(variants.map((v) => v.color).filter(Boolean))].map((c) => <option key={c} value={c} />)}</datalist>
              {variants.some((v) => v.reserved > 0) && <small className="hint">{variants.reduce((s, v) => s + (v.reserved || 0), 0)} of these pieces are reserved for orders waiting on customer confirmation.</small>}
            </div>
          </div>

          <div>
            <div className="card">
              <h2>Visibility</h2>
              <div className="field">
                <label htmlFor="status">Status</label>
                <select id="status" name="status" defaultValue={p.status || "draft"}>
                  <option value="draft">Draft (hidden)</option>
                  <option value="active">Active (in the shop)</option>
                  <option value="archived">Archived</option>
                </select>
              </div>
              <label className="check"><input type="checkbox" name="is_featured" defaultChecked={p.is_featured} /> Featured product</label>
              {neverAnnounced && (
                <label className="check">
                  <input type="checkbox" name="announce" />
                  <span>Announce as a new arrival to {subscribers} subscribers when active<small className="hint">Sends the “New arrival” message by email and WhatsApp.</small></span>
                </label>
              )}
            </div>
            <div className="card">
              <h2>Pricing</h2>
              <div className="field"><label htmlFor="price">Price</label><input id="price" name="price" type="number" min="0" required defaultValue={p.price} /></div>
              <div className="field">
                <label htmlFor="compare">Original price (optional)</label>
                <input id="compare" name="compare_at_price" type="number" min="0" defaultValue={p.compare_at_price || ""} />
                <small>Shown crossed out. For store-wide discounts use Offers &amp; sales instead.</small>
              </div>
              {p.off > 0 && <div className="note note--info" style={{ margin: 0 }}>Customers currently pay {p.final_price.toLocaleString("en-US")} ({p.off}% off{p.sale_name ? `, “${p.sale_name}”` : ""}).</div>}
            </div>
            <div className="card">
              <h2>Organisation</h2>
              <div className="field">
                <label htmlFor="category">Category</label>
                <select id="category" name="category_id" defaultValue={p.category_id || ""}>
                  <option value="">No category</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor="ptype">Type</label>
                <input id="ptype" name="product_type" list="ptypes" defaultValue={p.product_type || ""} placeholder="Shirt, Trouser, Jacket…" maxLength={40} />
                <datalist id="ptypes">{types.map((t) => <option key={t} value={t} />)}</datalist>
                <small>Used to group stock in Inventory. Pick an existing type or write a new one.</small>
              </div>
              <div className="field"><label>Badge (optional)</label><input name="badge" defaultValue={p.badge || ""} placeholder="New, Bestseller…" maxLength={20} /></div>
              <div className="field"><label>Low-stock alert at</label><input name="low_stock_threshold" type="number" min="0" defaultValue={p.low_stock_threshold ?? 3} /><small>You get an alert when a size drops to this number.</small></div>
              <div className="field"><label>Web address</label><input name="slug" defaultValue={p.slug} placeholder="made from the name" /></div>
            </div>
          </div>
        </div>
      </form>

      {p.id && (
        <form action={deleteProductAction} style={{ marginTop: 24 }}>
          <input type="hidden" name="id" value={p.id} />
          <ConfirmButton message={`Delete “${p.name}” permanently? Past orders keep their record. To just hide it, set the status to Archived instead.`} className="btn btn--danger">Delete product</ConfirmButton>
        </form>
      )}
    </>
  );
}
