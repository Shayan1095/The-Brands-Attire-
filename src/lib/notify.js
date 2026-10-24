import "server-only";
import nodemailer from "nodemailer";
import { after } from "next/server";
import { query } from "./db";
import { getSettings, siteUrl } from "./settings";
import { money } from "./format";

/*
  Automated messages.
  Each event has a default template; the owner can edit the text and switch channels
  on/off in Admin -> Automations (saved in settings.automations[event]).
  `params` is the order of variables passed to a WhatsApp Cloud API template ({{1}}, {{2}}, ...).
*/
export const EVENTS = {
  order_placed: {
    label: "Order received - ask the customer to confirm",
    group: "Orders",
    params: ["name", "order_number", "total", "order_url"],
    subject: "Please confirm your order {{order_number}}",
    body: `Hi {{name}},

Thank you for your order {{order_number}} at {{store}}.

{{items}}
Total: {{total}} (cash on delivery)

Please confirm your order so we can dispatch it:
{{order_url}}

Important: {{policy}}`,
  },
  confirm_reminder: {
    label: "Reminder - order still not confirmed",
    group: "Orders",
    params: ["name", "order_number", "order_url"],
    subject: "Reminder: confirm your order {{order_number}}",
    body: `Hi {{name}},

Your order {{order_number}} ({{total}}) is still waiting for your confirmation. We are holding the items for you.

Confirm here: {{order_url}}

Unconfirmed orders are released automatically.`,
  },
  order_confirmed: {
    label: "Order confirmed",
    group: "Orders",
    params: ["name", "order_number", "total"],
    subject: "Order {{order_number}} confirmed",
    body: `Hi {{name}},

Your order {{order_number}} is confirmed. Please keep {{total}} ready for cash on delivery.
{{change_note}}
Track it any time: {{order_url}}`,
  },
  order_shipped: {
    label: "Order shipped",
    group: "Orders",
    params: ["name", "order_number", "courier", "tracking"],
    subject: "Order {{order_number}} is on its way",
    body: `Hi {{name}},

Good news - your order {{order_number}} has been handed to {{courier}}.
Tracking number: {{tracking}}
Follow it live: {{tracking_url}}

Amount to pay on delivery: {{total}}
Order details: {{order_url}}`,
  },
  order_delivered: {
    label: "Order delivered - thank you",
    group: "Orders",
    params: ["name", "order_number"],
    subject: "Your order {{order_number}} was delivered",
    body: `Hi {{name}},

Your order {{order_number}} has been delivered. We hope you love it!

If anything is not right, just reply to this message and we will sort it out.

- {{store}}`,
  },
  order_cancelled: {
    label: "Order cancelled",
    group: "Orders",
    params: ["name", "order_number", "reason"],
    subject: "Order {{order_number}} was cancelled",
    body: `Hi {{name}},

Your order {{order_number}} has been cancelled. {{reason}}

You can place a new order any time: {{url}}`,
  },
  subscribe_confirm: {
    label: "Confirm a newsletter sign-up",
    group: "Marketing",
    params: ["name", "confirm_url"],
    subject: "Please confirm: new arrivals and sales from {{store}}",
    body: `Hi {{name}},

Someone (hopefully you) asked to get new arrivals and sales from {{store}} at this address. Tap to confirm:
{{confirm_url}}

If it was not you, ignore this message and you will not hear from us.`,
  },
  case_opened: {
    label: "Return / exchange / complaint received",
    group: "Returns",
    params: ["name", "case_number", "order_number"],
    subject: "We received your request {{case_number}}",
    body: `Hi {{name}},

We received your {{type}} request {{case_number}} for order {{order_number}}. Our team will review it and reply shortly.

Follow it here: {{order_url}}`,
  },
  case_approved: {
    label: "Return or exchange approved - we will collect it",
    group: "Returns",
    params: ["name", "case_number", "order_url"],
    subject: "Your {{type}} {{case_number}} is approved",
    body: `Hi {{name}},

Your {{type}} {{case_number}} is approved. {{note}}

{{instructions}} We will message you the day of the pickup.

Follow it here: {{order_url}}`,
  },
  case_pickup: {
    label: "Pickup booked for a return or exchange",
    group: "Returns",
    params: ["name", "case_number", "when", "how"],
    subject: "Pickup for {{case_number}}: {{when}}",
    body: `Hi {{name}},

{{how}}

When: {{when}}
Please keep the piece ready, unworn with its tags on.

Follow it here: {{order_url}}`,
  },
  staff_case_assigned: {
    label: "Tell a staff member when a return or exchange is assigned to them",
    group: "Owner alerts",
    owner: true, staff: true,
    subject: "{{case_number}} was assigned to you",
    body: `Hi {{staff}},

{{by}} assigned the {{type}} {{case_number}} ({{customer}}) to you.

Open it: {{admin_url}}`,
  },
  case_rejected: {
    label: "Return or exchange declined",
    group: "Returns",
    params: ["name", "case_number", "note"],
    subject: "About your request {{case_number}}",
    body: `Hi {{name}},

We are sorry, we could not accept your {{type}} request {{case_number}}. {{note}}

If you think this is a mistake, reply to this message and we will look again.`,
  },
  case_received: {
    label: "Returned piece collected",
    group: "Returns",
    params: ["name", "case_number"],
    subject: "We have collected your piece ({{case_number}})",
    body: `Hi {{name}},

Our team has collected the piece for {{case_number}} and checked it. We are now arranging the next step and will update you shortly.`,
  },
  case_resolved: {
    label: "Return, exchange or complaint resolved",
    group: "Returns",
    params: ["name", "case_number", "note"],
    subject: "Your request {{case_number}} is resolved",
    body: `Hi {{name}},

Your {{type}} {{case_number}} is resolved. {{note}}

Thank you for your patience.
- {{store}}`,
  },
  feedback_request: {
    label: "Ask for feedback a few days after delivery",
    group: "Retention",
    params: ["name", "order_number", "url"],
    subject: "How was your order {{order_number}}?",
    body: `Hi {{name}},

How is everything from order {{order_number}}? It takes ten seconds to tell us:
{{url}}

If something is not right, the same link gets it to our team straight away.`,
  },
  repeat_reminder: {
    label: "Come-back reminder for subscribed customers",
    group: "Retention",
    marketing: true,
    params: ["name", "picks", "url"],
    subject: "New for you at {{store}}",
    body: `Hi {{name}},

It has been a little while. Based on what you bought before, we think you will like these:

{{picks}}
See them here: {{url}}`,
  },
  cross_sell: {
    label: "Goes with what you bought (a couple of weeks after delivery)",
    group: "Retention",
    marketing: true,
    params: ["name", "bought", "pick", "url"],
    subject: "Goes with your {{bought}}",
    body: `Hi {{name}},

We hope you are enjoying your {{bought}}. If you would like to complete the look, the {{pick}} goes well with it and is in stock now:
{{url}}`,
  },
  birthday_wish: {
    label: "Birthday wishes (customers who added their birthday)",
    group: "Retention",
    marketing: true,
    params: ["name", "gift"],
    subject: "Happy birthday from {{store}}",
    body: `Hi {{name}},

Happy birthday from all of us at {{store}}! {{gift}}

Have a wonderful day.`,
  },
  order_anniversary: {
    label: "Yearly thank-you on the anniversary of the first order",
    group: "Retention",
    marketing: true,
    params: ["name", "years", "url"],
    subject: "{{years}} with {{store}}",
    body: `Hi {{name}},

It has been {{years}} since your first order with us. Thank you for being part of {{store}}.

Here is what is new: {{url}}`,
  },
  loyalty_reward: {
    label: "Loyalty reward code earned",
    group: "Retention",
    marketing: true,
    params: ["name", "code", "value", "expires"],
    subject: "You earned a reward at {{store}}",
    body: `Hi {{name}},

Thank you for shopping with us. Your points have turned into a reward: use code {{code}} for {{value}} off your next order (valid until {{expires}}).

Shop now: {{url}}`,
  },
  cart_reminder: {
    label: "Unfinished bag - remind customers who agreed to be contacted",
    group: "Orders",
    params: ["name", "url"],
    subject: "You left something in your bag",
    body: `Hi {{name}},

You started an order at {{store}} and did not finish it. These are still available:

{{items}}
{{offer}}
Finish your order here: {{url}}

Reply STOP and we will not remind you again.`,
  },
  cart_reminder_last: {
    label: "Unfinished bag - the last reminder, a day later",
    group: "Orders",
    params: ["name", "url"],
    subject: "Last call: your bag at {{store}}",
    body: `Hi {{name}},

Your bag is still waiting, but we cannot hold the pieces much longer:

{{items}}
{{offer}}
Finish your order: {{url}}

This is the last reminder we will send about it.`,
  },
  account_welcome: {
    label: "New account - welcome and the first-order code",
    group: "Retention",
    params: ["name", "code", "percent", "days"],
    subject: "Welcome to {{store}}: {{percent}} off your first order",
    body: `Hi {{name}},

Welcome to {{store}}! Your account is ready.

Here is {{percent}} off your first order: use code {{code}} at checkout (valid for {{days}} days, with the phone or email of your account).

Start shopping: {{url}}`,
  },
  account_reset: {
    label: "Account - reset the password",
    group: "Retention",
    params: ["name", "url"],
    subject: "Reset your password at {{store}}",
    body: `Hi {{name}},

Someone (hopefully you) asked to reset the password of your {{store}} account. Choose a new one here (the link works for an hour):
{{url}}

If it was not you, ignore this message: your password stays the same.`,
  },
  back_in_stock: {
    label: "Back in stock - tell customers who asked",
    group: "Stock",
    params: ["product", "size", "url"],
    subject: "{{product}} is back in stock",
    body: `Good news! {{product}} in size {{size}} is back in stock at {{store}}.

Get it before it sells out again: {{url}}`,
  },
  new_arrival: {
    label: "New arrival announcement (to subscribers)",
    group: "Marketing",
    marketing: true,
    params: ["name", "product", "price", "url"],
    subject: "Just landed: {{product}}",
    body: `Hi {{name}},

New at {{store}}: {{product}} - {{price}}.

See it first: {{url}}`,
  },
  sale_started: {
    label: "Sale / offer announcement (to subscribers)",
    group: "Marketing",
    marketing: true,
    params: ["name", "sale", "percent", "url"],
    subject: "{{sale}}: {{percent}}% off",
    body: `Hi {{name}},

{{sale}} is live at {{store}} - {{percent}}% off{{ends}}.

Shop the offer: {{url}}`,
  },
  broadcast: {
    label: "Custom campaign (WhatsApp template settings only)",
    group: "Marketing",
    marketing: true,
    templateOnly: true,
    params: ["name", "message"],
    subject: "",
    body: "",
  },
  order_changed: {
    label: "Order changed by the customer",
    group: "Orders",
    params: ["name", "order_number", "total"],
    subject: "Your order {{order_number}} is updated",
    body: `Hi {{name}},

Your changes to order {{order_number}} are saved. It now holds:
{{items}}
New total to pay on delivery: {{total}}

See it any time: {{order_url}}`,
  },
  owner_order_changed: {
    label: "Tell me when a customer changes a confirmed order",
    group: "Owner alerts",
    owner: true,
    subject: "{{name}} changed order {{order_number}}",
    body: `{{name}} ({{phone}}) changed confirmed order {{order_number}} from their order link:
{{change}}

It now holds:
{{items}}
Total: {{total}}

Open in admin: {{admin_url}}`,
  },
  owner_new_order: {
    label: "Tell me when a new order comes in",
    group: "Owner alerts",
    owner: true,
    subject: "New order {{order_number}} - {{total}}",
    body: `New order {{order_number}} from {{name}} ({{phone}}, {{city}}).

{{items}}
Total: {{total}}

Open in admin: {{admin_url}}`,
  },
  staff_assigned: {
    label: "Tell a staff member when an order is assigned to them",
    group: "Owner alerts",
    owner: true, staff: true,
    subject: "Order {{order_number}} was assigned to you",
    body: `Hi {{name}},

{{by}} assigned order {{order_number}} ({{customer}}) to you.

Open it: {{admin_url}}`,
  },
  owner_chat_waiting: {
    label: "Tell me when a customer chat needs a person",
    group: "Owner alerts",
    owner: true,
    subject: "A customer is waiting for a reply ({{channel}})",
    body: `{{customer}} needs a person on {{channel}}.

Why: {{reason}}
Last message: "{{message}}"

Reply from the inbox: {{admin_url}}`,
  },
  owner_new_case: {
    label: "Tell me when a return, exchange or complaint comes in",
    group: "Owner alerts",
    owner: true,
    subject: "New {{type}} {{case_number}} ({{reason}})",
    body: `{{customer}} opened a {{type}} for order {{order_number}}.

Reason: {{reason}}
{{details}}

Review it: {{admin_url}}`,
  },
  owner_briefing: {
    label: "Morning briefing (from the Daily briefing agent)",
    group: "Owner alerts",
    owner: true,
    subject: "Your morning briefing: {{date}}",
    body: "{{briefing}}",
  },
  owner_low_stock: {
    label: "Tell me when stock runs low",
    group: "Owner alerts",
    owner: true,
    subject: "Low stock: {{product}} ({{size}})",
    body: `{{product}} in size {{size}} is down to {{stock}} left.

Restock in admin: {{admin_url}}`,
  },
};

