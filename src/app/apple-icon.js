import { ImageResponse } from "next/og";
import { getSettings } from "@/lib/settings";
import { THEME, brandParts, fontsOption } from "@/lib/brand-art";

// The icon when someone adds the shop to their phone's home screen (iPhone draws its own rounded corners).
export const size = { width: 180, height: 180 };
export const contentType = "image/png";
export const revalidate = 86400;

export default async function AppleIcon() {
  const { store } = await getSettings();
  const { first, last } = brandParts(store.name);
  const fonts = await fontsOption();
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: THEME.black, fontFamily: fonts.length ? "Display" : undefined, color: THEME.white }}>
        <div style={{ display: "flex", alignItems: "center", fontSize: last ? 104 : 120, lineHeight: 1, letterSpacing: -2 }}>
          <span style={{ display: "flex" }}>{first}</span>
          {last && <span style={{ display: "flex", color: THEME.signal, margin: "0 2px" }}>/</span>}
          {last && <span style={{ display: "flex" }}>{last}</span>}
        </div>
        <div style={{ display: "flex", width: 56, height: 5, marginTop: 10, background: THEME.signal }} />
      </div>
    ),
    { ...size, fonts }
  );
}
