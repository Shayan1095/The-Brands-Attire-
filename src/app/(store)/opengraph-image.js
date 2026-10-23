import { ImageResponse } from "next/og";
import { getSettings, siteUrl } from "@/lib/settings";
import { heroBanner } from "@/lib/banners";
import { HERO_IMAGES } from "@/components/store/ui";
import { THEME, brandParts, fontsOption, photoData } from "@/lib/brand-art";

// The picture shown when a link to the shop is shared on WhatsApp, Facebook, Instagram DMs, X, iMessage...
// The wordmark in the brand's style beside the current home banner photo. Product pages use their own photo instead
// (see products/[slug]/page.js). Regenerated once a day at most, so a new banner shows up the next day.
export const alt = "The shop";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const revalidate = 86400;

export default async function OpenGraphImage() {
  const { store, shipping } = await getSettings();
  const { head, tail } = brandParts(store.name);
  const banner = await heroBanner("home", HERO_IMAGES.shop).catch(() => null);
  const [fonts, photo] = await Promise.all([fontsOption(), photoData(banner?.desktop, 560, 630)]);
  const display = fonts.length ? "Display" : undefined;
  const host = siteUrl().replace(/^https?:\/\//, "").replace(/\/$/, "");
  const perks = ["Cash on delivery", shipping?.free_over > 0 ? `Free delivery over Rs ${Number(shipping.free_over).toLocaleString("en-US")}` : "7-day exchange"];

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: THEME.black, color: THEME.white, position: "relative" }}>
        {photo && (
          <div style={{ position: "absolute", top: 0, right: 0, width: 560, height: 630, display: "flex" }}>
            <img src={photo} width={560} height={630} style={{ width: 560, height: 630, objectFit: "cover" }} />
            <div style={{ position: "absolute", top: 0, left: 0, width: 560, height: 630, display: "flex", background: "linear-gradient(90deg, #0A0A0A 0%, rgba(10,10,10,.6) 22%, rgba(10,10,10,0) 55%)" }} />
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 0 40px 72px", width: photo ? 640 : 1200, height: "100%", position: "relative" }}>
          <div style={{ display: "flex", alignItems: "center", fontSize: 22, letterSpacing: 6, color: THEME.muted, textTransform: "uppercase" }}>
            <div style={{ display: "flex", width: 12, height: 12, borderRadius: 6, background: THEME.signal, marginRight: 14 }} />
            New season · Live now
          </div>
          <div style={{ display: "flex", flexDirection: "column", marginTop: 26, fontFamily: display, fontSize: head ? 112 : 140, lineHeight: 0.95, textTransform: "uppercase", letterSpacing: -1 }}>
            {head && <span style={{ display: "flex" }}>{head}</span>}
            <span style={{ display: "flex" }}>
              {head && <span style={{ color: THEME.signal, marginRight: 8 }}>/</span>}
              {tail}
            </span>
          </div>
          {store.tagline && <div style={{ display: "flex", marginTop: 26, fontSize: 26, lineHeight: 1.35, color: "rgba(244,241,236,.78)", maxWidth: photo ? 500 : 900 }}>{store.tagline}</div>}
          <div style={{ display: "flex", marginTop: 30, fontSize: 19, letterSpacing: 2, color: THEME.muted, textTransform: "uppercase" }}>{perks.join("  ·  ")}</div>
        </div>
        <div style={{ position: "absolute", left: 72, bottom: 36, display: "flex", fontSize: 20, letterSpacing: 3, color: THEME.white, textTransform: "uppercase" }}>{host}</div>
        <div style={{ position: "absolute", left: 0, bottom: 0, width: 1200, height: 10, display: "flex", background: THEME.signal }} />
      </div>
    ),
    { ...size, fonts }
  );
}