/** Template + toggles for an event after applying the owner's edits. */
export function automation(settings, event) {
  const base = EVENTS[event];
  const saved = settings.automations?.[event] || {};
  return {
    email: saved.email ?? true,
    whatsapp: saved.whatsapp ?? !base.owner,
    subject: saved.subject || base.subject,
    body: saved.body || base.body,
    wa_template: saved.wa_template || "",
  };
}

export const render = (tpl, vars) => String(tpl).replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => (vars[k] ?? "").toString());

// LOCAL_DB=1 is a sandbox: test orders made locally never email or message real people
const sandbox = () => process.env.LOCAL_DB === "1";

export const channelStatus = () => ({
  email: !sandbox() && Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS),
  whatsapp: !sandbox() && Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID),
});

/** Until when a confirmed order may still be changed or cancelled by the customer (null = not any more). */
export function changeUntil(order, settings) {
  const hours = Number(settings.orders.change_hours) || 0;
  if (!hours || order.status !== "confirmed" || !order.confirmed_at) return null;
  const until = new Date(new Date(order.confirmed_at).getTime() + hours * 3600000);
  return until > new Date() ? until : null;
}

/** Variables available to every order message. */
export function orderVars(order, items, settings) {
  const cur = settings.store.currency;
  return {
    name: order.customer_name.split(" ")[0],
    phone: order.phone,
    city: order.city,
    order_number: order.number,
    total: money(order.total, cur),
    items: items.map((i) => `• ${i.name} (${i.size}) × ${i.qty} - ${money(i.unit_price * i.qty, cur)}`).join("\n") + "\n",
    order_url: `${siteUrl()}/order/${order.token}`,
    admin_url: `${siteUrl()}/admin/orders/${order.id}`,
    courier: order.courier || "our courier",
    // the courier's number once there is one, otherwise our own (it works on our tracking page)
    tracking: order.tracking_number || order.ref || "-",
    tracking_url: order.ref ? `${siteUrl()}/track/${order.ref}` : `${siteUrl()}/order/${order.token}`,
    reason: order.cancel_reason || "",
    policy: settings.orders.policy,
    // the window after confirming in which the customer may still change or cancel (Settings -> Orders)
    change_note: (() => {
      const until = changeUntil(order, settings);
      return until ? `You can still change sizes, quantities or the delivery address, or cancel, from your order link until ${new Intl.DateTimeFormat("en-GB", { timeZone: settings.store.timezone, weekday: "short", hour: "numeric", minute: "2-digit" }).format(until)}.\n` : "";
    })(),
  };
}

