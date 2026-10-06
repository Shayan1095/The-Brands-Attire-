import { requirePerm } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { saveSettingsAction } from "@/lib/admin-actions";
import { IMAGE_STANDARD } from "@/lib/images";

export const metadata = { title: "Settings" };

const Field = ({ name, label, value, hint, type = "text", area }) => (
  <div className="field">
    <label htmlFor={name}>{label}</label>
    {area ? <textarea id={name} name={name} defaultValue={value} rows={3} /> : <input id={name} name={name} type={type} defaultValue={value} />}
    {hint && <small>{hint}</small>}
  </div>
);

export default async function Settings({ searchParams }) {
  const viewer = await requirePerm("settings");
  const { saved } = await searchParams;
  const { store, hero, shipping, orders, inventory } = await getSettings();
  const Group = ({ id, title, sub, children }) => (
    <form className="card" action={saveSettingsAction}>
      <input type="hidden" name="_key" value={id} />
      <h2>{title} {saved === id && <span className="pill ok">Saved</span>}</h2>
      <p className="sub">{sub}</p>
      {children}
      <button className="btn btn--sm">Save</button>
    </form>
  );

  return (
    <>
      <div className="head"><div><h1>Settings</h1><p>Change the shop without touching any code.</p></div></div>
      <div className="cols cols--even">
        <div>
          <Group id="store" title="Store details" sub="Shown in the header, footer, contact page and in every message.">
            <Field name="name" label="Store name" value={store.name} />
            <Field name="tagline" label="Tagline" value={store.tagline} area />
            <div className="frow">
              <Field name="currency" label="Currency symbol" value={store.currency} />
              <Field name="country_code" label="Phone country code" value={store.country_code} hint="92 for Pakistan" />
              <Field name="timezone" label="Timezone" value={store.timezone} />
            </div>
            <div className="frow">
              <Field name="whatsapp" label="WhatsApp number" value={store.whatsapp} hint="With country code, digits only" />
              <Field name="phone" label="Phone (optional)" value={store.phone} />
            </div>
            <Field name="email" label="Public email" value={store.email} hint="Owner alerts also go here unless OWNER_EMAIL is set." />
            <Field name="address" label="Address (optional)" value={store.address} />
            <Field name="hours" label="Opening hours" value={store.hours} />
            <div className="frow">
              <Field name="instagram" label="Instagram link" value={store.instagram} />
              <Field name="facebook" label="Facebook link" value={store.facebook} />
            </div>
          </Group>
        </div>
        <div>
          <Group id="hero" title="Home page banner" sub="The big picture and headline at the top of the home page.">
            <Field name="eyebrow" label="Small line above the headline" value={hero.eyebrow} />
            <Field name="title" label="Headline" value={hero.title} hint="Put *stars* around the word you want in red." />
            <Field name="subtitle" label="Text under the headline" value={hero.subtitle} area />
            <Field name="image" label="Background picture (link)" value={hero.image} hint="Wide photo, at least 2000px across." />
            <Field name="ticker" label="Moving banner text" value={hero.ticker} hint="Separate each phrase with a dot ·" />
            <div className="frow">
              <Field name="cta_text" label="Button text" value={hero.cta_text} />
              <Field name="cta_link" label="Button link" value={hero.cta_link} />
            </div>
          </Group>
          <Group id="shipping" title="Delivery" sub="Used at checkout and shown across the shop.">
            <div className="frow">
              <Field name="fee" label={`Delivery fee (${store.currency})`} value={shipping.fee} type="number" />
              <Field name="free_over" label="Free delivery over" value={shipping.free_over} type="number" hint="0 = never free" />
              <Field name="eta" label="Delivery time" value={shipping.eta} />
            </div>
          </Group>
          <Group id="orders" title="Order confirmation policy" sub="Protects you from cancelled parcels: customers must confirm before you ship.">
            <div className="frow">
              <Field name="reminder_hours" label="Remind after (hours)" value={orders.reminder_hours} type="number" hint="0 = no reminder" />
              <Field name="auto_cancel_hours" label="Auto-cancel after (hours)" value={orders.auto_cancel_hours} type="number" hint="Also how long stock stays reserved. 0 = never" />
            </div>
            <div className="frow">
              <Field name="duplicate_hours" label="Duplicate window (hours)" value={orders.duplicate_hours} type="number" hint="Same phone + same item within this time is flagged" />
              <Field name="pack_hours" label="Late to dispatch after (hours)" value={orders.pack_hours} type="number" />
              <Field name="deliver_days" label="Late to deliver after (days)" value={orders.deliver_days} type="number" />
            </div>
            <Field name="policy" label="Policy text (shown at checkout and before confirming)" value={orders.policy} area />
            <Field name="returns" label="Exchange & returns text" value={orders.returns} area />
          </Group>
          <Group id="inventory" title="Stock planning" sub="Used for restock suggestions in Inventory → Insights.">
            <div className="frow">
              <Field name="lead_days" label="Supplier lead time (days)" value={inventory.lead_days} type="number" hint="From ordering to stock arriving" />
              <Field name="cover_days" label="Each reorder should last (days)" value={inventory.cover_days} type="number" />
            </div>
          </Group>
          <div className="card">
            <h2>Photo standard</h2>
            <p className="sub" style={{ marginBottom: 0 }}>
              Every uploaded photo is converted to {IMAGE_STANDARD.width}×{IMAGE_STANDARD.height} WebP (4:5) plus a {IMAGE_STANDARD.thumbWidth}×{IMAGE_STANDARD.thumbHeight} thumbnail.
              Stored in {process.env.BLOB_READ_WRITE_TOKEN ? "Vercel Blob" : "the local uploads folder (development only)"}.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
