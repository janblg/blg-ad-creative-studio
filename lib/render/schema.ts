import { z } from "zod";

/**
 * Zod schema for the LayoutSpec that Claude (vision) returns. Kept structurally
 * identical to the hand-written types in ./types.ts; parsing with this yields a
 * valid LayoutSpec. Validating here lets us retry the model on malformed JSON.
 */
const anchor = z.enum([
  "top-left", "top-center", "top-right",
  "middle-left", "middle-center", "middle-right",
  "bottom-left", "bottom-center", "bottom-right",
]);

const hex = z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "hex color");

const textRun = z.object({
  text: z.string().min(1),
  color: hex.optional(),
});

const textBlock = z.object({
  runs: z.array(textRun).min(1),
  anchor,
  fontFamily: z.enum(["headline", "body"]),
  fontSizePx: z.number().positive(),
  fontWeight: z.number().optional(),
  lineHeightEm: z.number().positive().optional(),
  maxWidthPct: z.number().min(10).max(100).optional(),
  align: z.enum(["left", "center", "right"]).optional(),
  uppercase: z.boolean().optional(),
  letterSpacingPx: z.number().optional(),
  color: hex,
  treatment: z.enum(["plain", "outline", "box"]).optional(),
  strokeColor: hex.optional(),
  strokeWidthPx: z.number().optional(),
  boxColor: hex.optional(),
  boxPaddingPx: z.number().optional(),
  boxRadiusPx: z.number().optional(),
  shadow: z.boolean().optional(),
});

const scrim = z.object({
  position: z.enum(["top", "bottom", "full"]),
  color: hex,
  opacity: z.number().min(0).max(1),
  sizePct: z.number().min(0).max(100).optional(),
});

const logo = z.object({
  placement: anchor,
  widthPct: z.number().min(2).max(60),
  opacity: z.number().min(0).max(1).optional(),
});

export const layoutSpecSchema = z.object({
  canvas: z.object({ width: z.number().positive(), height: z.number().positive() }),
  safeMarginPct: z.number().min(0).max(25).optional(),
  scrim: scrim.optional(),
  blocks: z.array(textBlock).min(1),
  logo: logo.optional(),
});

export type LayoutSpecParsed = z.infer<typeof layoutSpecSchema>;
