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
    auto_cancel_hours: 12,   // also how long stock stays reserved for an unconfirmed order (fake orders free it sooner)
    change_hours: 12,        // after confirming, the customer may change sizes, quantities or delivery details, or cancel, for this long (0 = never)
    duplicate_hours: 24,     // two open orders from one phone with the same item inside this window are flagged
    max_qty: 5,              // most pieces of one size in a website order (0 = no limit); stops one order reserving a whole size
    max_pending: 3,          // most unconfirmed website orders one phone number may have open at once (0 = no limit)
    pack_hours: 24,          // a confirmed order not dispatched after this needs attention
    deliver_days: 7,         // a dispatched order not delivered after this needs attention
    policy:
      "Until you confirm, you can cancel your order free of charge from your order link. After confirming you still have a short window to change sizes, quantities or the delivery address, or to cancel; once it is packed it can no longer be changed.",
    returns:
      "Exchange within 7 days of delivery for unworn items with tags attached. Sale items are final unless faulty. Start an exchange or report a problem from your order page (the link in your order messages), or message us on WhatsApp.",
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
    // the brand collects returns itself: the customer never has to post anything
    carrier: "Our rider",  // who usually collects (your rider, or the courier company you contract)
    exchange_fee: 0,       // delivery fee for an exchange the customer chose (wrong size...); faults are always free
    instructions: "Keep the piece unworn with its tags on, ready in its bag. We will send our rider to collect it; for an exchange they bring your new size at the same time.",
  },
  // what goes in the parcel: the courier slip and the thank-you card, see lib/labels.js (Admin -> Orders -> Print)
  labels: {
    format: "a4",           // a4 = slip and card on one A4 sheet (any printer) | thermal = 4x6 inch labels
    caution: "Handle with care · Do not fold · Keep dry",
    open_policy: "",        // e.g. "Parcel may be opened only after payment" ('' = not printed)
    return_address: "",     // '' = the store address
    couriers: "Leopards, TCS, M&P, PostEx, Trax, Our rider", // suggested when dispatching
    weight_kg: "",          // default parcel weight for the courier file ('' = left blank)
    card: true,             // print a thank-you card with every slip
    card_message: "",       // an extra line on every card ('' = none)
    card_sign: "",          // '' = "With love, the <store> team"
    care: true,             // a care tip for the piece
    qr_updates: true,       // QR: get new arrivals and sales (their own subscribe link)
    qr_feedback: true,      // QR: rate this order
    next_code_value: 10,    // a one-time code for the next order (0 = none)
    next_code_type: "percent", // percent | fixed
    next_code_days: 60,     // how long it stays valid (0 = no end)
    next_code_prefix: "NEXT",
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
  // the agents (Admin -> Agents), see lib/agents.js
  agents: {
    briefing: true,          // a morning summary for the owner
    briefing_hour: 8,        // from this hour (store time) it is written for the day
    briefing_email: true,    // also email it to the owner
    guard: true,             // check every new order for cash-on-delivery risk
    guard_call: 30,          // risk score from which to call before confirming
    guard_advance: 60,       // risk score from which to ask for an advance (or decline)
    guard_high_value: 15000, // a first order above this needs a closer look
    restock: true,           // warn before sizes sell out
    restock_days: 7,         // warn when a size will run out within this many days (plus supplier lead time)
    triage: true,            // suggest approve / decline for new return requests, with a message
    triage_auto: false,      // approve clear in-rule requests by itself (exchanges with the size in stock, faults)
    writer: true,            // draft campaigns for new pieces, sales and customers who stopped buying
    catalogue: true,         // find products with missing photos, descriptions or odd prices; draft descriptions
    catalogue_auto: false,   // save a drafted description by itself when a product has none at all
    merch: true,             // clear-out sales for slow pieces, Showcase clean-up, best sellers to feature
    merch_auto: false,       // remove sold-out pieces from hand-picked Showcase sections by itself
    feedback: true,          // patterns in returns and ratings: fit tips, quality checks
    feedback_auto: false,    // publish fit tips on product pages by itself
    ai: true,                // let the agents use the connected AI model for their wording (if one is set up)
    ai_daily_limit: 100,     // most AI calls per day, to stay inside a free tier
  },
  // hand-picked storefront sections, replacement photos and gallery order, see lib/showcase.js
  showcase: { sections: {}, photos: {}, gallery: {} },
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
