import sharp from "sharp";
import heicConvert from "heic-convert";

/**
 * Normalize any uploaded image to a clean 8-bit sRGB truecolor PNG that the
 * OpenAI image-edit endpoint reliably accepts. Handles iPhone HEIC (which
 * Sharp can't decode), palette PNGs, other colorspaces, alpha, EXIF rotation,
 * oversized files, and mildly-malformed data. On total failure it throws a
 * diagnostic error naming what it actually received.
 */
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

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

async function sharpNormalize(buf: Buffer, max: number, lenient = false): Promise<Buffer> {
  return sharp(buf, lenient ? { failOn: "none" } : {})
    .rotate()
    .flatten({ background: "#ffffff" })
    .resize(max, max, { fit: "inside", withoutEnlargement: true })
    .toColourspace("srgb")
    .png({ palette: false, compressionLevel: 9 })
    .toBuffer();
}

export async function normalizeToPng(input: Buffer, max = 1024): Promise<Buffer> {
  const heic = isHeic(input);
  const errors: string[] = [];

  // 1) primary path
  try {
    return await sharpNormalize(heic ? await heicToJpeg(input) : input, max);
  } catch (e) {
    errors.push(`primary: ${msg(e)}`);
  }
  // 2) force HEIC decode even if magic didn't match
  try {
    return await sharpNormalize(await heicToJpeg(input), max);
  } catch (e) {
    errors.push(`heic: ${msg(e)}`);
  }
  // 3) lenient sharp (tolerates truncated/odd files)
  try {
    return await sharpNormalize(input, max, true);
  } catch (e) {
    errors.push(`lenient: ${msg(e)}`);
  }

  const sig = input.subarray(0, 12).toString("hex");
  throw new Error(
    `Unsupported image (${input.length}b, sig=${sig}, heicMagic=${heic}). ${errors.join(" | ")}`,
  );
}
