/*
  Emblems for collections. Used on the shop's collection rail and in the admin icon picker.
  A category either has an icon chosen in Admin -> Categories, or one is guessed from its name;
  if nothing fits, the emblem is the first letter of the name.
*/
export const CATEGORY_ICONS = {
  diamond: { label: "Diamond", d: <path d="M6 3h12l4 6-10 12L2 9zM2 9h20M9 3 7.5 9 12 21l4.5-12L15 3" /> },
  hanger: { label: "Hanger", d: <path d="M12 9V7.2A2.2 2.2 0 1 0 9.8 5M12 9 2.8 16.4A1.5 1.5 0 0 0 3.8 19h16.4a1.5 1.5 0 0 0 1-2.6z" /> },
  bolt: { label: "Bolt", d: <path d="M13 2 4 14h7l-1 8 9-12h-7z" /> },
  shirt: { label: "Shirt", d: <path d="M8 3 3 6l2 4 2-1v12h10V9l2 1 2-4-5-3a4 4 0 0 1-8 0z" /> },
  dress: { label: "Dress", d: <path d="M9 2v4L7 9l2 3-4 10h14l-4-10 2-3-2-3V2M9 6c1.2 1 4.8 1 6 0" /> },
  trousers: { label: "Trousers", d: <path d="M6 2h12l1 20h-5l-2-12-2 12H5zM6 6h12" /> },
  shoe: { label: "Shoe", d: <path d="M2 18v-6l4 1 3-5 3 6 7 2c2 .5 3 1.4 3 2.5V18zM2 15h20" /> },
  bag: { label: "Bag", d: <path d="M5 8h14l1 13H4zM9 8V6a3 3 0 0 1 6 0v2" /> },
  watch: { label: "Watch", d: <><circle cx="12" cy="12" r="5" /><path d="M9 7.6 9.6 3h4.8l.6 4.6M9 16.4 9.6 21h4.8l.6-4.6M12 10v2l1.4 1" /></> },
  sparkle: { label: "Sparkle", d: <path d="M11 2l1.9 6.1L19 10l-6.1 1.9L11 18l-1.9-6.1L3 10l6.1-1.9zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" /> },
  crown: { label: "Crown", d: <path d="M3 19h18M4 16 2.5 7 8 11l4-7 4 7 5.5-4L20 16z" /> },
  sun: { label: "Sun", d: <><circle cx="12" cy="12" r="4" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1" /></> },
  snow: { label: "Snowflake", d: <path d="M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7M9 4l3 2 3-2M9 20l3-2 3 2" /> },
  leaf: { label: "Leaf", d: <path d="M5 19C5 9 11 4 20 4c0 9-5 15-15 15zM5 19l9-9" /> },
  star: { label: "Star", d: <path d="m12 3 2.7 5.8 6.3.8-4.6 4.4 1.2 6.3L12 17.2 6.4 20.3l1.2-6.3L3 9.6l6.3-.8z" /> },
  tag: { label: "Tag", d: <><path d="M3 12V3h9l9 9-9 9z" /><circle cx="7.5" cy="7.5" r="1.3" /></> },
};

// words in a category name that suggest an icon
const HINTS = [
  [/lux|premium|signature|couture/, "diamond"],
  [/every|basic|casual|essential|daily/, "hanger"],
  [/tech|sport|active|gym|perform/, "bolt"],
  [/women|ladies|girl|dress/, "dress"],
  [/men|shirt|tee|top|polo/, "shirt"],
  [/pant|trouser|jean|denim|chino|bottom/, "trousers"],
  [/shoe|sneaker|foot/, "shoe"],
  [/bag|accessor/, "bag"],
  [/watch/, "watch"],
  [/eid|fest|wedding|party|formal/, "sparkle"],
  [/winter|cold/, "snow"],
  [/summer|lawn/, "sun"],
  [/new|arrival/, "star"],
  [/kid|junior/, "star"],
  [/sale|offer|deal/, "tag"],
];

/** The icon key for a category: the owner's choice, else a guess from the name, else null (-> letter). */
export function iconFor(name, chosen) {
  if (chosen && CATEGORY_ICONS[chosen]) return chosen;
  const lower = String(name || "").toLowerCase();
  return HINTS.find(([re]) => re.test(lower))?.[1] || null;
}

export function IconGlyph({ name }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {CATEGORY_ICONS[name]?.d}
    </svg>
  );
}

/** Emblem for a category: drawn icon, or its initial when no icon fits. */
export default function CategoryIcon({ name, icon }) {
  const key = iconFor(name, icon);
  return key ? <IconGlyph name={key} /> : <span className="monogram" aria-hidden>{String(name || "?").trim().charAt(0).toUpperCase()}</span>;
}
