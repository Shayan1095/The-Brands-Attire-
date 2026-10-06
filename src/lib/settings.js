import "server-only";
import { cache } from "react";
import { query } from "./db";

export const DEFAULT_SETTINGS = {
  store: {
    name: "The Brands Attire",
    tagline: "One point of view, three worlds. Luxury, everyday and tech - under a single bold frame.",
    currency: "Rs.",
    country_code: "92",
    timezone: "Asia/Karachi",
    whatsapp: "923467227218",
    email: "",
    phone: "",
    address: "",
    hours: "Mon-Sat · 10am-8pm",
    instagram: "",
    facebook: "",
  },
  hero: {
    eyebrow: "New season · Live now",
    title: "Wear *like* you mean it.",
    subtitle: "Considered pieces across luxury, everyday and tech. Cash on delivery nationwide.",
    image: "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&w=2000&q=80",
    ticker: "New season live now · Free delivery over Rs. 5,000 · Cash on delivery nationwide · Easy 7-day exchange · Confirm before we ship",
    cta_text: "Shop new arrivals",
    cta_link: "/products",
  },
  announcement: {
    enabled: true,
    text: "Free delivery on orders over Rs. 5,000 · Cash on delivery nationwide",
    link: "/products",
  },
  shipping: { fee: 250, free_over: 5000, eta: "3-5 working days" },
  orders: {
    reminder_hours: 12,
    auto_cancel_hours: 48,   // also how long stock stays reserved for an unconfirmed order
    duplicate_hours: 24,     // two open orders from one phone with the same item inside this window are flagged
    pack_hours: 24,          // a confirmed order not dispatched after this needs attention
    deliver_days: 7,         // a dispatched order not delivered after this needs attention
    policy:
      "After you confirm your order it is packed for dispatch and can no longer be cancelled. Until you confirm, you can cancel it free of charge from your order link.",
    returns:
      "Exchange within 7 days of delivery for unworn items with tags attached. Sale items are final. Contact us on WhatsApp with your order number to arrange an exchange.",
  },
  inventory: {
    lead_days: 7,   // how long a supplier takes to deliver
    cover_days: 21, // how many days of stock a reorder should last
  },
  // who may send something back, see lib/cases.js
  returns: {
    window_days: 7,        // days after delivery a request is accepted
    exchanges: true,       // customers may swap for another size or colour
    refunds: false,        // customers may ask for money back (faulty or wrong items always can)
    sale_items: false,     // sale items can be exchanged or returned too
    complaint_hours: 48,   // a complaint open longer than this needs attention
    instructions: "Pack the item unworn with its tags attached and send it back by any courier. Add the courier name and tracking number on your order page so we can watch for it.",
  },
  // customer retention, see lib/crm.js
  crm: {
    vip_spend: 30000,      // total spent that makes someone a VIP...
    vip_orders: 4,         // ...or this many orders
    winback_days: 90,      // no order for this long = at risk; twice this = lost
    reorder_days: 45,      // remind subscribed customers this long after their last order (0 = never)
    feedback_days: 3,      // ask for feedback this long after delivery (0 = never)
    points_per_100: 1,     // loyalty points earned per 100 spent (0 = no points)
    reward_points: 500,    // points that turn into a reward code
    reward_value: 500,     // what that code is worth
    reward_days: 60,       // how long the code stays valid
  },
  // the customer assistant (website chat + WhatsApp), see lib/assistant.js
  assistant: {
    enabled: true,          // off = every chat goes straight to staff
    web_chat: true,         // show the chat button in the shop
    name: "Aria",
    greeting: "Hi! I can check sizes and stock, track an order, or explain delivery and exchanges. What do you need?",
    about: "",              // anything the owner wants it to know about the brand
    handoff_words: "human, agent, real person, representative, manager, complaint, complain, damaged, defective, wrong item, fraud, scam, insaan, banda",
    handoff_after: 2,       // unanswered questions in a row before a person is called in
    handoff_message: "I have asked a team member to join. They will reply here as soon as they can.",
    cart_hours: 3,          // remind about an unfinished checkout after this many hours (0 = never)
  },
  // per-event overrides for the automated messages, see lib/notify.js
  automations: {},
};

const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);

/** All settings, merged over the defaults. Cached for the duration of one request. */
export const getSettings = cache(async () => {
  const rows = await query("SELECT key, value FROM settings");
  const out = structuredClone(DEFAULT_SETTINGS);
  for (const { key, value } of rows) {
    out[key] = isObj(out[key]) && isObj(value) ? { ...out[key], ...value } : value;
  }
  return out;
});

export async function saveSetting(key, value) {
  await query(
    "INSERT INTO settings (key, value) VALUES ($1, $2::jsonb) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
    [key, JSON.stringify(value)]
  );
}

export function siteUrl() {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return "http://localhost:3000";
}
