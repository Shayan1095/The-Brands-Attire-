import "server-only";
import crypto from "node:crypto";
import { query } from "./db";
import { getSettings, siteUrl } from "./settings";
import { answer, fullText } from "./assistant";
import { notify, processQueue, channelStatus, sendWhatsAppText } from "./notify";

/*
  The shared inbox. Every chat, from the website widget or from WhatsApp, is one row in
  "conversations" with its messages in "chat_messages".

  status  bot    -> the assistant answers
          human  -> a person was asked for (or took over); the assistant stays quiet
          closed -> done; a new message from the customer opens it again with the assistant
*/

const BOT_REPLIES_PER_HOUR = 40; // a runaway or abusive chat is passed to a person instead of answered forever

const view = (m) => ({ id: m.id, sender: m.sender, body: m.body, products: m.meta?.products || [], at: m.created_at });

async function findConversation({ channel, token, phone, name }) {
  if (channel === "whatsapp") {
    const [row] = await query(
      `INSERT INTO conversations (channel, token, phone, name) VALUES ('whatsapp', $1, $2, $3)
       ON CONFLICT (phone) WHERE channel = 'whatsapp' DO UPDATE SET name = CASE WHEN EXCLUDED.name <> '' THEN EXCLUDED.name ELSE conversations.name END
       RETURNING *`,
      [crypto.randomBytes(16).toString("hex"), phone, name]
    );
    return row;
  }
  if (token) {
    const [row] = await query("SELECT * FROM conversations WHERE token = $1 AND channel = 'web'", [token]);
    if (row) return row;
  }
  const [row] = await query("INSERT INTO conversations (channel, token, name) VALUES ('web', $1, $2) RETURNING *", [crypto.randomBytes(16).toString("hex"), name]);
  return row;
}

async function saveMessage(conversationId, sender, body, { meta = {}, adminId = null, waId = null, status = "sent" } = {}) {
  const [row] = await query(
    `INSERT INTO chat_messages (conversation_id, sender, admin_id, body, meta, wa_id, status) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7)
     ON CONFLICT (wa_id) DO NOTHING RETURNING *`,
    [conversationId, sender, adminId, body, JSON.stringify(meta), waId, status]
  );
  return row || null;
}

/** Delivers a reply on the conversation's own channel. The website chat just reads it from the database. */
async function deliver(conv, text) {
  if (conv.channel !== "whatsapp") return "sent";
  try {
    await sendWhatsAppText(conv.phone, text);
    return "sent";
  } catch (err) {
    console.error("[inbox] WhatsApp send failed:", err.message);
    return "failed";
  }
}

async function alertStaff(conv, reason, message) {
  await notify("owner_chat_waiting", {
    vars: {
      customer: conv.name || (conv.phone ? `+${conv.phone}` : "A website visitor"),
      channel: conv.channel === "whatsapp" ? "WhatsApp" : "the website chat",
      reason, message: message.slice(0, 300),
      admin_url: `${siteUrl()}/admin/inbox?c=${conv.id}`,
    },
  });
  await processQueue(5).catch((e) => console.error("[notify]", e));
}

/**
 * A customer wrote something. Stores it, lets the assistant answer when it is in charge,
 * and calls in staff when it is not (or cannot help).
 * Returns { token, status, messages } - the new messages, for the website chat.
 */
export async function receiveMessage({ channel, token = null, phone = null, name = "", text, waId = null, media = false, page = "" }) {
  const settings = await getSettings();
  const cfg = settings.assistant;
  text = String(text || "").trim().slice(0, 2000);
  if (!text) return { error: "Empty message" };

  let conv = await findConversation({ channel, token, phone, name: String(name || "").slice(0, 80) });
  const history = await query("SELECT sender, body FROM chat_messages WHERE conversation_id = $1 ORDER BY id DESC LIMIT 12", [conv.id]);
  const incoming = await saveMessage(conv.id, "customer", text, { waId });
  if (!incoming) return { token: conv.token, status: conv.status, messages: [] }; // WhatsApp delivered the same message twice

  const wasClosed = conv.status === "closed";
  let status = wasClosed ? "bot" : conv.status;
  const out = [incoming];
  let reason = null;
  let context = wasClosed ? {} : conv.context;
  let misses = wasClosed ? 0 : conv.misses;

  if (status === "bot") {
    const [{ n }] = await query("SELECT count(*)::int AS n FROM chat_messages WHERE conversation_id = $1 AND sender = 'bot' AND created_at > now() - interval '1 hour'", [conv.id]);
    let result;
    if (!cfg.enabled) result = { text: cfg.handoff_message, handoff: "The assistant is switched off", products: [], context: {}, misses: 0 };
    else if (media) result = { text: "Thanks! I cannot open photos or voice notes, so I have asked a team member to take a look. They will reply here.", handoff: "Customer sent a photo, file or voice note", products: [], context: {}, misses: 0 };
    else if (n >= BOT_REPLIES_PER_HOUR) result = { text: cfg.handoff_message, handoff: "Very long chat: over 40 assistant replies in an hour", products: [], context: {}, misses: 0 };
    else {
      try {
        result = await answer({ text, conversation: { ...conv, context, misses }, history: history.reverse(), page });
      } catch (err) {
        console.error("[assistant]", err);
        result = { text: cfg.handoff_message, handoff: "The assistant hit an error", products: [], context: {}, misses: 0 };
      }
    }

    const body = channel === "whatsapp" ? fullText(result) : result.text;
    const sent = await deliver(conv, body);
    out.push(await saveMessage(conv.id, "bot", body, { meta: { products: result.products, via: result.via || "rules" }, status: sent }));
    if (result.miss) await query("UPDATE chat_messages SET meta = meta || '{\"miss\": true}'::jsonb WHERE id = $1", [incoming.id]);
    if (result.faq) await query("UPDATE faqs SET hits = hits + 1 WHERE id = $1", [result.faq]);
    context = result.context;
    misses = result.misses;
    if (result.handoff) { status = "human"; reason = result.handoff; }
  }

  [conv] = await query(
    `UPDATE conversations SET status = $2, context = $3::jsonb, misses = $4, last_text = $5, last_at = now(), last_inbound_at = now(),
       unread = CASE WHEN $2 = 'human' THEN unread + 1 ELSE 0 END,
       handoff_reason = CASE WHEN $6::text IS NOT NULL THEN $6 ELSE handoff_reason END
     WHERE id = $1 RETURNING *`,
    [conv.id, status, JSON.stringify(context || {}), misses, text.slice(0, 200), reason]
  );
  if (reason) await alertStaff(conv, reason, text).catch((e) => console.error("[inbox]", e));

  return { token: conv.token, status: conv.status, messages: out.filter(Boolean).map(view) };
}

