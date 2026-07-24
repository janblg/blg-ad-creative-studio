import sharp from "sharp";
import heicConvert from "heic-convert";

/**
 * Normalize any uploaded image to a clean 8-bit sRGB truecolor PNG that the
 * OpenAI image-edit endpoint reliably accepts. Handles the awkward cases:
 * iPhone HEIC (which Sharp can't decode), palette PNGs, CMYK/other
 * colorspaces, alpha, EXIF rotation, and oversized files.
 */

/** HEIC/HEIF magic: "ftyp" at offset 4, brand at offset 8. */
function isHeic(buf: Buffer): boolean {
  if (buf.length < 12) return false;
  if (buf.toString("ascii", 4, 8) !== "ftyp") return false;
  const brand = buf.toString("ascii", 8, 12).toLowerCase();
  return ["heic", "heix", "hevc", "hevx", "mif1", "msf1", "heim", "heis"].includes(brand);
}

async function heicToJpeg(buf: Buffer): Promise<Buffer> {
  const out = await heicConvert({ buffer: buf, format: "JPEG", quality: 0.92 });
  return Buffer.from(out);
}

async function sharpNormalize(buf: Buffer, max: number): Promise<Buffer> {
  return sharp(buf)
    .rotate()
    .flatten({ background: "#ffffff" })
    .resize(max, max, { fit: "inside", withoutEnlargement: true })
    .toColourspace("srgb")
    .png({ palette: false, compressionLevel: 9 })
    .toBuffer();
}

export async function normalizeToPng(input: Buffer, max = 1024): Promise<Buffer> {
  const src = isHeic(input) ? await heicToJpeg(input) : input;
  try {
    return await sharpNormalize(src, max);
  } catch {
    // Last-ditch: some HEICs don't match the magic check — try converting.
    if (!isHeic(input)) {
      try {
        return await sharpNormalize(await heicToJpeg(input), max);
      } catch {
        /* fall through */
      }
    }
    throw new Error(
      "That image format isn't supported. Please upload a JPG, PNG, or WebP (HEIC is fine too).",
    );
  }
}
