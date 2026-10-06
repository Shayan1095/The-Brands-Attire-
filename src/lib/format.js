// Helpers shared by server and browser code.

export const money = (n, currency = "Rs.") => `${currency} ${Number(n || 0).toLocaleString("en-US")}`;

export const slugify = (s) =>
  String(s || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/** "0300 1234567" -> "923001234567" (digits only, with country code). */
export function normalizePhone(raw, countryCode = "92") {
  let d = String(raw || "").replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  else if (d.startsWith("0")) d = countryCode + d.slice(1);
  return d;
}

export const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(s || ""));

export function fmtDate(d, timeZone = "Asia/Karachi", withTime = true) {
  if (!d) return "";
  return new Date(d).toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
    timeZone,
  });
}

// in fulfilment order; "shipped" is shown to staff as Dispatched
export const ORDER_STATUS = {
  pending: { label: "Awaiting confirmation", tone: "warn" },
  confirmed: { label: "Confirmed", tone: "info" },
  packed: { label: "Packed", tone: "info" },
  shipped: { label: "Dispatched", tone: "info" },
  delivered: { label: "Delivered", tone: "ok" },
  returned: { label: "Returned", tone: "bad" },
  cancelled: { label: "Cancelled", tone: "bad" },
};

/** Where an order came from. */
export const CHANNELS = {
  website: "Website",
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  phone: "Phone call",
  store: "Store (walk-in)",
  other: "Other",
};

/** Returns, exchanges and complaints. */
export const CASE_TYPES = { exchange: "Exchange", return: "Return for refund", complaint: "Complaint" };
// [label, is it the shop's fault?]  A fault is always accepted inside the window, even for sale items.
export const CASE_REASONS = {
  size: ["Size does not fit", false],
  defective: ["Faulty or damaged", true],
  wrong_item: ["Wrong item received", true],
  not_as_described: ["Not as shown or described", true],
  quality: ["Quality not as expected", false],
  changed_mind: ["Changed my mind", false],
  late: ["Late or delivery problem", false],
  service: ["Service problem", false],
  other: ["Something else", false],
};
export const CASE_STATUS = {
  requested: { label: "Waiting for review", tone: "warn" },
  approved: { label: "Approved, awaiting parcel", tone: "info" },
  in_transit: { label: "Parcel on its way back", tone: "info" },
  received: { label: "Received, to settle", tone: "warn" },
  resolved: { label: "Resolved", tone: "ok" },
  rejected: { label: "Declined", tone: "bad" },
};
export const RESOLUTIONS = { exchange: "Replacement sent", refund: "Refund", credit: "Store credit code", none: "No further action" };

/** Customer groups by buying behaviour, see lib/crm.js. */
export const SEGMENTS = {
  vip: { label: "VIP", tone: "ok", hint: "Your best customers by spend or number of orders" },
  repeat: { label: "Repeat", tone: "info", hint: "Ordered more than once" },
  new: { label: "New", tone: "", hint: "One order so far" },
  risk: { label: "At risk", tone: "warn", hint: "Has not ordered for a while" },
  lost: { label: "Lost", tone: "bad", hint: "Has not ordered for a long time" },
  lead: { label: "Subscriber", tone: "", hint: "Signed up but has not ordered yet" },
};

/** Who is answering a chat right now. */
export const CHAT_STATUS = {
  bot: { label: "Assistant", tone: "info" },
  human: { label: "Needs a person", tone: "bad" },
  closed: { label: "Closed", tone: "" },
};

/** How a size is described to customers: never the exact count, and never "in stock" when it is not. */
export const stockWord = (n) => (n <= 0 ? "sold out" : n <= 3 ? `only ${n} left` : "in stock");

/** Tasks the owner can allow a staff member to do. The owner always has all of them. */
export const PERMISSIONS = {
  orders: "Orders: see, create and update orders",
  inventory: "Inventory: stock counts, adjustments and restock list",
  returns: "Returns, exchanges and complaints",
  support: "Inbox and assistant: customer chats and saved answers",
  products: "Products and categories",
  offers: "Offers, sales and discount codes",
  customers: "Customers",
  marketing: "Campaigns, automations and messages",
  banners: "Banners",
  reports: "Sales figures (money totals on the dashboard)",
  settings: "Store settings",
  staff: "Staff accounts and permissions",
};

/** True when this admin may do the task. */
export const can = (admin, permission) => Boolean(admin) && (admin.role === "owner" || (admin.permissions || []).includes(permission));

/** "M" or "M · Black" - how a size/colour combination is written everywhere. */
export const variantLabel = (v) => (v.color ? `${v.size} · ${v.color}` : v.size);

/** Reasons for changing stock by hand: [type, label, direction]. */
export const STOCK_REASONS = [
  ["supplier", "Supplier delivery", 1],
  ["found", "Found / recount up", 1],
  ["damaged", "Damaged", -1],
  ["lost", "Lost or stolen", -1],
  ["count", "Count correction", 0],
];

/**
 * Which screens a banner photo suits, judged by its shape:
 * wide (landscape) -> desktop, tall (portrait) -> mobile, roughly square -> both.
 */
export function bannerDevice(width, height) {
  const ratio = width / Math.max(1, height);
  if (ratio >= 1.2) return "desktop";
  if (ratio <= 0.9) return "mobile";
  return "both";
}

/** A plain-language warning when a banner is too small to look sharp, or null. */
export function bannerWarning({ width, height, device }) {
  if (device !== "mobile" && width < 1600) return `Only ${width}px wide: may look soft on large screens (1600px or more is best).`;
  if (device === "mobile" && width < 750) return `Only ${width}px wide: may look soft on phones (750px or more is best).`;
  if (device === "desktop" && width / Math.max(1, height) < 1.2) return "This photo is not wide; it will be cropped heavily on desktop.";
  if (device === "mobile" && width / Math.max(1, height) > 0.9) return "This photo is not tall; it will be cropped heavily on phones.";
  return null;
}

export const BANNER_PLACEMENTS = {
  home: "Home slideshow",
  shop: "Products page",
  sale: "Sale page",
  lookbook: "Gallery page",
  contact: "Contact page",
  track: "Track order page",
  policies: "Policies page",
};

export const waLink = (phone, text = "") => `https://wa.me/${phone}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
