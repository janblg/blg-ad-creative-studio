import Anthropic from "@anthropic-ai/sdk";
import { layoutSpecSchema } from "./schema";
import type { LayoutSpec } from "./types";

/**
 * Claude-as-art-director. Given the generated (text-free) photo, the approved
 * hook, and the brand palette, Claude decides how the hook text + logo should
 * be composed over the image — where the negative space is, which words to
 * emphasize in which brand color, and how to keep it legible. It returns a
 * LayoutSpec that the renderer turns into crisp vector text.
 */

const VISION_MODEL = "claude-sonnet-5";

export interface BrandColor {
  hex: string;
  role?: string; // 'primary' | 'accent' | 'text' | ...
}

export interface GenerateLayoutParams {
  photoPng: Buffer;
  /** Media type of `photoPng` — pass "image/jpeg" for the small vision JPEG. */
  photoMime?: "image/png" | "image/jpeg";
  hook: string;
  /** Nominated accent word/phrase — the tension word (HOOK_ENGINE §8.2). */
  emphasis?: string;
  palette: BrandColor[];
  canvas: { width: number; height: number };
  hasLogo: boolean;
  apiKey: string;
  model?: string;
  /** Learned, prompt-ready visual preferences for this brand. */
  memoryNotes?: string[];
}

const LAYOUT_TOOL = {
  name: "emit_layout",
  description:
    "Return the layout spec for compositing the hook text and logo over the photo.",
  input_schema: {
    type: "object",
    required: ["blocks"],
    properties: {
      safeMarginPct: { type: "number" },
      scrim: {
        type: "object",
        properties: {
          position: { type: "string", enum: ["top", "bottom", "full"] },
          color: { type: "string" },
          opacity: { type: "number" },
          sizePct: { type: "number" },
        },
      },
      blocks: {
        type: "array",
        items: {
          type: "object",
          required: ["runs", "anchor", "fontFamily", "fontSizePx", "color"],
          properties: {
            runs: {
              type: "array",
              items: {
                type: "object",
                required: ["text"],
                properties: {
                  text: { type: "string" },
                  color: { type: "string" },
                  underline: { type: "boolean" },
                  underlineColor: { type: "string" },
                },
              },
            },
            anchor: {
              type: "string",
              enum: [
                "top-left", "top-center", "top-right",
                "middle-left", "middle-center", "middle-right",
                "bottom-left", "bottom-center", "bottom-right",
              ],
            },
            fontFamily: { type: "string", enum: ["headline", "body", "accent"] },
            fontSizePx: { type: "number" },
            fontWeight: { type: "number" },
            lineHeightEm: { type: "number" },
            maxWidthPct: { type: "number" },
            align: { type: "string", enum: ["left", "center", "right"] },
            uppercase: { type: "boolean" },
            letterSpacingPx: { type: "number" },
            color: { type: "string" },
            treatment: { type: "string", enum: ["plain", "outline", "box", "highlight"] },
            strokeColor: { type: "string" },
            strokeWidthPx: { type: "number" },
            boxColor: { type: "string" },
            boxPaddingPx: { type: "number" },
            boxRadiusPx: { type: "number" },
            highlightColor: { type: "string" },
            rotateDeg: { type: "number" },
            shadow: { type: "boolean" },
          },
        },
      },
      logo: {
        type: "object",
        properties: {
          placement: { type: "string" },
          widthPct: { type: "number" },
          opacity: { type: "number" },
        },
      },
    },
  },
} as const;

function systemPrompt(p: GenerateLayoutParams): string {
  const palette = p.palette
    .map((c) => `${c.hex}${c.role ? ` (${c.role})` : ""}`)
    .join(", ");
  const mem = p.memoryNotes?.length
    ? `\n\nLearned preferences for this brand — follow them:\n- ${p.memoryNotes.join("\n- ")}`
    : "";
  return `You are a senior performance-ad art director for local-service Meta ads. You are handed a finished, TEXT-FREE photo and must DESIGN the hook onto it — flyer-style, like the best party-rental ads: a stacked composition of 2-4 short lines with mixed typography, not one uniform caption.

Canvas: ${p.canvas.width}x${p.canvas.height} px. Brand palette: ${palette}.
${p.hasLogo ? "A brand logo is available to place." : "No logo available."}

THE FLYER GRAMMAR (this is the look — follow it):
- Break the hook into 2-4 stacked lines, each line its own block ON THE SAME ANCHOR (the renderer stacks same-anchor blocks in order, top to bottom).
- Use the hook's words VERBATIM, in order — you choose the line breaks and styling, but never add, drop, or replace a word.
- Alternate type voices line by line: connective/emotional words ("Your", "the", "don't forget") in the "accent" script font, mixed case, usually white; the POWER words in the "headline" font, uppercase, big — 1.5-2.5x the script size.
- Give exactly ONE line the "highlight" treatment (a painted brush-stroke bar) with highlightColor = a strong brand color, and white text on it. Usually the line carrying the emphasis. Never highlight more than one line.
- A small tilt sells the hand-made energy: rotateDeg between -4 and 0 on the stacked lines (use the same value so they tilt together), 0 for a formal brand.
- A short final sub-line (body font, much smaller, letterSpacingPx 1-2, uppercase) may carry a qualifier; underline its key words with underline + underlineColor = accent.
- Vary line sizes boldly — a flyer is typographic rhythm, not a paragraph.

HARD RULES (unchanged):
- Compose in the photo's NEGATIVE SPACE; never cover faces or the product's focal point. Usually the stack lives in the top or bottom band.
- Legibility first: scrim behind the stack and/or outline/shadow on non-highlighted lines when the background is busy.
- The emphasis word/phrase gets the accent brand color (or sits on the highlight bar).
- Respect safe margins; nothing clips in Meta feed crops. Coordinates/sizes are for the given canvas.
- Return exactly one layout via the emit_layout tool.${mem}`;
}

export async function generateLayout(
  params: GenerateLayoutParams,
): Promise<LayoutSpec> {
  const client = new Anthropic({ apiKey: params.apiKey });
  const base64 = params.photoPng.toString("base64");

  const run = async (extra?: string): Promise<LayoutSpec> => {
    const msg = await client.messages.create({
      model: params.model ?? VISION_MODEL,
      max_tokens: 2000,
      system: systemPrompt(params),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tools: [LAYOUT_TOOL as any],
      tool_choice: { type: "tool", name: "emit_layout" },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: params.photoMime ?? "image/png",
                data: base64,
              },
            },
            {
              type: "text",
              text: `Hook to place: "${params.hook}"${
                params.emphasis
                  ? `\nThe accent color MUST land on exactly: "${params.emphasis}" — split runs accordingly.`
                  : ""
              }${extra ? `\n\n${extra}` : ""}`,
            },
          ],
        },
      ],
    });
    const tool = msg.content.find((b) => b.type === "tool_use");
    if (!tool || tool.type !== "tool_use") {
      throw new Error("Model did not return a layout.");
    }
    const parsed = layoutSpecSchema.parse(tool.input);
    // Canvas is the caller's fact, not the model's: always inject it.
    return { ...parsed, canvas: params.canvas } as LayoutSpec;
  };

  try {
    return await run();
  } catch (err) {
    // One corrective retry with the validation error as guidance.
    const hint =
      err instanceof Error ? `Your previous output was invalid: ${err.message}. Fix it.` : undefined;
    return await run(hint);
  }
}
