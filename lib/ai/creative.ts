import Anthropic from "@anthropic-ai/sdk";
import { HOOK_DOC_B64 } from "@/lib/hook-engine/hook-doc";

/**
 * Hook + Meta ad copy generation. Hooks are the short emotional lines that
 * get designed ONTO the creative; copy is the Meta interface text (primary
 * text / headline / CTA) that lives next to it.
 *
 * Hook generation is governed by HOOK_ENGINE.md (loaded as the system prompt),
 * with plain-text block output per its §12 contract — no forced tool-JSON at
 * this system-prompt size (HANDOFF gotcha #5). Its §3 hard constraints are
 * re-checked MECHANICALLY here; a violating hook is dropped, not softened.
 */
const MODEL = "claude-sonnet-5";
const HOOK_DOC = Buffer.from(HOOK_DOC_B64, "base64").toString("utf8");

export type HookOrigin = "winner_variation" | "experiment";

export interface GeneratedHook {
  text: string;
  framework: string;
  origin: HookOrigin;
  negative: boolean;
  /** The word/short phrase nominated to carry the accent color (§8.2). */
  emphasis: string;
  /** One-sentence directive for the image engine (§8.1). */
  visual: string;
  why: string;
}

/** Parse the §12 plain-text block contract. Tolerant of case and spacing. */
export function parseHookBlocks(text: string): GeneratedHook[] {
  const hooks: GeneratedHook[] = [];
  for (const raw of text.split(/---\s*HOOK\s*---/i).slice(1)) {
    const field = (name: string) => {
      const m = raw.match(new RegExp(`^\\s*${name}\\s*:\\s*(.+)$`, "im"));
      return m ? m[1].trim() : "";
    };
    const hook: GeneratedHook = {
      text: field("TEXT"),
      framework: field("FRAMEWORK"),
      origin: /winner/i.test(field("ORIGIN")) ? "winner_variation" : "experiment",
      negative: /^y/i.test(field("NEGATIVE")),
      emphasis: field("EMPHASIS"),
      visual: field("VISUAL"),
      why: field("WHY"),
    };
    if (hook.text) hooks.push(hook);
  }
  return hooks;
}

/**
 * HOOK_ENGINE §3 + §6 + §9, enforced mechanically across the set:
 * word count ≤12 (≥3), ≤80% negative, same framework ≤2×, and — until
 * meta_insights has data — origin forced to `experiment` (never fabricate
 * evidence).
 */
export function validateHookSet(
  hooks: GeneratedHook[],
  opts: { hasInsights: boolean },
): GeneratedHook[] {
  const out: GeneratedHook[] = [];
  const perFramework = new Map<string, number>();

  for (const h of hooks) {
    const words = h.text.split(/\s+/).filter(Boolean).length;
    if (words < 3 || words > 12) continue;

    const fw = h.framework.toLowerCase().replace(/[^a-z]/g, "");
    const used = perFramework.get(fw) ?? 0;
    if (used >= 2) continue;
    perFramework.set(fw, used + 1);

    out.push(opts.hasInsights ? h : { ...h, origin: "experiment" });
  }

  // Negativity cap: drop negatives from the END until ≤80% of the set.
  const cap = () => Math.floor(out.length * 0.8);
  while (out.length > 0 && out.filter((h) => h.negative).length > cap()) {
    const lastNeg = [...out].reverse().find((h) => h.negative);
    if (!lastNeg) break;
    out.splice(out.indexOf(lastNeg), 1);
  }
  return out;
}

export async function generateHooks(opts: {
  apiKey: string;
  brandName: string;
  brief: string;
  count?: number;
  brandContext?: string;
  memoryNotes?: string[];
}): Promise<GeneratedHook[]> {
  const client = new Anthropic({ apiKey: opts.apiKey });
  const n = opts.count ?? 10;

  const system = `${HOOK_DOC}

---
OPERATING INSTRUCTION: You ARE the Hook Engine defined above. Generate ${n} hooks for the brief below, following every law, constraint and the §12 output contract exactly — plain text blocks only, nothing before the first block or after the last.

Current data state (§9): meta_insights is EMPTY. Tag every hook ORIGIN: experiment.${
    opts.brandContext ? `\n\nBrand context:\n${opts.brandContext}` : ""
  }${
    opts.memoryNotes?.length
      ? `\n\nLearned brand preferences:\n- ${opts.memoryNotes.join("\n- ")}`
      : ""
  }`;

  const attempt = async (): Promise<GeneratedHook[]> => {
    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: 4500, // 10 full §12 blocks with VISUAL/WHY sentences
      system,
      messages: [
        {
          role: "user",
          content: `Brand: ${opts.brandName}. Creative brief: ${opts.brief}. Generate ${n} hooks.`,
        },
      ],
    });
    const text = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    return validateHookSet(parseHookBlocks(text), { hasInsights: false });
  };

  let hooks = await attempt();
  // Retry only when the set is truly broken — a retry doubles latency and the
  // Studio call runs inside one serverless invocation.
  if (hooks.length < 3) hooks = [...hooks, ...(await attempt())].slice(0, n);
  if (hooks.length === 0) throw new Error("Hook engine produced no valid hooks.");
  return hooks.slice(0, n);
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
