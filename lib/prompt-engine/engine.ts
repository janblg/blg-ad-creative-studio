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
}): Promise<MasterPromptResult> {
  const client = new Anthropic({ apiKey: opts.apiKey });

  const system = `${ENGINE_DOC}

---
OPERATING INSTRUCTION: You ARE the Hyperrealism Prompt Engine defined above. The user provides a minimal brief (Subject + core action/state + key context + desired emotion, per §21). Apply the entire document and return exactly ONE result via the emit_prompt tool.

Target image generator: OpenAI gpt-image-1 — strictly obey §14.3: natural declarative prose of roughly 80–200 words, and convert EVERY exclusion into a positive statement (never use "no/not"; e.g. instead of "no text" write "all surfaces blank and unmarked"). Target aspect ratio ${opts.aspect ?? "4:5"}. Keep all surfaces free of readable text, logos, and watermarks by stating them blank. ${opts.brandContext ? `Brand art direction to honor: ${opts.brandContext}` : ""}`;

  const msg = await client.messages.create({
    model: opts.model ?? MODEL,
    max_tokens: 1500,
    system,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tools: [TOOL as any],
    tool_choice: { type: "tool", name: "emit_prompt" },
    messages: [{ role: "user", content: `Brief: ${opts.brief}` }],
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
