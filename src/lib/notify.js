import "server-only";
import nodemailer from "nodemailer";
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

Your order {{order_number}} is confirmed and is being packed. Please keep {{total}} ready for cash on delivery.

As agreed, a confirmed order can no longer be cancelled.

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
    label: "Return or exchange approved - how to send it back",
    group: "Returns",
    params: ["name", "case_number", "order_url"],
    subject: "Your {{type}} {{case_number}} is approved",
    body: `Hi {{name}},

Your {{type}} {{case_number}} is approved. {{note}}

{{instructions}}

Add your courier and tracking number here: {{order_url}}`,
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
    label: "Returned parcel received",
    group: "Returns",
    params: ["name", "case_number"],
    subject: "We received your parcel ({{case_number}})",
    body: `Hi {{name}},

Your returned parcel for {{case_number}} has arrived and been checked. We are now arranging the next step and will update you shortly.`,
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
    label: "Unfinished checkout - remind customers who agreed to be contacted",
    group: "Orders",
    params: ["name", "url"],
    subject: "You left something in your bag",
    body: `Hi {{name}},

You started an order at {{store}} and did not finish it. These are still available:

{{items}}
Finish your order here: {{url}}

Reply STOP and we will not remind you again.`,
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

export const channelStatus = () => ({
  email: Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS),
  whatsapp: Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID),
});

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
    tracking: order.tracking_number || "-",
    reason: order.cancel_reason || "",
    policy: settings.orders.policy,
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

/** Builds the outbox rows for one recipient on the enabled channels. */
function compose(settings, event, { email, phone, contactId = null, vars, orderId = null, campaignId = null, template }) {
  const cfg = { ...automation(settings, event), ...template };
  const def = EVENTS[event];
  const all = { store: settings.store.name, url: siteUrl(), ...vars };
  const body = render(cfg.body, all).trim();
  const rows = [];
  const common = { contact_id: contactId, kind: event, order_id: orderId, campaign_id: campaignId };

  if (cfg.email && email) {
    rows.push({ ...common, channel: "email", recipient: email, subject: render(cfg.subject, all), body, meta: { unsubscribe: all.unsubscribe_url || null }, status: "queued" });
  }
  if (cfg.whatsapp && phone) {
    const viaApi = channelStatus().whatsapp && cfg.wa_template;
    rows.push({
      ...common, channel: "whatsapp", recipient: phone, subject: "", body,
      meta: viaApi ? { template: cfg.wa_template, params: (def.params || []).map((k) => String(all[k] ?? "")) } : {},
      // without the WhatsApp API the owner sends it with one click from the panel
      status: viaApi ? "queued" : "manual",
    });
  }
  return rows;
}

/** Queue the automated message for an event (transactional or owner alert). */
export async function notify(event, { email, phone, contactId, vars = {}, orderId } = {}) {
  const settings = await getSettings();
  if (EVENTS[event].owner) {
    // owner alerts go to the store's address; staff alerts go to the staff member passed in
    if (!EVENTS[event].staff) email = process.env.OWNER_EMAIL || settings.store.email;
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
  await insertMessages(rows);
}

/**
 * Send one message to every subscriber. `event` picks the template settings,
 * `template` can override subject/body/channels (used by the campaign composer).
 */
export async function broadcast({ name, event = "broadcast", vars = {}, template = {} }) {
  const settings = await getSettings();
  const contacts = await query(
    `SELECT id, name, email, phone, token, email_opt_in, whatsapp_opt_in FROM contacts
     WHERE (email_opt_in AND email IS NOT NULL) OR (whatsapp_opt_in AND phone IS NOT NULL)`
  );
  const cfg = { ...automation(settings, event), ...template };
  const channels = [cfg.email && "email", cfg.whatsapp && "whatsapp"].filter(Boolean);
  const [campaign] = await query(
    "INSERT INTO campaigns (name, kind, subject, body, channels) VALUES ($1,$2,$3,$4,$5::text[]) RETURNING id",
    [name, event === "broadcast" ? "custom" : event, cfg.subject, cfg.body, channels]
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

/** Sends up to `limit` queued messages. Safe to call from several places at once. */
export async function processQueue(limit = 20) {
  const settings = await getSettings();
  const batch = await query(
    `UPDATE messages SET status = 'sending'
     WHERE id IN (SELECT id FROM messages WHERE status = 'queued' ORDER BY id LIMIT $1 FOR UPDATE SKIP LOCKED)
     RETURNING *`,
    [limit]
  );
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
