import Anthropic from "@anthropic-ai/sdk";
import { ENGINE_DOC_B64 } from "./engine-doc";

/**
 * The Hyperrealism Prompt Engine. Claude is loaded with the full engine
 * document as its system prompt, takes a user's minimal brief (+ optional
 * product photos), and returns a resolved "visual system" + the final "master
 * prompt" sent to the image generator.
 *
 * Uses plain-text output (not forced tool JSON): with a ~51k-char system
 * prompt, forced tool calls sometimes come back empty; prose is reliable.
 */
const ENGINE_DOC = Buffer.from(ENGINE_DOC_B64, "base64").toString("utf8");
const MODEL = "claude-sonnet-5";

export interface MasterPromptResult {
  visualSystem: string;
  masterPrompt: string;
}

function parse(text: string): MasterPromptResult {
  const mp = text.search(/MASTER\s*PROMPT\s*:/i);
  if (mp === -1) return { visualSystem: "", masterPrompt: text.trim() };
  const masterPrompt = text.slice(mp).replace(/MASTER\s*PROMPT\s*:/i, "").trim();
  const before = text.slice(0, mp);
  const vs = before.search(/VISUAL\s*SYSTEM\s*:/i);
  const visualSystem = (vs === -1 ? before : before.slice(vs).replace(/VISUAL\s*SYSTEM\s*:/i, "")).trim();
  return { visualSystem, masterPrompt };
}

export async function buildMasterPrompt(opts: {
  brief: string;
  apiKey: string;
  aspect?: string;
  model?: string;
  brandContext?: string;
  /** Customer's real product photos, base64 (JPEG recommended, kept small). */
  referenceImages?: { b64: string; mime: string }[];
}): Promise<MasterPromptResult> {
  const client = new Anthropic({ apiKey: opts.apiKey });

  const system = `${ENGINE_DOC}

---
OPERATING INSTRUCTION: You ARE the Hyperrealism Prompt Engine defined above. The user provides a minimal brief (Subject + core action/state + key context + desired emotion, per §21). Apply the entire document.

Target image generator: OpenAI gpt-image-1 — strictly obey §14.3: natural declarative prose of roughly 80–200 words, and convert EVERY exclusion into a positive statement (never "no/not"; e.g. instead of "no text" write "all surfaces blank and unmarked"). Target aspect ratio ${opts.aspect ?? "4:5"}. Keep all surfaces free of readable text, logos, and watermarks by stating them blank. ${opts.brandContext ? `Brand art direction to honor: ${opts.brandContext}` : ""}${
    opts.referenceImages?.length
      ? `\n\nREFERENCE PRODUCT: The attached image(s) show the customer's ACTUAL product. The generated scene MUST feature this exact product. Describe its true form, proportions, colors, and materials precisely so it is preserved faithfully — do not substitute a different item. The same reference is also passed to the image generator to lock the product.`
      : ""
  }

Respond in EXACTLY this plain-text format and nothing else:
VISUAL SYSTEM:
<3–5 short lines resolving the eight realism variables>

MASTER PROMPT:
<the final 80–200 word prose prompt>`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const content: any[] = [];
  for (const r of opts.referenceImages ?? []) {
    content.push({
      type: "image",
      source: { type: "base64", media_type: r.mime, data: r.b64 },
    });
  }
  content.push({ type: "text", text: `Brief: ${opts.brief}` });

  const attempt = async (): Promise<MasterPromptResult> => {
    const msg = await client.messages.create({
      model: opts.model ?? MODEL,
      max_tokens: 2000,
      system,
      messages: [{ role: "user", content }],
    });
    const text = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    return parse(text);
  };

  let res = await attempt();
  if (!res.masterPrompt) res = await attempt();
  if (!res.masterPrompt) {
    throw new Error("Prompt engine produced an empty master prompt. Try again or simplify the brief.");
  }
  return res;
}
