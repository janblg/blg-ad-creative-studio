import Anthropic from "@anthropic-ai/sdk";

/**
 * Hook + Meta ad copy generation. Hooks are the short emotional lines that
 * get designed ONTO the creative; copy is the Meta interface text (primary
 * text / headline / CTA) that lives next to it.
 */
const MODEL = "claude-sonnet-5";

export async function generateHooks(opts: {
  apiKey: string;
  brandName: string;
  brief: string;
  count?: number;
  memoryNotes?: string[];
}): Promise<string[]> {
  const client = new Anthropic({ apiKey: opts.apiKey });
  const n = opts.count ?? 5;
  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 1200,
    system: `You are a world-class Meta ads creative strategist. You write HOOKS: the short text overlaid on an ad image. A great hook is 4-10 words, concrete, emotional, curiosity- or identity-driven, written for the scroll. Never generic ("Quality you can trust"), never salesy jargon. Vary the angles: outcome, social proof, fear-of-regret, identity, sensory moment.${
      opts.memoryNotes?.length ? `\nLearned brand preferences:\n- ${opts.memoryNotes.join("\n- ")}` : ""
    }`,
    tools: [
      {
        name: "emit_hooks",
        description: "Return the hook options.",
        input_schema: {
          type: "object" as const,
          required: ["hooks"],
          properties: {
            hooks: { type: "array" as const, items: { type: "string" as const } },
          },
        },
      },
    ],
    tool_choice: { type: "tool", name: "emit_hooks" },
    messages: [
      {
        role: "user",
        content: `Brand: ${opts.brandName}. Creative context: ${opts.brief}. Write ${n} distinct hooks.`,
      },
    ],
  });
  const tool = msg.content.find((b) => b.type === "tool_use");
  if (!tool || tool.type !== "tool_use") throw new Error("No hooks returned.");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hooks = ((tool.input as any).hooks ?? []) as string[];
  return hooks.filter(Boolean).slice(0, n);
}

export interface AdCopy {
  primaryText: string;
  headline: string;
  cta: string;
}

export async function generateAdCopy(opts: {
  apiKey: string;
  brandName: string;
  brief: string;
  hook: string;
  memoryNotes?: string[];
}): Promise<AdCopy> {
  const client = new Anthropic({ apiKey: opts.apiKey });
  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 1200,
    system: `You write Meta (Facebook/Instagram) ad interface copy. Primary text: short lines, generous line breaks, emotional narrative arc ending in a soft CTA — the style of high-performing local-service ads. Headline: under 8 words, benefit-led. CTA: one of Meta's standard buttons (e.g. "Book Now", "Learn More", "Get Quote"). The HOOK already lives on the image — do not repeat it verbatim; complement it.${
      opts.memoryNotes?.length ? `\nLearned brand preferences:\n- ${opts.memoryNotes.join("\n- ")}` : ""
    }`,
    tools: [
      {
        name: "emit_copy",
        description: "Return the ad copy.",
        input_schema: {
          type: "object" as const,
          required: ["primaryText", "headline", "cta"],
          properties: {
            primaryText: { type: "string" as const },
            headline: { type: "string" as const },
            cta: { type: "string" as const },
          },
        },
      },
    ],
    tool_choice: { type: "tool", name: "emit_copy" },
    messages: [
      {
        role: "user",
        content: `Brand: ${opts.brandName}. Creative context: ${opts.brief}. Hook on the image: "${opts.hook}". Write the Meta copy.`,
      },
    ],
  });
  const tool = msg.content.find((b) => b.type === "tool_use");
  if (!tool || tool.type !== "tool_use") throw new Error("No copy returned.");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const input = tool.input as any;
  return {
    primaryText: String(input.primaryText ?? ""),
    headline: String(input.headline ?? ""),
    cta: String(input.cta ?? ""),
  };
}