async function insertMessages(rows) {
  if (!rows.length) return;
  await query(
    `INSERT INTO messages (channel, recipient, contact_id, kind, subject, body, meta, order_id, campaign_id, status)
     SELECT channel, recipient, contact_id, kind, subject, body, COALESCE(meta, '{}'::jsonb), order_id, campaign_id, status
     FROM jsonb_to_recordset($1::jsonb) AS x(channel text, recipient text, contact_id int, kind text, subject text, body text, meta jsonb, order_id int, campaign_id int, status text)`,
    [JSON.stringify(rows)]
  );
}

// messages the scheduled job sends to many customers by itself
const AUTO_BULK = new Set(["cart_reminder", "cart_reminder_last", "repeat_reminder", "feedback_request", "cross_sell", "order_anniversary"]);

/** Builds the outbox rows for one recipient on the enabled channels. */
function compose(settings, event, { email, phone, contactId = null, vars, orderId = null, campaignId = null, template }) {
  const cfg = { ...automation(settings, event), ...template };
  const def = EVENTS[event];
  const all = { store: settings.store.name, url: siteUrl(), ...vars };
  const body = render(cfg.body, all).replace(/\r?\n[ \t]*(\r?\n[ \t]*){2,}/g, "\n\n").trim(); // an empty optional line leaves no gap
  const rows = [];
  const common = { contact_id: contactId, kind: event, order_id: orderId, campaign_id: campaignId };

  if (cfg.email && email) {
    rows.push({ ...common, channel: "email", recipient: email, subject: render(cfg.subject, all), body, meta: { unsubscribe: all.unsubscribe_url || null }, status: "queued" });
  }
  const viaApi = channelStatus().whatsapp && cfg.wa_template;
  if (cfg.whatsapp && phone) {
    rows.push({
      ...common, channel: "whatsapp", recipient: phone, subject: "", body,
      meta: viaApi ? { template: cfg.wa_template, params: (def.params || []).map((k) => String(all[k] ?? "")) } : {},
      // without the WhatsApp API the owner sends it with one click from the panel
      status: viaApi ? "queued" : "manual",
    });
  }
  return rows;
}

