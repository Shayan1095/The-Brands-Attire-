import "server-only";
import { getSettings } from "./settings";
import { listProducts } from "./catalog";
import { SHOWCASE_SECTIONS } from "./showcase-sections";

/*
  What the storefront sections show (Admin -> Showcase).
  Each section is either Automatic (the shop's own rule, passed in by the page as `auto`) or Hand-picked:
  the owner's products, in their order, each with the photo they chose. Hand-picked products that are sold
  out, archived or deleted are skipped, and the rest of the section can be topped up automatically, so a
  section never shows a dead product or sits half empty.
*/

/** A product with the chosen photo moved to the front (cards show the first photo). Never changes the shared original. */
function withPhoto(p, photoId) {
  if (!photoId) return p;
  const image = p.images.find((i) => i.id === photoId);
  return image ? { ...p, images: [image, ...p.images.filter((i) => i.id !== photoId)] } : p;
}

/**
 * The products a section shows.
 *   key      one of SHOWCASE_SECTIONS
 *   auto     the automatic list for this place (already in the shop's own order)
 *   exclude  product ids that must not appear here (the product on screen, items in the bag...)
 *   filter   extra rule a product must pass (the sale section only takes reduced products)
 *   limit    how many to return (defaults to the section's size)
 */
export async function showcaseFor(key, auto, { exclude = [], filter, limit } = {}) {
  const max = limit ?? SHOWCASE_SECTIONS[key].max;
  const skip = new Set(exclude.map(Number));
  const allowed = (p) => !skip.has(p.id) && (!filter || filter(p));
  const section = (await getSettings()).showcase?.sections?.[key];
  const automatic = auto.filter(allowed);
  if (section?.mode !== "pick" || !section.items?.length) return automatic.slice(0, max);

  const byId = new Map((await listProducts()).map((p) => [p.id, p]));
  const chosen = section.items
    .map((item) => byId.get(Number(item.id)))
    .map((p, i) => (p && p.total_stock > 0 && allowed(p) ? withPhoto(p, Number(section.items[i].photo) || null) : null))
    .filter(Boolean);
  const list = section.fill === false ? chosen : [...chosen, ...automatic.filter((p) => !chosen.some((c) => c.id === p.id))];
  return list.slice(0, max);
}

/** An uploaded replacement for one of the fixed photos, or null to keep the built-in one. */
export async function showcasePhoto(key) {
  return (await getSettings()).showcase?.photos?.[key] || null;
}

/** The owner's own order of photos for a gallery chapter (image ids, first = cover), or null for automatic. */
export async function galleryOrder(slug) {
  const ids = (await getSettings()).showcase?.gallery?.[slug];
  return Array.isArray(ids) && ids.length ? ids.map(Number) : null;
}
