import { readFileSync } from "node:fs";
import path from "node:path";
import type { BrandFont } from "./types";

/**
 * Bundled default fonts (OFL-licensed, committed under /fonts so they exist
 * on Vercel). Used until a brand uploads its own font files; per-brand fonts
 * from Storage will take precedence later.
 */
export function defaultFonts(): BrandFont[] {
  const dir = path.join(process.cwd(), "fonts");
  return [
    {
      role: "headline",
      data: readFileSync(path.join(dir, "Anton-Regular.ttf")),
      weight: 400, // Anton is single-weight; it *looks* ultra-bold.
    },
    {
      role: "body",
      data: readFileSync(path.join(dir, "Barlow-SemiBold.ttf")),
      weight: 600,
    },
  ];
}