/** The email of the owner's admin account (the first one), for owner alerts when no address is set. */
async function ownerLogin() {
  const [row] = await query("SELECT email FROM admins WHERE role = 'owner' AND is_active ORDER BY id LIMIT 1");
  return row?.email || null;
}

/** Queue the automated message for an event (transactional or owner alert). */
export async function notify(event, { email, phone, contactId, vars = {}, orderId } = {}) {
  const settings = await getSettings();
  if (EVENTS[event].owner) {
    // owner alerts go to the store's address; staff alerts go to the staff member passed in.
    // With neither OWNER_EMAIL nor a store email set, they go to the owner's own login, never nowhere.
    if (!EVENTS[event].staff) email = process.env.OWNER_EMAIL || settings.store.email || (await ownerLogin());
    phone = null;
  }
  const rows = compose(settings, event, { email, phone, contactId, vars, orderId });
  // WhatsApp lets a business reply freely for 24 hours after the customer last wrote,
  // so inside that window the message goes out by itself without needing an approved template
  const manual = rows.find((r) => r.channel === "whatsapp" && r.status === "manual");
  if (manual && channelStatus().whatsapp) {
    const [open] = await query(
      "SELECT 1 FROM conversations WHERE channel = 'whatsapp' AND phone = $1 AND last_inbound_at > now() - interval '23 hours'",
      [manual.recipient]
    );
    if (open) manual.status = "queued";
  }
  // automatic bulk messages are never left for staff to send one by one (a busy day would mean thousands of
  // clicks): a WhatsApp copy that cannot go out by itself is dropped and the email copy carries it.
  // Order messages keep their one-click send.
  await insertMessages(AUTO_BULK.has(event) ? rows.filter((r) => r.status !== "manual") : rows);
}

