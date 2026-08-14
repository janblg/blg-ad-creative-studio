import Anthropic from "@anthropic-ai/sdk";

/**
 * Choosing which five catalog items to put in front of the specialist.
 *
 * A rental category can hold 50+ near-identical listings ("20 Ft ...", "22 Ft
 * ..."). Alphabetical order would surface five variants of the same slide, so
 * the model picks for SPREAD — different sizes, themes and use-cases — which
 * is what makes a batch of ads worth running.
 */
const MODEL = "claude-sonnet-5";

export interface PickedProduct {
  id: string;
  why?: string;
}

export async function pickProducts(opts: {
  apiKey: string;
  category: string;
  products: { id: string; name: string }[];
}): Promise<PickedProduct[]> {
  const client = new Anthropic({ apiKey: opts.apiKey });

  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 900,
    system: `You help a paid-ads specialist choose which rental products to advertise.

Given a category's inventory, pick exactly 5 that would make the strongest and most DIFFERENT Meta ads. Optimise for spread, not for what sounds best individually:
- vary size, theme and use-case (a themed kids' unit, a large centrepiece, a wet option, a crowd-pleaser, something distinctive)
- avoid picking near-duplicates that differ only by a foot or a color
- prefer items whose name is concrete and visual — they generate better images

For each pick give a 6-10 word reason aimed at the specialist.`,
    tools: [
      {
        name: "emit_picks",
        description: "Return the five chosen products.",
        input_schema: {
          type: "object" as const,
          required: ["picks"],
          properties: {
            picks: {
              type: "array" as const,
              items: {
                type: "object" as const,
                required: ["id"],
                properties: {
                  id: { type: "string" as const },
                  why: { type: "string" as const },
                },
              },
            },
          },
        },
      },
    ],
    tool_choice: { type: "tool", name: "emit_picks" },
    messages: [
      {
        role: "user",
        content: `Category: ${opts.category}\n\nInventory:\n${opts.products
          .map((p) => `${p.id} :: ${p.name}`)
          .join("\n")}`,
      },
    ],
  });

  const tool = msg.content.find((b) => b.type === "tool_use");
  if (!tool || tool.type !== "tool_use") return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const picks = ((tool.input as any).picks ?? []) as PickedProduct[];
  return picks.filter((p) => typeof p.id === "string");
}
