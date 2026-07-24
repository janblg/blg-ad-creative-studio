import sharp from "sharp";

/**
 * Normalize any uploaded image to a clean 8-bit sRGB truecolor PNG that the
 * OpenAI image-edit endpoint reliably accepts. Uploads can arrive as palette
 * PNGs, CMYK/other colorspaces, alpha-only, EXIF-rotated, or huge — all of
 * which trigger "invalid image file or mode". This flattens those out.
 */
export async function normalizeToPng(input: Buffer, max = 1024): Promise<Buffer> {
  return sharp(input)
    .rotate() // apply EXIF orientation, then drop it
    .flatten({ background: "#ffffff" }) // remove alpha -> solid RGB
    .resize(max, max, { fit: "inside", withoutEnlargement: true })
    .toColourspace("srgb")
    .png({ palette: false, compressionLevel: 9 })
    .toBuffer();
}