/**
 * Send one message to every subscriber. `event` picks the template settings,
 * `template` can override subject/body/channels (used by the campaign composer).
 */
export async function broadcast({ name, event = "broadcast", vars = {}, template = {}, ids = null, audience = "" }) {
  const settings = await getSettings();
  // `ids` narrows it to a group of customers (see audienceIds in lib/crm.js); opt-in always applies
  const contacts = await query(
    `SELECT id, name, email, phone, token, email_opt_in, whatsapp_opt_in FROM contacts
     WHERE ((email_opt_in AND email IS NOT NULL) OR (whatsapp_opt_in AND phone IS NOT NULL))
       AND ($1::int[] IS NULL OR id = ANY($1::int[]))`,
    [ids]
  );
  const cfg = { ...automation(settings, event), ...template };
  const channels = [cfg.email && "email", cfg.whatsapp && "whatsapp"].filter(Boolean);
  const [campaign] = await query(
    "INSERT INTO campaigns (name, kind, subject, body, channels, audience) VALUES ($1,$2,$3,$4,$5::text[],$6) RETURNING id",
    [name, event === "broadcast" ? "custom" : event, cfg.subject, cfg.body, channels, audience]
  );

  const rows = [];
  for (const c of contacts) {
    const v = { ...vars, name: c.name.split(" ")[0] || "there", unsubscribe_url: `${siteUrl()}/unsubscribe/${c.token}` };
    if (event === "broadcast") v.message = render(cfg.body, { store: settings.store.name, url: siteUrl(), ...v });
    rows.push(
      ...compose(settings, event, {
        email: c.email_opt_in ? c.email : null,
        phone: c.whatsapp_opt_in ? c.phone : null,
        contactId: c.id, vars: v, campaignId: campaign.id, template,
      })
    );
  }
  await insertMessages(rows);
  await query("UPDATE campaigns SET recipients = $2 WHERE id = $1", [campaign.id, rows.length]);
  return { campaignId: campaign.id, recipients: rows.length };
}

