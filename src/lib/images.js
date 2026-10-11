
import "server-only";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { bannerDevice } from "./format";

/*
  Image standard:
  - Main product image: 1200x1500 (4:5)
  - Thumbnail: 600x750 (4:5)
  - Output: WebP, with EXIF orientation corrected and metadata stripped.
*/
export const IMAGE_STANDARD = {
  width: 1200,
  height: 1500,
  thumbWidth: 600,
  thumbHeight: 750,
};

/**
 * @param {Buffer} input Raw uploaded image.
 * @param {"cover"|"contain"} fit
 * cover: crop to fill the frame.
 * contain: preserve the entire image on a background.
 */
export async function standardiseImage(input, fit = "cover") {
  const { width, height, thumbWidth, thumbHeight } = IMAGE_STANDARD;
  const background = "#E8E2D8";

  const base = sharp(input, { failOn: "none" })
    .rotate()
    .flatten({ background });

  const resize =
    fit === "contain"
      ? { fit: "contain", background }
      : { fit: "cover", position: sharp.strategy.attention };

  const [main, thumb] = await Promise.all([
    base
      .clone()
      .resize(width, height, resize)
      .webp({ quality: 82 })
      .toBuffer(),

    base
      .clone()
      .resize(thumbWidth, thumbHeight, resize)
      .webp({ quality: 76 })
      .toBuffer(),
  ]);

  return { main, thumb };
}

/**
 * Stores a file in Vercel Blob in production.
 *
 * Supports:
 * - Vercel OIDC authentication with BLOB_STORE_ID.
 * - BLOB_READ_WRITE_TOKEN authentication when configured.
 * - Local filesystem storage during local development.
 *
 * Never silently falls back to local files on Vercel.
 */
async function store(name, buffer) {
  const isVercel = Boolean(process.env.VERCEL);
  const hasReadWriteToken = Boolean(
    process.env.BLOB_READ_WRITE_TOKEN
  );
  const hasStoreId = Boolean(process.env.BLOB_STORE_ID);

  // In production, always use Blob. The SDK resolves OIDC or
  // read-write-token authentication from the available environment.
  if (isVercel || hasReadWriteToken || hasStoreId) {
    if (!hasStoreId && !hasReadWriteToken && isVercel) {
      throw new Error(
        "Vercel Blob is not configured: BLOB_STORE_ID and " +
          "BLOB_READ_WRITE_TOKEN are both missing. Check the " +
          "Blob store connection and Production environment."
      );
    }

    try {
      const { put } = await import("@vercel/blob");

      const options = {
        access: "public",
        contentType: "image/webp",
        addRandomSuffix: false,
      };

      // Supplying the store ID lets the SDK use Vercel OIDC
      // authentication when an OIDC token is available.
      if (hasStoreId) {
        options.storeId = process.env.BLOB_STORE_ID;
      }

      const blob = await put(`products/${name}`, buffer, options);

      if (!blob?.url) {
        throw new Error("The Blob SDK did not return a file URL.");
      }

      return blob.url;
    } catch (error) {
      console.error("[Blob upload failed]", {
        filename: name,
        message:
          error instanceof Error
            ? error.message
            : String(error),
      });

      throw new Error(
        `Could not upload "${name}" to Vercel Blob. ` +
          "Check Blob authentication, store permissions, and " +
          "the deployment logs. " +
          (error instanceof Error
            ? error.message
            : String(error))
      );
    }
  }

  // Local development only.
  const dir = path.join(process.cwd(), "public", "uploads");

  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, name), buffer);

  return `/uploads/${name}`;
}

/**
 * Saves a banner/hero image without forcing a 4:5 crop.
 * The image's aspect ratio determines its dimensions.
 */
export async function saveBanner(input) {
  const meta = await sharp(input, { failOn: "none" }).metadata();

  const sideways = (meta.orientation || 1) >= 5;

  const device = bannerDevice(
    sideways ? meta.height : meta.width,
    sideways ? meta.width : meta.height
  );

  const max =
    device === "mobile"
      ? { width: 1200, height: 2400 }
      : { width: 2400, height: 2400 };

  const { data, info } = await sharp(input, { failOn: "none" })
    .rotate()
    .flatten({ background: "#0A0A0A" })
    .resize({
      ...max,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 80 })
    .toBuffer({ resolveWithObject: true });

  const filename =
    `banner-${crypto.randomBytes(8).toString("hex")}.webp`;

  const url = await store(filename, data);

  return {
    url,
    width: info.width,
    height: info.height,
    device,
  };
}

/**
 * Saves the main product image and its thumbnail.
 */
export async function saveImage(input, fit = "cover") {
  const { main, thumb } = await standardiseImage(input, fit);

  const id = crypto.randomBytes(8).toString("hex");

  const [url, thumbUrl] = await Promise.all([
    store(`${id}.webp`, main),
    store(`${id}-thumb.webp`, thumb),
  ]);

  return {
    url,
    thumb: thumbUrl,
    bytes: main.length,
  };
}
