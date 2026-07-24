/** Prove normalizeToPng fixes the OpenAI edit "invalid image file or mode". */
import { existsSync, readFileSync } from "node:fs";
import sharp from "sharp";
import { normalizeToPng } from "../lib/images/normalize";
import { createOpenAIProvider } from "../lib/providers/image";

if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
  }
}
const provider = createOpenAIProvider(process.env.OPENAI_API_KEY!);

async function tryEdit(label: string, buf: Buffer) {
  try {
    await provider.generate({
      prompt: "place this object on a sunny outdoor table, realistic photo",
      n: 1,
      quality: "low",
      aspectRatio: "1:1",
      referenceImages: [{ buffer: buf, mime: "image/png" }],
    });
    console.log(`${label}: ✅ accepted`);
  } catch (e) {
    console.log(`${label}: ❌ ${e instanceof Error ? e.message.slice(0, 120) : e}`);
  }
}

async function main() {
  // A palette PNG WITH alpha — the kind of "bad mode" that trips the endpoint.
  const bad = await sharp({
    create: { width: 300, height: 200, channels: 4, background: { r: 30, g: 80, b: 220, alpha: 0.6 } },
  })
    .png({ palette: true, colours: 8 })
    .toBuffer();
  console.log("built bad-mode png:", bad.length, "bytes");

  await tryEdit("RAW (palette+alpha)", bad);
  const good = await normalizeToPng(bad, 1024);
  await tryEdit("NORMALIZED", good);
}
main().catch((e) => { console.error(e); process.exit(1); });
