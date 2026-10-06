"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  loginAction, setStockAction, processQueueAction, markMessageSentAction,
  sendCampaignAction, saveCategoryAction, uploadImageAction, uploadBannerAction,
} from "@/lib/admin-actions";
import { waLink } from "@/lib/format";
import { shrinkImage } from "./shrink";
import { CATEGORY_ICONS, IconGlyph, iconFor } from "../CategoryIcon";

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, null);
  return (
    <form action={action}>
      {state?.error && <div className="note note--bad">{state.error}</div>}
      <div className="field"><label htmlFor="email">Email</label><input id="email" name="email" type="email" required autoComplete="username" /></div>
      <div className="field"><label htmlFor="password">Password</label><input id="password" name="password" type="password" required autoComplete="current-password" /></div>
      <button className="btn" style={{ width: "100%" }} disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>
    </form>
  );
}

export function NavLink({ href, children, badge }) {
  const pathname = usePathname();
  const active = href === "/admin" ? pathname === href : pathname.startsWith(href);
  return <Link href={href} className={active ? "active" : ""}>{children}{badge > 0 && <i>{badge}</i>}</Link>;
}

/** A submit button that asks first. Put it inside a <form action={...}>. */
export function ConfirmButton({ message, className = "btn btn--danger btn--sm", children }) {
  return <button className={className} onClick={(e) => { if (!window.confirm(message)) e.preventDefault(); }}>{children}</button>;
}

/** Stock box on the inventory page: saves as soon as you leave the field. */
export function StockInput({ variantId, stock, lowAt, onSaved }) {
  const [value, setValue] = useState(String(stock));
  const [saved, setSaved] = useState(stock);
  const [flash, setFlash] = useState(false);

  const save = async () => {
    const n = Math.max(0, parseInt(value, 10) || 0);
    setValue(String(n));
    if (n === saved) return;
    const res = await setStockAction(variantId, n);
    if (res.ok) { setSaved(n); onSaved?.(n); setFlash(true); setTimeout(() => setFlash(false), 1200); }
    else { setValue(String(saved)); window.alert(res.error); }
  };

  return (
    <input
      className={`stock-input ${flash ? "saved" : saved <= lowAt ? "low" : ""}`} type="number" min="0" inputMode="numeric"
      value={value} onChange={(e) => setValue(e.target.value)} onBlur={save}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} aria-label="Stock"
    />
  );
}

/** Sends queued messages in small batches until the queue is empty (keeps each request short on serverless). */
export function SendQueueButton({ queued }) {
  const router = useRouter();
  const [left, setLeft] = useState(queued);
  const [running, setRunning] = useState(false);

  const run = async () => {
    setRunning(true);
    for (let i = 0; i < 200; i++) {
      const res = await processQueueAction();
      setLeft(res.remaining);
      if (!res.remaining || !res.processed) break;
    }
    setRunning(false);
    router.refresh();
  };

  if (!left && !running) return null;
  return <button className="btn" onClick={run} disabled={running}>{running ? `Sending… ${left} left` : `Send ${left} queued now`}</button>;
}

/** Opens WhatsApp with the message already typed, then marks it as sent. */
export function WhatsAppSend({ id, phone, body, small = true }) {
  const [done, setDone] = useState(false);
  if (done) return <span className="pill ok">Sent</span>;
  return (
    <a
      className={`btn btn--wa ${small ? "btn--sm" : ""}`} href={waLink(phone, body)} target="_blank" rel="noopener noreferrer"
      onClick={() => { setDone(true); markMessageSentAction(id); }}
    >
      Send on WhatsApp
    </a>
  );
}

export function CampaignForm({ audience, channels }) {
  const [state, action, pending] = useActionState(sendCampaignAction, null);
  const router = useRouter();
  useEffect(() => { if (state?.ok) router.refresh(); }, [state, router]);
  return (
    <form action={action}>
      {state?.error && <div className="note note--bad">{state.error}</div>}
      {state?.ok && <div className="note note--ok">Campaign created: {state.recipients} messages prepared. Emails send automatically; WhatsApp messages without the API wait in Messages for one-click sending.</div>}
      <div className="field"><label>Campaign name (only you see this)</label><input name="name" required placeholder="Eid collection launch" /></div>
      <div className="field"><label>Email subject</label><input name="subject" placeholder="The Eid collection is here" /></div>
      <div className="field">
        <label>Message</label>
        <textarea name="body" required rows={7} defaultValue={"Hi {{name}},\n\n\n\nShop now: {{url}}"} />
        <small>You can use <code>{"{{name}}"}</code>, <code>{"{{store}}"}</code> and <code>{"{{url}}"}</code> (link to your shop).</small>
      </div>
      <label className="check"><input type="checkbox" name="email" defaultChecked /> Email ({audience.email} subscribers){!channels.email && " · email is not connected yet"}</label>
      <label className="check"><input type="checkbox" name="whatsapp" defaultChecked /> WhatsApp ({audience.whatsapp} subscribers)</label>
      <button className="btn" disabled={pending}>{pending ? "Preparing…" : "Send campaign"}</button>
    </form>
  );
}

