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
  const { store, hero, shipping, orders, inventory, returns, crm, labels } = await getSettings();
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
              <Field name="change_hours" label="Hours to change or cancel after confirming" value={orders.change_hours} type="number" hint="Customers switch sizes, quantities or address, or cancel, from their order link until it is packed. 0 = not allowed" />
              <Field name="max_qty" label="Most pieces of one size per order" value={orders.max_qty} type="number" hint="Website orders. Stops one order reserving a whole size. 0 = no limit" />
              <Field name="max_pending" label="Unconfirmed orders per phone" value={orders.max_pending} type="number" hint="Fake orders hold stock: past this a number must confirm or cancel first. 0 = no limit" />
              <Field name="pack_hours" label="Late to dispatch after (hours)" value={orders.pack_hours} type="number" />
              <Field name="deliver_days" label="Late to deliver after (days)" value={orders.deliver_days} type="number" />
            </div>
            <Field name="policy" label="Policy text (shown at checkout and before confirming)" value={orders.policy} area />
            <Field name="returns" label="Exchange & returns text" value={orders.returns} area />
          </Group>
          <div id="returns">
            <Group id="returns" title="Returns & exchanges" sub="What customers can ask for from their order page. Faulty or wrong items are always accepted inside the window.">
              <div className="frow">
                <Field name="window_days" label="Days after delivery" value={returns.window_days} type="number" hint="How long customers can ask" />
                <Field name="complaint_hours" label="Flag complaints open after (hours)" value={returns.complaint_hours} type="number" />
              </div>
              <label className="check"><input type="checkbox" name="exchanges" defaultChecked={returns.exchanges} /> Exchanges for any reason (size, changed mind...)</label>
              <label className="check"><input type="checkbox" name="refunds" defaultChecked={returns.refunds} /> Refunds for any reason (off = refunds only for faults)</label>
              <label className="check"><input type="checkbox" name="sale_items" defaultChecked={returns.sale_items} /> Sale items can be exchanged or returned too</label>
              <div className="frow">
                <Field name="carrier" label="Who usually collects" value={returns.carrier} hint="Your rider, or the courier company you contract. You can change it on each pickup." />
                <Field name="exchange_fee" label={`Exchange delivery fee (${store.currency})`} value={returns.exchange_fee} type="number" hint="Charged when the customer chose to swap (size, changed mind). Faults are always free. 0 = always free." />
              </div>
              <Field name="instructions" label="Getting it ready for pickup (shown once a request is approved)" value={returns.instructions} area />
            </Group>
          </div>
          <div id="labels">
            <Group id="labels" title="Parcel slips & thank-you cards" sub="Printed from Orders (tick orders, or Print parcels). Every confirmed order gets its own tracking number for the slip, the QR and the dispatch message.">
              <div className="field">
                <label htmlFor="format">Paper</label>
                <select id="format" name="format" defaultValue={labels.format}>
                  <option value="a4">A4 sheet: slip on top, card below (any printer)</option>
                  <option value="thermal">4×6 inch labels (thermal label printer)</option>
                </select>
                <small>You can switch for a single print on the print page.</small>
              </div>
              <Field name="caution" label="Caution line for the courier" value={labels.caution} hint="Printed in a box on every slip. Leave empty to hide." />
              <div className="frow">
                <Field name="open_policy" label="Opening the parcel (optional)" value={labels.open_policy} hint="e.g. Parcel may be opened only after payment" />
                <Field name="weight_kg" label="Usual parcel weight in kg (optional)" value={labels.weight_kg} hint="Fills the courier file" />
              </div>
              <Field name="return_address" label="Return address (optional)" value={labels.return_address} hint="Leave empty to use the store address" />
              <Field name="couriers" label="Couriers you use" value={labels.couriers} hint="Comma separated. Suggested when you dispatch an order." />
              <label className="check"><input type="checkbox" name="card" defaultChecked={labels.card} /> Print a thank-you card with every slip</label>
              <label className="check"><input type="checkbox" name="care" defaultChecked={labels.care} /> A care tip for the piece on the card</label>
              <label className="check"><input type="checkbox" name="qr_updates" defaultChecked={labels.qr_updates} /> QR: get new arrivals and sales (one tap to subscribe)</label>
              <label className="check"><input type="checkbox" name="qr_feedback" defaultChecked={labels.qr_feedback} /> QR: rate the order</label>
              <Field name="card_message" label="Extra line on every card (optional)" value={labels.card_message} area hint="e.g. Tag us on Instagram @yourbrand to be featured" />
              <Field name="card_sign" label="Signature (optional)" value={labels.card_sign} hint={`Leave empty for "With love, ${/^the\s/i.test(store.name) ? "" : "the "}${store.name} team"`} />
              <div className="frow">
                <Field name="next_code_value" label="Next-order code value (0 = none)" value={labels.next_code_value} type="number" hint="A one-time code just for that customer" />
                <div className="field">
                  <label htmlFor="next_code_type">Code type</label>
                  <select id="next_code_type" name="next_code_type" defaultValue={labels.next_code_type}>
                    <option value="percent">Percent off</option>
                    <option value="fixed">{store.currency} off</option>
                  </select>
                </div>
              </div>
              <div className="frow">
                <Field name="next_code_days" label="Code valid for (days, 0 = no end)" value={labels.next_code_days} type="number" />
                <Field name="next_code_prefix" label="Code starts with" value={labels.next_code_prefix} hint="NEXT-7K3Q2" />
              </div>
            </Group>
          </div>
          <div id="loyalty">
            <Group id="crm" title="Loyalty & customer groups" sub="Points on delivered orders, reward codes, who counts as a VIP, and the automatic follow-ups. Set a number to 0 to switch that part off.">
              <div className="frow">
                <Field name="points_per_100" label={`Points per ${store.currency} 100`} value={crm.points_per_100} type="number" hint="Earned once an order is delivered" />
                <Field name="reward_points" label="Points for a reward" value={crm.reward_points} type="number" />
                <Field name="reward_value" label={`Reward worth (${store.currency})`} value={crm.reward_value} type="number" />
                <Field name="reward_days" label="Reward valid (days)" value={crm.reward_days} type="number" hint="0 = no end date" />
              </div>
              <div className="frow">
                <Field name="vip_spend" label={`VIP after spending (${store.currency})`} value={crm.vip_spend} type="number" />
                <Field name="vip_orders" label="…or after this many orders" value={crm.vip_orders} type="number" />
                <Field name="winback_days" label="At risk after (days without an order)" value={crm.winback_days} type="number" hint="Twice this = lost" />
              </div>
              <div className="frow">
                <Field name="feedback_days" label="Ask for a rating (days after delivery)" value={crm.feedback_days} type="number" />
                <Field name="reorder_days" label="Come-back reminder (days after last order)" value={crm.reorder_days} type="number" hint="Only to subscribers" />
              </div>
              <div className="frow">
                <Field name="cross_sell_days" label="“Goes with what you bought” (days after delivery)" value={crm.cross_sell_days} type="number" hint="One message per order, only to subscribers" />
                <Field name="birthday_value" label={`Birthday code worth (${store.currency})`} value={crm.birthday_value} type="number" hint="0 = wishes only, no code" />
              </div>
              <label className="check"><input type="checkbox" name="birthdays" defaultChecked={crm.birthdays} /> <span><b>Birthday wishes</b> to subscribers who added their birthday on their preferences page</span></label>
              <label className="check"><input type="checkbox" name="anniversaries" defaultChecked={crm.anniversaries} /> <span><b>Yearly thank-you</b> on the anniversary of a subscriber's first order</span></label>
            </Group>
          </div>
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