/** The website chat reading its own thread (new staff replies arrive this way). */
export async function readThread(token, afterId = 0) {
  const [conv] = await query("SELECT id, status FROM conversations WHERE token = $1 AND channel = 'web'", [String(token || "")]);
  if (!conv) return { status: "bot", messages: [], gone: true };
  const rows = await query("SELECT * FROM chat_messages WHERE conversation_id = $1 AND id > $2 AND sender <> 'system' ORDER BY id LIMIT 100", [conv.id, Number(afterId) || 0]);
  return { status: conv.status, messages: rows.map(view) };
}

/** A staff member answers. From then on the assistant stays out of this chat until it is handed back. */
export async function staffReply(id, text, admin) {
  text = String(text || "").trim().slice(0, 2000);
  const [conv] = await query("SELECT * FROM conversations WHERE id = $1", [id]);
  if (!conv || !text) return { error: "Write a reply first." };

  if (conv.channel === "whatsapp") {
    if (!channelStatus().whatsapp) return { error: "The WhatsApp API is not connected, so replies cannot be sent from here." };
    if (!conv.last_inbound_at || Date.now() - new Date(conv.last_inbound_at).getTime() > 24 * 3600 * 1000) {
      return { error: "The customer last wrote over 24 hours ago. WhatsApp then only allows approved templates, so message them from your phone with the WhatsApp button." };
    }
    try { await sendWhatsAppText(conv.phone, text); }
    catch (err) { return { error: `WhatsApp did not accept the message: ${err.message}` }; }
  }
  await saveMessage(conv.id, "staff", text, { adminId: admin.id });
  await query(
    "UPDATE conversations SET status = 'human', unread = 0, assigned_to = COALESCE(assigned_to, $2), last_text = $3, last_at = now() WHERE id = $1",
    [conv.id, admin.id, `You: ${text}`.slice(0, 200)]
  );
  return { ok: true };
}

/** Take over, hand back to the assistant, close, or give the chat to a colleague. */
export async function updateConversation(id, { status, assignedTo }, admin) {
  const [conv] = await query("SELECT * FROM conversations WHERE id = $1", [id]);
  if (!conv) return;
  if (status && status !== conv.status && ["bot", "human", "closed"].includes(status)) {
    await query(
      `UPDATE conversations SET status = $2, unread = 0, misses = 0, context = '{}'::jsonb,
         assigned_to = CASE WHEN $2 = 'human' THEN COALESCE(assigned_to, $3) ELSE assigned_to END WHERE id = $1`,
      [id, status, admin.id]
    );
    const note = { bot: "handed the chat back to the assistant", human: "took over the chat", closed: "closed the chat" }[status];
    await saveMessage(id, "system", `${admin.name || "Staff"} ${note}`, { adminId: admin.id });
  }
  if (assignedTo !== undefined) {
    const [person] = assignedTo ? await query("SELECT id, name FROM admins WHERE id = $1 AND is_active", [assignedTo]) : [null];
    await query("UPDATE conversations SET assigned_to = $2 WHERE id = $1", [id, person?.id || null]);
    if ((person?.id || null) !== conv.assigned_to) await saveMessage(id, "system", person ? `${admin.name || "Staff"} assigned the chat to ${person.name}` : `${admin.name || "Staff"} removed the assignee`, { adminId: admin.id });
  }
}

export async function markRead(id) {
  await query("UPDATE conversations SET unread = 0 WHERE id = $1 AND unread > 0", [id]);
}
