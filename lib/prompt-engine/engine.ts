import Anthropic from "@anthropic-ai/sdk";
import { ENGINE_DOC_B64 } from "./engine-doc";

/**
 * The Hyperrealism Prompt Engine. Claude is loaded with the full engine
 * document as its system prompt, takes a user's minimal brief, and returns a
 * resolved "visual system" + the final "master prompt" that gets sent to the
 * image generator. This is the trained brain between the user and gpt-image-1.
 */
const ENGINE_DOC = Buffer.from(ENGINE_DOC_B64, "base64").toString("utf8");
const MODEL = "claude-sonnet-5";

export interface MasterPromptResult {
  visualSystem: string;
  masterPrompt: string;
}

const TOOL = {
  name: "emit_prompt",
  description: "Return the engineered visual system and the final master prompt.",
  input_schema: {
    type: "object",
    required: ["visualSystem", "masterPrompt"],
    properties: {
      visualSystem: {
        type: "string",
        description:
          "Concise resolution of the eight realism variables (capture system, optical behavior, light physics, subject behavior, spatial evidence, material truth, color science, imperfection budget). A few short lines.",
      },
      masterPrompt: {
        type: "string",
        description:
          "The final prompt to send to the image generator, assembled in the section-12 order and tuned for the target engine.",
      },
    },
  },
} as const;

export async function buildMasterPrompt(opts: {
  brief: string;
  apiKey: string;
  aspect?: string;
  model?: string;
  brandContext?: string;
  /** Customer's real product photos, base64. The engine describes them
   * faithfully so the generated scene features the actual product. */
  referenceImages?: { b64: string; mime: string }[];
}): Promise<MasterPromptResult> {
  const client = new Anthropic({ apiKey: opts.apiKey });

  const system = `${ENGINE_DOC}

---
OPERATING INSTRUCTION: You ARE the Hyperrealism Prompt Engine defined above. The user provides a minimal brief (Subject + core action/state + key context + desired emotion, per §21). Apply the entire document and return exactly ONE result via the emit_prompt tool.

Target image generator: OpenAI gpt-image-1 — strictly obey §14.3: natural declarative prose of roughly 80–200 words, and convert EVERY exclusion into a positive statement (never use "no/not"; e.g. instead of "no text" write "all surfaces blank and unmarked"). Target aspect ratio ${opts.aspect ?? "4:5"}. Keep all surfaces free of readable text, logos, and watermarks by stating them blank. ${opts.brandContext ? `Brand art direction to honor: ${opts.brandContext}` : ""}${
    opts.referenceImages?.length
      ? `\n\nREFERENCE PRODUCT: The attached image(s) show the customer's ACTUAL product. The generated scene MUST feature this exact product. In the master prompt, describe its true form, proportions, colors, and materials precisely so it is preserved faithfully — do not substitute a generic or different item. The same reference image is also passed to the image generator to lock the product.`
      : ""
  }`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const content: any[] = [];
  for (const r of opts.referenceImages ?? []) {
    content.push({
      type: "image",
      source: { type: "base64", media_type: r.mime, data: r.b64 },
    });
  }
  content.push({ type: "text", text: `Brief: ${opts.brief}` });

  const msg = await client.messages.create({
    model: opts.model ?? MODEL,
    max_tokens: 4000,
    system,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tools: [TOOL as any],
    tool_choice: { type: "tool", name: "emit_prompt" },
    messages: [{ role: "user", content }],
  });

  const tool = msg.content.find((b) => b.type === "tool_use");
  if (!tool || tool.type !== "tool_use") {
    throw new Error("Prompt engine did not return a result.");
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const input = tool.input as any;
  return {
    visualSystem: String(input.visualSystem ?? ""),
    masterPrompt: String(input.masterPrompt ?? ""),
  };
}
