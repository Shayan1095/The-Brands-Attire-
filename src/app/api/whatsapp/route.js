import crypto from "node:crypto";
import { after } from "next/server";
import { receiveMessage } from "@/lib/inbox";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/*
  WhatsApp Cloud API webhook: customers' WhatsApp messages arrive here.

  Setup in Meta's developer dashboard (WhatsApp -> Configuration):
    Callback URL   https://your-site/api/whatsapp
    Verify token   the value of WHATSAPP_VERIFY_TOKEN
    Subscribe to   "messages"
  WHATSAPP_APP_SECRET (App settings -> Basic) proves each request really comes from Meta.
*/

/** Meta calls this once when the webhook is saved. */
export async function GET(request) {
  const p = new URL(request.url).searchParams;
  const expected = process.env.WHATSAPP_VERIFY_TOKEN;
  if (expected && p.get("hub.mode") === "subscribe" && p.get("hub.verify_token") === expected) {
    return new Response(p.get("hub.challenge") || "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

function signed(raw, header) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret || !header) return false;
  const expected = "sha256=" + crypto.createHmac("sha256", secret).update(raw).digest("hex");
  return header.length === expected.length && crypto.timingSafeEqual(Buffer.from(header), Buffer.from(expected));
}

/** What the customer sent, as text. Anything that is not text goes to a person. */
function read(m) {
  if (m.type === "text") return { text: m.text?.body };
  if (m.type === "button") return { text: m.button?.text };
  if (m.type === "interactive") return { text: m.interactive?.button_reply?.title || m.interactive?.list_reply?.title };
  const label = { image: "Photo", audio: "Voice note", video: "Video", document: "File", sticker: "Sticker", location: "Location" }[m.type] || "Message";
  return { text: `[${label}]${m[m.type]?.caption ? ` ${m[m.type].caption}` : ""}`, media: true };
}

export async function POST(request) {
  const raw = await request.text();
  // without the app secret anyone could post fake customer messages, so unsigned requests are refused
  if (!signed(raw, request.headers.get("x-hub-signature-256"))) return new Response("Bad signature", { status: 401 });

  let payload;
  try { payload = JSON.parse(raw); } catch { return new Response("Bad request", { status: 400 }); }

  const jobs = [];
  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value || {};
      // ignore events for a different number on the same Meta app
      if (value.metadata?.phone_number_id && value.metadata.phone_number_id !== process.env.WHATSAPP_PHONE_ID) continue;
      for (const m of value.messages || []) {
        const { text, media } = read(m);
        if (!text || !m.from) continue;
        const name = value.contacts?.find((c) => c.wa_id === m.from)?.profile?.name || "";
        jobs.push({ channel: "whatsapp", phone: String(m.from).replace(/\D/g, ""), name, text, media: Boolean(media), waId: m.id });
      }
    }
  }

  // Meta wants a fast 200 and retries otherwise; the answering happens right after the response is sent
  after(async () => {
    for (const job of jobs) {
      try { await receiveMessage(job); } catch (err) { console.error("[whatsapp webhook]", err); }
    }
  });
  return new Response("OK", { status: 200 });
}
