/** Validate the prompt-engine → image flow locally. npx tsx scripts/test-engine.ts */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { buildMasterPrompt } from "../lib/prompt-engine/engine";
import { createOpenAIProvider } from "../lib/providers/image";

if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
  }
}
const OPENAI = process.env.OPENAI_API_KEY!;
const ANTHROPIC = process.env.ANTHROPIC_API_KEY!;
const OUT = process.env.OUT_DIR ?? ".";
const BRIEF = process.env.BRIEF ?? "kids laughing on a mechanical bull at a summer block party, pure joy";

async function main() {
  console.log(`Brief: "${BRIEF}"`);
  console.log("1/2  Running the Hyperrealism Prompt Engine (Claude)…");
  const { visualSystem, masterPrompt } = await buildMasterPrompt({ brief: BRIEF, apiKey: ANTHROPIC });
  console.log("\n--- VISUAL SYSTEM ---\n" + visualSystem);
  console.log("\n--- MASTER PROMPT ---\n" + masterPrompt + "\n");

  console.log("2/2  Generating image with gpt-image-1…");
  const [img] = await createOpenAIProvider(OPENAI).generate({
    prompt: masterPrompt, n: 1, quality: "medium", aspectRatio: "4:5",
  });
  const path = `${OUT}/engine-test.png`;
  writeFileSync(path, img.buffer);
  console.log(`\n✅ Wrote ${path} (${img.buffer.length} bytes)`);
}
main().catch((e) => { console.error("❌", e?.message ?? e); process.exit(1); });