/* ---------------- senders ---------------- */

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function emailHtml(body, store, unsubscribe) {
  const paragraphs = esc(body)
    .split(/\n{2,}/)
    .map((p) => {
      const html = p
        .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#E10600;font-weight:600;">$1</a>')
        .replace(/\n/g, "<br>");
      return `<p style="margin:0 0 16px;line-height:1.6;">${html}</p>`;
    })
    .join("");
  const footer = unsubscribe
    ? `<p style="margin:24px 0 0;font-size:12px;color:#6B6B6B;">You get this email because you subscribed to ${esc(store)}. <a href="${unsubscribe}" style="color:#6B6B6B;">Unsubscribe</a></p>`
    : "";
  return `<div style="background:#F4F1EC;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;color:#0A0A0A;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-top:4px solid #E10600;">
    <div style="padding:20px 28px;background:#0A0A0A;color:#F4F1EC;font-size:18px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;">${esc(store)}</div>
    <div style="padding:28px;font-size:15px;">${paragraphs}${footer}</div>
  </div>
</div>`;
}

let transporter;
async function sendEmail(msg, settings) {
  if (!channelStatus().email) throw Object.assign(new Error("Email is not set up yet (add SMTP settings)"), { skip: true });
  transporter ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 465),
    secure: Number(process.env.SMTP_PORT || 465) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    // never let a slow or unreachable mail server hang the request that triggered the email
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
  });
  const unsubscribe = msg.meta?.unsubscribe;
  await transporter.sendMail({
    from: process.env.EMAIL_FROM || process.env.SMTP_USER,
    to: msg.recipient,
    subject: msg.subject,
    text: msg.body + (unsubscribe ? `\n\nUnsubscribe: ${unsubscribe}` : ""),
    html: emailHtml(msg.body, settings.store.name, unsubscribe),
    headers: unsubscribe ? { "List-Unsubscribe": `<${unsubscribe}>` } : undefined,
  });
}

/** A plain WhatsApp text. Only delivered inside the 24-hour window after the customer's last message. */
export async function sendWhatsAppText(to, body) {
  if (sandbox()) throw new Error("Not sent: local sandbox (LOCAL_DB=1)");
  const res = await fetch(`https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_ID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body: String(body).slice(0, 4000), preview_url: true } }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error?.message || `WhatsApp API error ${res.status}`);
  }
}

async function sendWhatsApp(msg) {
  if (!msg.meta?.template) return sendWhatsAppText(msg.recipient, msg.body);
  const res = await fetch(`https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_ID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: msg.recipient,
      type: "template",
      template: {
        name: msg.meta.template,
        language: { code: process.env.WHATSAPP_TEMPLATE_LANG || "en" },
        // template parameters cannot contain line breaks
        components: [{ type: "body", parameters: msg.meta.params.map((text) => ({ type: "text", text: text.replace(/\s+/g, " ").trim() || "-" })) }],
      },
    }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error?.message || `WhatsApp API error ${res.status}`);
  }
}

