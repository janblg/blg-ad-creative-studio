/**
 * Brand font gatekeeping — pure Node, no native deps.
 *
 * Satori is fussy about fonts in two ways that are invisible until render time,
 * and both were hit for real with the first client's assets (Jump N Bounce):
 *
 *   GOTCHA #18 — satori cannot load WOFF2. Its README: "WOFF2 is not supported
 *   at the moment"; it throws `Unsupported OpenType signature wOF2`. This is
 *   not an edge case: WOFF2 is what Google Fonts serves browsers, so *any*
 *   font scraped off a client's website will be WOFF2.
 *
 *   GOTCHA #19 — a VARIABLE font does not merely render at the wrong weight,
 *   it crashes satori's opentype.js fork inside `parseFvarAxis` with
 *   `Cannot read properties of undefined (reading '256')`. Variable fonts must
 *   be instanced to static weights before upload.
 *
 * So we reject both at upload time with an actionable message, rather than
 * letting a brand save a font that detonates during a paid generation run.
 */

export type FontFormat = "ttf" | "otf" | "woff" | "woff2" | "ttc" | "unknown";

export interface FontCheck {
  ok: boolean;
  format: FontFormat;
  isVariable: boolean;
  /** Operator-facing explanation + the fix. Present when ok === false. */
  error?: string;
}

const tag = (buf: Buffer, at: number): string =>
  buf.length >= at + 4 ? buf.toString("latin1", at, at + 4) : "";

/** Identify the container from its 4-byte signature. */
export function sniffFontFormat(buf: Buffer): FontFormat {
  if (buf.length < 12) return "unknown";
  const sig = tag(buf, 0);
  if (sig === "wOF2") return "woff2";
  if (sig === "wOFF") return "woff";
  if (sig === "OTTO") return "otf";
  if (sig === "ttcf") return "ttc";
  // TrueType outlines: 0x00010000, or the legacy Mac 'true' signature.
  if (sig === "true") return "ttf";
  if (buf.readUInt32BE(0) === 0x00010000) return "ttf";
  return "unknown";
}

/**
 * True if the font carries an `fvar` table — i.e. it is a variable font.
 *
 * Reads the table directory directly. The record layout differs between a bare
 * sfnt (TTF/OTF) and a WOFF wrapper, so both are handled.
 */
export function isVariableFont(buf: Buffer, format: FontFormat): boolean {
  try {
    if (format === "ttf" || format === "otf") {
      // sfnt: numTables at offset 4; 16-byte records from offset 12.
      const numTables = buf.readUInt16BE(4);
      for (let i = 0; i < numTables; i++) {
        const at = 12 + i * 16;
        if (at + 4 > buf.length) break;
        if (tag(buf, at) === "fvar") return true;
      }
      return false;
    }
    if (format === "woff") {
      // WOFF: numTables at offset 12; 20-byte records from offset 44.
      const numTables = buf.readUInt16BE(12);
      for (let i = 0; i < numTables; i++) {
        const at = 44 + i * 20;
        if (at + 4 > buf.length) break;
        if (tag(buf, at) === "fvar") return true;
      }
      return false;
    }
    // woff2 is compressed and rejected anyway; ttc/unknown can't be trusted.
    return false;
  } catch {
    return false;
  }
}

/**
 * Gate a brand font upload. Accepts only what satori can genuinely render:
 * static TTF, OTF, or WOFF.
 */
export function validateBrandFont(buf: Buffer, filename = "font"): FontCheck {
  const format = sniffFontFormat(buf);

  if (format === "woff2") {
    return {
      ok: false,
      format,
      isVariable: false,
      error:
        `"${filename}" is a WOFF2 file, which the text renderer cannot read. ` +
        `WOFF2 is what Google Fonts serves to browsers, so this is normal for a ` +
        `font downloaded from a website. Upload a .ttf or .otf instead — for a ` +
        `Google font, the static .ttf is on the family's GitHub page under ofl/.`,
    };
  }

  if (format === "ttc") {
    return {
      ok: false,
      format,
      isVariable: false,
      error:
        `"${filename}" is a TrueType Collection (multiple fonts in one file), ` +
        `which the renderer cannot read. Upload a single .ttf or .otf.`,
    };
  }

  if (format === "unknown") {
    return {
      ok: false,
      format,
      isVariable: false,
      error:
        `"${filename}" is not a recognised font file. Accepted: .ttf, .otf, .woff.`,
    };
  }

  const variable = isVariableFont(buf, format);
  if (variable) {
    return {
      ok: false,
      format,
      isVariable: true,
      error:
        `"${filename}" is a variable font (it contains every weight in one ` +
        `file). The text renderer crashes on these. Upload a single fixed ` +
        `weight instead — e.g. "Rubik-Regular.ttf" rather than "Rubik[wght].ttf".`,
    };
  }

  return { ok: true, format, isVariable: false };
}

/** MIME type to store alongside the asset. */
export function fontMime(format: FontFormat): string {
  switch (format) {
    case "ttf":
      return "font/ttf";
    case "otf":
      return "font/otf";
    case "woff":
      return "font/woff";
    default:
      return "application/octet-stream";
  }
}
