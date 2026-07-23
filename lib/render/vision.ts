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
  hook: string;
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
    required: ["canvas", "blocks"],
    properties: {
      canvas: {
        type: "object",
        required: ["width", "height"],
        properties: { width: { type: "number" }, height: { type: "number" } },
      },
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
            fontFamily: { type: "string", enum: ["headline", "body"] },
            fontSizePx: { type: "number" },
            fontWeight: { type: "number" },
            lineHeightEm: { type: "number" },
            maxWidthPct: { type: "number" },
            align: { type: "string", enum: ["left", "center", "right"] },
            uppercase: { type: "boolean" },
            letterSpacingPx: { type: "number" },
            color: { type: "string" },
            treatment: { type: "string", enum: ["plain", "outline", "box"] },
            strokeColor: { type: "string" },
            strokeWidthPx: { type: "number" },
            boxColor: { type: "string" },
            boxPaddingPx: { type: "number" },
            boxRadiusPx: { type: "number" },
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
  return `You are a senior performance-ad art director. You are handed a finished, TEXT-FREE photo for a social ad and must decide how to lay the hook text over it.

Canvas: ${p.canvas.width}x${p.canvas.height} px. Brand palette: ${palette}.
${p.hasLogo ? "A brand logo is available to place." : "No logo available."}

Rules:
- Place text in the photo's NEGATIVE SPACE; never cover faces or the product's focal point.
- Guarantee legibility: add a scrim behind the text and/or an outline/shadow when the background is busy or low-contrast.
- Split the hook into runs and emphasize the 1-2 most important words using an ACCENT brand color; keep the rest in a high-contrast color (usually white or a brand dark).
- Use the "headline" font for the hook. Size it to be punchy and readable on mobile (bold, often uppercase). Respect safe margins so nothing clips in Meta feed/story crops.
- Return exactly one layout via the emit_layout tool. Coordinates/sizes are for the given canvas.${mem}`;
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
              source: { type: "base64", media_type: "image/png", data: base64 },
            },
            {
              type: "text",
              text: `Hook to place: "${params.hook}"${extra ? `\n\n${extra}` : ""}`,
            },
          ],
        },
      ],
    });
    const tool = msg.content.find((b) => b.type === "tool_use");
    if (!tool || tool.type !== "tool_use") {
      throw new Error("Model did not return a layout.");
    }
    return layoutSpecSchema.parse(tool.input) as LayoutSpec;
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