/**
 * Sends queued messages once the current response has gone out, so the customer or staff member
 * never waits on the mail server. Outside a request (scripts, cron) it simply sends now.
 */
export function sendSoon(limit = 10) {
  const run = () => processQueue(limit).catch((e) => console.error("[notify] sending failed:", e));
  try {
    after(run);
  } catch {
    return run();
  }
}

/*
  Optional daily email limit (env EMAIL_DAILY_LIMIT, e.g. 450 for a Gmail account, whose limit is about 500 a day).
  Past it, emails stay queued for the next day instead of failing (and the mail account is not blocked). 0 = no limit.
*/
const emailDailyLimit = () => Math.max(0, Number(process.env.EMAIL_DAILY_LIMIT) || 0);

/**
 * Sends up to `limit` queued messages. Safe to call from several places at once.
 * Order messages (confirmations, updates) always go before bag reminders and campaigns, so a big reminder
 * run never delays a customer's order confirmation.
 */
export async function processQueue(limit = 20) {
  const settings = await getSettings();
  const cap = emailDailyLimit();
  let emailRoom = Infinity;
  if (cap) {
    const [{ n }] = await query("SELECT count(*)::int AS n FROM messages WHERE channel = 'email' AND status IN ('sent', 'sending') AND coalesce(sent_at, created_at) > now() - interval '24 hours'");
    emailRoom = Math.max(0, cap - n);
  }
  const batch = await query(
    `UPDATE messages SET status = 'sending'
     WHERE id IN (
       SELECT id FROM messages WHERE status = 'queued' AND (channel <> 'email' OR $2)
       ORDER BY (campaign_id IS NOT NULL OR kind LIKE 'cart_%' OR kind IN ('broadcast', 'repeat_reminder', 'feedback_request', 'cross_sell', 'birthday_wish', 'order_anniversary', 'new_arrival', 'sale_started', 'back_in_stock')), id
       LIMIT $1 FOR UPDATE SKIP LOCKED)
     RETURNING *`,
    [limit, emailRoom > 0]
  );
  // more emails claimed than today's room: hand the extra back to the queue
  const emails = batch.filter((m) => m.channel === "email");
  if (emails.length > emailRoom) {
    const back = emails.slice(emailRoom).map((m) => m.id);
    await query("UPDATE messages SET status = 'queued' WHERE id = ANY($1::int[])", [back]);
    const skip = new Set(back);
    batch.splice(0, batch.length, ...batch.filter((m) => !skip.has(m.id)));
  }
  let sent = 0;
  for (const msg of batch) {
    try {
      if (msg.channel === "email") await sendEmail(msg, settings);
      else await sendWhatsApp(msg);
      await query("UPDATE messages SET status = 'sent', sent_at = now(), error = NULL WHERE id = $1", [msg.id]);
      sent++;
    } catch (err) {
      await query("UPDATE messages SET status = $2, error = $3 WHERE id = $1", [msg.id, err.skip ? "skipped" : "failed", String(err.message).slice(0, 500)]);
    }
  }
  const [{ n }] = await query("SELECT count(*)::int AS n FROM messages WHERE status = 'queued'");
  return { sent, processed: batch.length, remaining: n };
}

/** Keeps sending until the queue is empty, the daily email limit is reached, or `until` (a timestamp) passes. */
export async function drainQueue(until) {
  const total = { sent: 0, processed: 0, remaining: 0 };
  while (Date.now() < until) {
    const r = await processQueue(25);
    total.sent += r.sent;
    total.processed += r.processed;
    total.remaining = r.remaining;
    if (!r.processed) break; // empty, or only emails left over today's limit
  }
  return total;
}
