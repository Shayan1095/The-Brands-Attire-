import "server-only";

/*
  The brand's own pictures, made from the store name and the theme (no image files to upload, so they fit any brand):
    - the favicon and the phone home-screen icon (app/icon.js, app/apple-icon.js)
    - the picture shown when a link to the shop is shared (app/(store)/opengraph-image.js)
  The display font is the shop's own (Anton, the wordmark font). It is fetched once from Google Fonts as TTF (what
  the image renderer needs); if that fails the pictures are still made, with the renderer's built-in font.
*/

export const THEME = { black: "#0A0A0A", white: "#F4F1EC", signal: "#E10600", muted: "#9A958D" };

let fontPromise = null;
/** Anton as TTF for the image renderer, or null. */
export function displayFont() {
  fontPromise ??= (async () => {
    try {
      const css = await (await fetch("https://fonts.googleapis.com/css2?family=Anton", { signal: AbortSignal.timeout(5000) })).text();
      const src = css.match(/src: url\((.+?)\) format\('(opentype|truetype)'\)/)?.[1];
      if (!src) return null;
      return await (await fetch(src, { signal: AbortSignal.timeout(5000) })).arrayBuffer();
    } catch {
      return null;
    }
  })().then((f) => { if (!f) fontPromise = null; return f; }); // a failed try is retried next time
  return fontPromise;
}

export async function fontsOption() {
  const data = await displayFont();
  return data ? [{ name: "Display", data, weight: 400, style: "normal" }] : [];
}

/** "The Brands Attire" -> head "THE BRANDS", tail "ATTIRE"; the monogram is "B" / "A" (a leading "The" is skipped). */
export function brandParts(name) {
  const words = String(name || "Store").toUpperCase().split(/\s+/).filter(Boolean);
  const head = words.length > 1 ? words.slice(0, -1).join(" ") : "";
  const tail = words.at(-1) || "S";
  const core = words.filter((w, i) => !(i === 0 && w === "THE" && words.length > 1));
  const first = core[0]?.[0] || tail[0];
  const last = core.length > 1 ? core.at(-1)[0] : null;
  return { head, tail, first, last };
}

/** A photo as a small JPEG data URL (the renderer cannot read WebP), or null when it cannot be loaded. */
export async function photoData(url, width, height) {
  if (!url) return null;
  try {
    let buf;
    if (/^https?:\/\//.test(url)) buf = Buffer.from(await (await fetch(url, { signal: AbortSignal.timeout(6000) })).arrayBuffer());
    else {
      const { readFile } = await import("node:fs/promises");
      const path = await import("node:path");
      buf = await readFile(path.join(process.cwd(), "public", url.replace(/^\//, "")));
    }
    const sharp = (await import("sharp")).default;
    const jpg = await sharp(buf).resize(width, height, { fit: "cover", position: "attention" }).jpeg({ quality: 78 }).toBuffer();
    return `data:image/jpeg;base64,${jpg.toString("base64")}`;
  } catch {
    return null;
  }
}
