import "server-only";
import { query } from "./db";

/** Active banners for a page, in the owner's order. */
export async function getBanners(placement) {
  return query(
    "SELECT id, image_url, width, height, device, eyebrow, title, subtitle, cta_text, cta_link FROM banners WHERE placement = $1 AND is_active ORDER BY sort_order, id",
    [placement]
  );
}

/**
 * The photo to show on each kind of screen for a single-image hero.
 * Falls back to the other device's photo, then to `fallback`, so a page is never left without one.
 */
export async function heroBanner(placement, fallback) {
  const list = await getBanners(placement);
  const pick = (device) => list.find((b) => b.device === device) || list.find((b) => b.device === "both");
  const desktop = pick("desktop")?.image_url || list[0]?.image_url || fallback;
  const mobile = pick("mobile")?.image_url || desktop;
  return { desktop, mobile };
}
