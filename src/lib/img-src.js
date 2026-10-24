/*
  Phone-sized copies of big photos. A phone shows a hero or a category photo at ~800 pixels wide, so sending the
  1800-pixel desktop photo only makes it slower to download and to decode (which is what makes a page stutter
  when a new section or collection comes on screen). Image hosts that resize by URL (Unsplash, which the demo
  photos use) get a srcset; any other photo is left exactly as it is.
*/

const RESIZABLE = /^https:\/\/images\.unsplash\.com\//;

/** The same photo at width `w` (the height follows when the link fixes one). */
export function sized(url, w) {
  if (!url || !RESIZABLE.test(url)) return url;
  const u = new URL(url);
  const ow = Number(u.searchParams.get("w")) || 0;
  if (ow && w >= ow) return url;
  const oh = Number(u.searchParams.get("h")) || 0;
  u.searchParams.set("w", String(w));
  if (oh && ow) u.searchParams.set("h", String(Math.round((oh * w) / ow)));
  return u.toString();
}

/** A srcset with smaller copies plus the original, or undefined when the host cannot resize. */
export function srcSetOf(url, widths = [640, 800, 1080]) {
  if (!url || !RESIZABLE.test(url)) return undefined;
  const ow = Number(new URL(url).searchParams.get("w")) || 2000;
  return [...widths.filter((w) => w < ow).map((w) => `${sized(url, w)} ${w}w`), `${url} ${ow}w`].join(", ");
}

/** For photos that fill the width of a phone: phones pick a copy their size, desktops keep the original. */
export const PHONE_FULL = "(max-width: 900px) 100vw, 2400px";
