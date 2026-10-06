import "server-only";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { bannerDevice } from "./format";

/*
  The website image standard. Whatever the owner uploads (phone photo, huge JPEG, PNG,
  sideways EXIF rotation...) comes out as:
    - 4:5 portrait, 1200x1500 (page) + 600x750 (cards/thumbnails)
    - WebP, sRGB, metadata stripped
*/
export const IMAGE_STANDARD = { width: 1200, height: 1500, thumbWidth: 600, thumbHeight: 750 };

/**
 * @param {Buffer} input raw upload
 * @param {"cover"|"contain"} fit  cover = smart crop around the subject, contain = keep the whole photo on a paper background
 */
export async function standardiseImage(input, fit = "cover") {
  const { width, height, thumbWidth, thumbHeight } = IMAGE_STANDARD;
  const background = "#E8E2D8";
  const base = sharp(input, { failOn: "none" }).rotate().flatten({ background });
  const resize = fit === "contain" ? { fit: "contain", background } : { fit: "cover", position: sharp.strategy.attention };
  const [main, thumb] = await Promise.all([
    base.clone().resize(width, height, resize).webp({ quality: 82 }).toBuffer(),
    base.clone().resize(thumbWidth, thumbHeight, resize).webp({ quality: 76 }).toBuffer(),
  ]);
  return { main, thumb };
}

/** Stores a file and returns its public URL: Vercel Blob in production, ./public/uploads locally. */
async function store(name, buffer) {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { put } = await import("@vercel/blob");
    const blob = await put(`products/${name}`, buffer, { access: "public", contentType: "image/webp", addRandomSuffix: false });
    return blob.url;
  }
  if (process.env.VERCEL) throw new Error("Image storage is not set up: add a Vercel Blob store to this project.");
  const dir = path.join(process.cwd(), "public", "uploads");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, name), buffer);
  return `/uploads/${name}`;
}

/**
 * Banner / hero photo. Unlike product photos these are not cropped to one shape:
 * the photo's own shape decides whether it is used on desktop, on phones, or both.
 * It is only shrunk (never enlarged) and converted to WebP.
 */
export async function saveBanner(input) {
  const meta = await sharp(input, { failOn: "none" }).metadata();
  const sideways = (meta.orientation || 1) >= 5; // EXIF says the camera was rotated
  const device = bannerDevice(sideways ? meta.height : meta.width, sideways ? meta.width : meta.height);
  const max = device === "mobile" ? { width: 1200, height: 2400 } : { width: 2400, height: 2400 };
  const { data, info } = await sharp(input, { failOn: "none" })
    .rotate()
    .flatten({ background: "#0A0A0A" })
    .resize({ ...max, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer({ resolveWithObject: true });
  const url = await store(`banner-${crypto.randomBytes(8).toString("hex")}.webp`, data);
  return { url, width: info.width, height: info.height, device };
}

export async function saveImage(input, fit) {
  const { main, thumb } = await standardiseImage(input, fit);
  const id = crypto.randomBytes(8).toString("hex");
  const [url, thumbUrl] = await Promise.all([store(`${id}.webp`, main), store(`${id}-thumb.webp`, thumb)]);
  return { url, thumb: thumbUrl, bytes: main.length };
}
