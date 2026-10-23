import { ImageResponse } from "next/og";
import { getSettings } from "@/lib/settings";
import { THEME, brandParts, fontsOption } from "@/lib/brand-art";

// The favicon: the brand's monogram in its wordmark style (first letter, the red slash, last letter) on black.
// Made from the store name, so it follows any brand. Regenerated once a day at most.
export const size = { width: 64, height: 64 };
export const contentType = "image/png";
export const revalidate = 86400;

export default async function Icon() {
  const { store } = await getSettings();
  const { first, last } = brandParts(store.name);
  const fonts = await fontsOption();
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: THEME.black, borderRadius: 14, fontFamily: fonts.length ? "Display" : undefined, color: THEME.white, fontSize: last ? 38 : 46, lineHeight: 1, letterSpacing: -1 }}>
        <span style={{ display: "flex" }}>{first}</span>
        {last && <span style={{ display: "flex", color: THEME.signal, margin: "0 1px", fontSize: last ? 40 : 46 }}>/</span>}
        {last && <span style={{ display: "flex" }}>{last}</span>}
      </div>
    ),
    { ...size, fonts }
  );
}
