/**
 * Shrinks a photo in the browser before upload so even a 12 MB phone picture
 * fits inside the server's request limit. The server then produces the final
 * standard sizes (see lib/images.js).
 */
export async function shrinkImage(file, maxSide = 2200) {
  if (file.size < 1_500_000) return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
    return blob && blob.size < file.size ? new File([blob], "upload.jpg", { type: "image/jpeg" }) : file;
  } catch {
    return file; // unknown format: let the server try
  }
}