/** One upload box that returns a standardised image URL (used for category pictures). */
export function ImageField({ name, value: initial, label }) {
  const [value, setValue] = useState(initial || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true); setError("");
    const fd = new FormData();
    fd.append("file", await shrinkImage(file));
    const res = await uploadImageAction(fd);
    setBusy(false);
    if (res.error) setError(res.error); else setValue(res.url);
    e.target.value = "";
  };

  return (
    <div className="field">
      <label>{label}</label>
      <div className="inline">
        {value && <img src={value} alt="" style={{ width: 48, height: 60, objectFit: "cover", borderRadius: 4 }} />}
        <label className="btn btn--ghost btn--sm filebtn">
          {busy ? "Processing…" : value ? "Replace photo" : "Upload photo"}
          <input type="file" accept="image/*" hidden onChange={onFile} disabled={busy} />
        </label>
        {value && <button type="button" className="btn btn--danger btn--sm" onClick={() => setValue("")}>Remove</button>}
      </div>
      <input type="hidden" name={name} value={value} />
      {error && <small style={{ color: "var(--accent)" }}>{error}</small>}
    </div>
  );
}

export function CategoryForm({ category }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const c = category || {};
  const [icon, setIcon] = useState(c.icon || "");
  const [name, setName] = useState(c.name || "");
  const guess = iconFor(name, "");

  const submit = (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const f = Object.fromEntries(new FormData(form));
    start(async () => {
      const res = await saveCategoryAction({ ...f, id: c.id, icon, is_active: f.is_active === "on" });
      if (res.error) return setError(res.error);
      setError("");
      if (!c.id) { form.reset(); setName(""); setIcon(""); }
      router.refresh();
    });
  };

  return (
    <form onSubmit={submit}>
      {error && <div className="note note--bad">{error}</div>}
      <div className="frow">
        <div className="field"><label>Name</label><input name="name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Winter" /></div>
        <div className="field"><label>Position</label><input name="sort_order" type="number" defaultValue={c.sort_order ?? 0} /></div>
      </div>
      <div className="field"><label>Short description</label><input name="description" defaultValue={c.description} /></div>
      <div className="field">
        <label>Emblem (shown on the shop's collection bar)</label>
        <div className="iconpick" role="radiogroup" aria-label="Emblem">
          <button type="button" role="radio" aria-checked={icon === ""} className={`iconpick__auto ${icon === "" ? "active" : ""}`} onClick={() => setIcon("")} title="Choose for me">
            {guess ? <IconGlyph name={guess} /> : name.trim() ? <b>{name.trim().charAt(0).toUpperCase()}</b> : null}
            <span>Auto</span>
          </button>
          {Object.entries(CATEGORY_ICONS).map(([key, { label }]) => (
            <button type="button" role="radio" key={key} aria-checked={icon === key} aria-label={label} title={label} className={icon === key ? "active" : ""} onClick={() => setIcon(key)}>
              <IconGlyph name={key} />
            </button>
          ))}
        </div>
        <small>“Auto” picks an emblem from the name, or uses its first letter.</small>
      </div>
      <ImageField name="image_url" value={c.image_url} label="Picture (shown on the home page)" />
      <label className="check"><input type="checkbox" name="is_active" defaultChecked={c.is_active ?? true} /> Show in the shop</label>
      <button className="btn btn--sm" disabled={pending}>{pending ? "Saving…" : c.id ? "Save changes" : "Add category"}</button>
    </form>
  );
}

/** Multi-photo upload for banners. Reports what each photo was detected as. */
export function BannerUploader({ placement }) {
  const router = useRouter();
  const [log, setLog] = useState([]);
  const [busy, setBusy] = useState(0);
  const LABEL = { desktop: "wide, used on desktop", mobile: "tall, used on phones", both: "square-ish, used on both" };

  const onFiles = async (e) => {
    const files = [...e.target.files];
    e.target.value = "";
    for (const file of files) {
      setBusy((n) => n + 1);
      const fd = new FormData();
      fd.append("file", await shrinkImage(file, 2600));
      fd.append("placement", placement);
      const res = await uploadBannerAction(fd);
      setBusy((n) => n - 1);
      setLog((l) => [{ name: file.name, text: res.error || `${res.width}×${res.height}: ${LABEL[res.device]}`, bad: Boolean(res.error) }, ...l]);
    }
    router.refresh();
  };

  return (
    <>
      <label className="drop" style={{ aspectRatio: "auto", padding: 28 }}>
        {busy ? `Processing ${busy}…` : <>+ Choose photos<br />(wide and tall, any size)</>}
        <input type="file" accept="image/*" multiple onChange={onFiles} disabled={busy > 0} />
      </label>
      {log.map((l, i) => (
        <div key={i} className={`note ${l.bad ? "note--bad" : "note--ok"}`} style={{ margin: "10px 0 0" }}><b>{l.name}</b><br />{l.text}</div>
      ))}
    </>
  );
}
