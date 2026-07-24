/** Validate reference-image (product) flow. npx tsx scripts/test-reference.ts */
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
const REF = process.env.REF!; // path to a product image
const BRIEF = process.env.BRIEF ?? "this exact ride set up indoors at a bright family entertainment center at night, kids waiting their turn";

async function main() {
  const buf = readFileSync(REF);
  const ref = { buffer: buf, mime: "image/png" };
  console.log(`Reference: ${REF} (${buf.length} bytes)\nBrief: "${BRIEF}"`);

  console.log("1/2  Engine reading the product image + writing master prompt…");
  const { visualSystem, masterPrompt } = await buildMasterPrompt({
    brief: BRIEF, apiKey: ANTHROPIC, referenceImages: [{ b64: buf.toString("base64"), mime: "image/png" }],
  });
  console.log(`\n[visualSystem ${visualSystem.length} chars, masterPrompt ${masterPrompt.length} chars]`);
  console.log("\n--- MASTER PROMPT ---\n" + masterPrompt + "\n");
  if (!masterPrompt) throw new Error("Empty master prompt — aborting before image gen.");

  console.log("2/2  Generating with the product locked (images/edits)…");
  const [img] = await createOpenAIProvider(OPENAI).generate({
    prompt: masterPrompt, n: 1, quality: "medium", aspectRatio: "4:5", referenceImages: [ref],
  });
  const path = `${OUT}/reference-test.png`;
  writeFileSync(path, img.buffer);
  console.log(`\n✅ Wrote ${path} (${img.buffer.length} bytes)`);
}
main().catch((e) => { console.error("❌", e?.message ?? e); process.exit(1); });
