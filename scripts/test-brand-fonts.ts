/**
 * Validates a real client's brand assets against the render engine — no API keys.
 *
 * Answers three questions before we build the brand-profile editor on top:
 *   1. Do the brand's font files actually load into satori? (WOFF2 does NOT —
 *      satori's README: "WOFF2 is not supported at the moment".)
 *   2. Does a variable font render, or do we need static instances?
 *   3. Which brand accent color survives over a photo as hook text?
 *
 * Run:  BRAND_DIR=/path/to/assets npx tsx scripts/test-brand-fonts.ts
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { renderCreative } from "../lib/render/overlay";
import { validateBrandFont } from "../lib/render/font-validate";
import type { BrandStyle, LayoutSpec } from "../lib/render/types";

const BRAND_DIR = process.env.BRAND_DIR ?? ".";
const OUT = process.env.OUT_DIR ?? ".";
const W = 1080;
const H = 1350; // 4:5 Meta feed

// Jump N Bounce, from brand.json
const JNB = {
  blue: "#01509B",
  red: "#FF0000",
  white: "#FFFFFF",
  dark: "#111111",
};

/** Stand-in for the gpt-image-1 photo: a busy outdoor scene to stress legibility. */
async function makeBackground(): Promise<Buffer> {
  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#3a7bd5"/>
        <stop offset="40%" stop-color="#9fd0ff"/>
        <stop offset="68%" stop-color="#ffe1a8"/>
        <stop offset="100%" stop-color="#c96f2a"/>
      </linearGradient>
      <radialGradient id="sun" cx="70%" cy="24%" r="26%">
        <stop offset="0%" stop-color="#fffaf0" stop-opacity="0.98"/>
        <stop offset="100%" stop-color="#fffaf0" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#sky)"/>
    <rect width="${W}" height="${H}" fill="url(#sun)"/>
    <rect y="${H * 0.78}" width="${W}" height="${H * 0.22}" fill="#4e7a33"/>
    <circle cx="300" cy="820" r="190" fill="#e34b4b" opacity="0.92"/>
    <circle cx="760" cy="880" r="150" fill="#ffd23f" opacity="0.9"/>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

function tryLoad(label: string, file: string): Buffer | null {
  const p = path.join(BRAND_DIR, file);
  if (!existsSync(p)) {
    console.log(`  ${label.padEnd(26)} MISSING  ${p}`);
    return null;
  }
  const buf = readFileSync(p);
  console.log(`  ${label.padEnd(26)} ${String(buf.length).padStart(7)}b  ${file}`);
  return buf;
}

/** Hook from HOOK_ENGINE.md §6 (Outcome-Based), with EMPHASIS on the tension phrase. */
function layoutFor(accent: string): LayoutSpec {
  return {
    canvas: { width: W, height: H },
    safeMarginPct: 6,
    // 4:5 rule from HOOK_ENGINE §8.2 — keep clear of the bottom strip where
    // Meta renders the headline + CTA. Scrim anchors the hook block instead.
    scrim: { position: "bottom", color: "#000000", opacity: 0.78, sizePct: 58 },
    blocks: [
      {
        anchor: "bottom-left",
        fontFamily: "headline",
        fontSizePx: 104,
        lineHeightEm: 0.94,
        maxWidthPct: 92,
        align: "left",
        uppercase: true,
        treatment: "outline",
        strokeColor: JNB.dark,
        strokeWidthPx: 3,
        shadow: true,
        color: JNB.white,
        runs: [
          { text: "ONE RIDE." },
          { text: "A WHOLE EVENT" },
          { text: "THEY REMEMBER", color: accent }, // EMPHASIS
        ],
      },
      {
        anchor: "bottom-left",
        fontFamily: "body",
        fontSizePx: 34,
        maxWidthPct: 80,
        align: "left",
        color: JNB.white,
        shadow: true,
        runs: [{ text: "Booking now for July weekends" }],
      },
    ],
    logo: { placement: "top-left", widthPct: 17, opacity: 0.97 },
  };
}

async function main() {
  console.log(`\nBRAND_DIR = ${BRAND_DIR}\n`);

  console.log("1. Font files present:");
  const passionOne = tryLoad("Passion One (static ttf)", "PassionOne-Regular.ttf");
  const rubik = tryLoad("Rubik (static instance)", "Rubik-400.ttf");
  const rubikVar = tryLoad("Rubik (variable ttf)", "Rubik[wght].ttf");
  const rubikWoff2 = tryLoad("Rubik (supplied woff2)", "Rubik-Variable-latin.woff2");

  if (!passionOne || !rubik) {
    throw new Error("Missing required static TTFs — cannot continue.");
  }

  // --- Does the upload gate catch what satori would choke on? ---
  console.log("\n1b. validateBrandFont() verdicts (the upload gate):");
  const cases: [string, Buffer | null][] = [
    ["PassionOne-Regular.ttf", passionOne],
    ["Rubik-400.ttf", rubik],
    ["Rubik[wght].ttf", rubikVar],
    ["Rubik-Variable-latin.woff2", rubikWoff2],
  ];
  for (const [name, buf] of cases) {
    if (!buf) continue;
    const v = validateBrandFont(buf, name);
    const badge = v.ok ? "ACCEPT" : "REJECT";
    console.log(
      `  ${badge}  ${name.padEnd(28)} format=${v.format.padEnd(5)} variable=${v.isVariable}`,
    );
    if (v.error) console.log(`          ${v.error.slice(0, 150)}…`);
  }

  // --- Q1: prove satori rejects the woff2 the client actually supplied ---
  console.log("\n2. Does satori accept the supplied WOFF2?");
  if (rubikWoff2) {
    try {
      await renderCreative({
        background: await makeBackground(),
        style: { fonts: [
          { role: "headline", data: rubikWoff2, weight: 400 },
          { role: "body", data: rubikWoff2, weight: 400 },
        ] },
        layout: layoutFor(JNB.blue),
      });
      console.log("   UNEXPECTED: woff2 rendered. Re-check the satori version.");
    } catch (e) {
      console.log(`   REJECTED as expected -> ${(e as Error).message.slice(0, 110)}`);
    }
  }

  // --- Q2: prove a VARIABLE font crashes satori's opentype.js outright ---
  console.log("\n3. Does satori accept a variable font?");
  if (rubikVar) {
    try {
      await renderCreative({
        background: await makeBackground(),
        style: { fonts: [
          { role: "headline", data: passionOne, weight: 400 },
          { role: "body", data: rubikVar, weight: 400 },
        ] },
        layout: layoutFor(JNB.blue),
      });
      console.log("   UNEXPECTED: variable font rendered.");
    } catch (e) {
      console.log(`   CRASHED as expected -> ${(e as Error).message.slice(0, 110)}`);
      console.log("   => variable fonts must be instanced to static weights first.");
    }
  }

  // --- Q3: render with the real brand fonts, both accent colors ---
  console.log("\n4. Rendering with Passion One + static Rubik:");
  const background = await makeBackground();
  const logo = tryLoad("logo mark", "jump-n-bounce-logo-mark-transparent.png");
  const logoMeta = logo ? await sharp(logo).metadata() : null;

  const style: BrandStyle = {
    logo: logo ?? undefined,
    fonts: [
      { role: "headline", data: passionOne, weight: 400 },
      { role: "body", data: rubik, weight: 400 },
    ],
  };

  for (const [name, accent] of [["blue", JNB.blue], ["red", JNB.red]] as const) {
    const png = await renderCreative({
      background,
      style,
      layout: layoutFor(accent),
      ...(logo && logoMeta
        ? { logoSize: { width: logoMeta.width!, height: logoMeta.height! } }
        : {}),
    });
    const meta = await sharp(png).metadata();
    const out = path.join(OUT, `jnb-hook-${name}.png`);
    writeFileSync(out, png);
    console.log(`   accent ${name.padEnd(5)} -> ${out}  ${meta.width}x${meta.height}  ${png.length}b`);
  }

  console.log("\nDone. Open both PNGs and compare accent legibility.\n");
}

main().catch((e) => {
  console.error("\nFAILED:", e);
  process.exit(1);
});
