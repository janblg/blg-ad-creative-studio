/**
 * End-to-end proof: real photo (gpt-image-1) -> Claude vision layout -> render.
 * Uses the SAME lib modules the app uses. No Supabase needed.
 *
 * Setup: create `.env.local` in the project root with:
 *   OPENAI_API_KEY=sk-...
 *   ANTHROPIC_API_KEY=sk-ant-...
 *
 * Run:  npx tsx scripts/prove-generation.ts
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createOpenAIProvider } from "../lib/providers/image";
import { generateLayout } from "../lib/render/vision";
import { renderCreative } from "../lib/render/overlay";
import type { BrandStyle } from "../lib/render/types";

// --- tiny .env.local loader (no extra deps) ---
if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
    }
  }
}

const OPENAI = process.env.OPENAI_API_KEY;
const ANTHROPIC = process.env.ANTHROPIC_API_KEY;
const OUT = process.env.OUT_DIR ?? ".";

if (!OPENAI || !ANTHROPIC) {
  console.error(
    "Missing keys. Put OPENAI_API_KEY and ANTHROPIC_API_KEY in .env.local (see top of this file).",
  );
  process.exit(1);
}

// The kind of prompt the tool will generate from a brand's photography style.
const PROMPT = `Editorial lifestyle photograph: two joyful kids mid-jump inside a vibrant inflatable bounce castle at a sunny suburban backyard birthday party. Golden-hour side light, shallow depth of field, shot on an 85mm f/1.8 lens, crisp candid motion, warm colorful atmosphere, professional advertising photography.`;

const HOOK = "The party they'll still talk about next summer.";

const PALETTE = [
  { hex: "#1E40AF", role: "primary" },
  { hex: "#FFD23F", role: "accent" },
  { hex: "#FFFFFF", role: "text" },
];

const CANVAS = { width: 1080, height: 1350 };

async function main() {
  console.log("1/3  Generating photo with gpt-image-1 (this takes ~15-30s)…");
  const provider = createOpenAIProvider(OPENAI!);
  const [photo] = await provider.generate({
    prompt: PROMPT,
    aspectRatio: "4:5",
    n: 1,
    quality: "medium",
  });
  console.log(`      got photo (${photo.buffer.length} bytes)`);

  console.log("2/3  Asking Claude to design the text layout…");
  const layout = await generateLayout({
    photoPng: photo.buffer,
    hook: HOOK,
    palette: PALETTE,
    canvas: CANVAS,
    hasLogo: false,
    apiKey: ANTHROPIC!,
  });
  console.log(`      layout: ${layout.blocks.length} text block(s), scrim=${!!layout.scrim}`);

  console.log("3/3  Rendering the finished creative…");
  const style: BrandStyle = {
    fonts: [
      { role: "headline", data: readFileSync("/System/Library/Fonts/Supplemental/Impact.ttf"), weight: 800 },
      { role: "body", data: readFileSync("/System/Library/Fonts/Supplemental/Arial.ttf"), weight: 400 },
    ],
  };
  const png = await renderCreative({ background: photo.buffer, style, layout });

  const path = `${OUT}/proof-creative.png`;
  writeFileSync(path, png);
  console.log(`\n✅ Done. Wrote ${path} (${png.length} bytes)`);
}

main().catch((e) => {
  console.error("\n❌ Failed:", e?.message ?? e);
  process.exit(1);
});
