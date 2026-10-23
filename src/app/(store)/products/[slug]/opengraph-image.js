import { ImageResponse } from "next/og";
import { getSettings } from "@/lib/settings";
import { getProductBySlug } from "@/lib/catalog";
import { money } from "@/lib/format";
import { THEME, brandParts, fontsOption, photoData } from "@/lib/brand-art";

// The picture when a product link is shared: its photo beside its name and price, in the brand's style.
export const alt = "Product";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const revalidate = 3600;

export default async function ProductImage({ params }) {
  const { slug } = await params;
  const [{ store }, p] = await Promise.all([getSettings(), getProductBySlug(slug)]);
  const { head, tail } = brandParts(store.name);
  const [fonts, photo] = await Promise.all([fontsOption(), photoData(p?.images?.[0]?.url, 504, 630)]);
  const display = fonts.length ? "Display" : undefined;
  const price = p ? money(p.final_price ?? p.price, store.currency) : "";
  const was = p?.original_price ? money(p.original_price, store.currency) : null;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: THEME.black, color: THEME.white, position: "relative" }}>
        {photo && <img src={photo} width={504} height={630} style={{ width: 504, height: 630, objectFit: "cover" }} />}
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 64px", width: photo ? 696 : 1200, height: "100%" }}>
          {p?.category_name && (
            <div style={{ display: "flex", alignItems: "center", fontSize: 22, letterSpacing: 6, color: THEME.signal, textTransform: "uppercase" }}>
              <div style={{ display: "flex", width: 36, height: 4, background: THEME.signal, marginRight: 14 }} />
              {p.category_name}
            </div>
          )}
          <div style={{ display: "flex", marginTop: 22, fontFamily: display, fontSize: (p?.name || "").length > 18 ? 82 : 100, lineHeight: 0.95, textTransform: "uppercase", letterSpacing: -1 }}>
            {p?.name || store.name}
          </div>
          {price && (
            <div style={{ display: "flex", alignItems: "baseline", marginTop: 30, fontSize: 44 }}>
              <span style={{ color: was ? THEME.signal : THEME.white }}>{price}</span>
              {was && <span style={{ marginLeft: 18, fontSize: 30, color: THEME.muted, textDecoration: "line-through" }}>{was}</span>}
            </div>
          )}
          <div style={{ display: "flex", marginTop: 30, fontSize: 20, letterSpacing: 3, color: THEME.muted, textTransform: "uppercase" }}>Cash on delivery   ·   7-day exchange</div>
          <div style={{ display: "flex", marginTop: 48, fontFamily: display, fontSize: 40, textTransform: "uppercase", letterSpacing: 0 }}>
            {head && <span>{head}</span>}
            {head && <span style={{ color: THEME.signal, margin: "0 4px" }}>/</span>}
            <span>{tail}</span>
          </div>
        </div>
        <div style={{ position: "absolute", left: 0, bottom: 0, width: 1200, height: 10, display: "flex", background: THEME.signal }} />
      </div>
    ),
    { ...size, fonts }
  );
}
