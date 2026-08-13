/**
 * Visual test for the §7 render bugs (BUILD_PLAN): same-anchor stacking,
 * long-headline auto-fit, scrim derived from text height. No API calls.
 *
 * Run: npx tsx scripts/test-render-fit.ts
 */
import { writeFileSync } from "node:fs";
import sharp from "sharp";
import { renderCreative } from "../lib/render/overlay";
import { fitLayout } from "../lib/render/fit";
import { defaultFonts } from "../lib/render/fonts";
import type { LayoutSpec } from "../lib/render/types";

const OUT = process.env.OUT_DIR ?? ".";
const W = 1080;
const H = 1350;

async function makeBackground(): Promise<Buffer> {
  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#2b6cff"/>
        <stop offset="55%" stop-color="#9cc4ff"/>
        <stop offset="100%" stop-color="#e58b3a"/>
      </linearGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#sky)"/>
    <circle cx="800" cy="330" r="140" fill="#fff2cc"/>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function main() {
  // Deliberately abusive layout — what the vision model COULD emit:
  //  - two blocks on the SAME anchor (used to overlap)
  //  - 120px 15-word headline (used to blow through the safe margin)
  //  - scrim sizePct 30 (used to leave the top lines on bare photo)
  const layout: LayoutSpec = {
    canvas: { width: W, height: H },
    safeMarginPct: 6,
    scrim: { position: "bottom", color: "#000000", opacity: 0.8, sizePct: 30 },
    blocks: [
      {
        anchor: "bottom-left",
        fontFamily: "headline",
        fontSizePx: 120,
        maxWidthPct: 94,
        align: "left",
        uppercase: true,
        treatment: "outline",
        strokeColor: "#111111",
        strokeWidthPx: 3,
        shadow: true,
        color: "#FFFFFF",
        runs: [
          { text: "THE BIRTHDAY PARTY" },
          { text: "EVERY SINGLE KID", color: "#FF0000" },
          { text: "IN THE NEIGHBORHOOD TALKS ABOUT ALL SUMMER LONG" },
        ],
      },
      {
        anchor: "bottom-left",
        fontFamily: "body",
        fontSizePx: 42,
        maxWidthPct: 80,
        align: "left",
        color: "#FFFFFF",
        shadow: true,
        runs: [{ text: "Free delivery and setup across Orange County" }],
      },
    ],
  };

  const fitted = fitLayout(layout);
  console.log("fit results:");
  fitted.blocks.forEach((b, i) =>
    console.log(
      `  block ${i}: ${layout.blocks[i].fontSizePx}px -> ${b.fontSizePx}px`,
    ),
  );
  console.log(
    `  scrim: sizePct ${layout.scrim?.sizePct} -> ${fitted.scrim?.sizePct}`,
  );
  console.log(`  group heights:`, fitted.groupHeights);

  const png = await renderCreative({
    background: await makeBackground(),
    style: { fonts: defaultFonts() },
    layout,
  });
  const path = `${OUT}/render-fit-test.png`;
  writeFileSync(path, png);
  console.log(`\n✅ wrote ${path} (${png.length}b)`);
}

main().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});
