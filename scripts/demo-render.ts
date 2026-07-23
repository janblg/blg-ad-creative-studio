/**
 * Offline proof of the creative render engine — no API keys required.
 *
 * Simulates: a text-free photo (here a synthesized gradient stands in for the
 * Higgsfield Soul output) + a brand style (fonts + logo) + a Claude-designed
 * LayoutSpec -> a finished, on-brand ad creative with crisp vector text.
 *
 * Run:  npx tsx scripts/demo-render.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { renderCreative } from "../lib/render/overlay";
import type { BrandStyle, LayoutSpec } from "../lib/render/types";

const OUT = process.env.OUT_DIR ?? ".";
const W = 1080;
const H = 1350; // 4:5, Meta feed

// --- Stand-in for the Soul photo: a warm outdoor gradient with a "sun". ---
async function makeBackground(): Promise<Buffer> {
  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#2b6cff"/>
        <stop offset="45%" stop-color="#7db2ff"/>
        <stop offset="70%" stop-color="#ffd9a0"/>
        <stop offset="100%" stop-color="#e58b3a"/>
      </linearGradient>
      <radialGradient id="sun" cx="72%" cy="28%" r="22%">
        <stop offset="0%" stop-color="#fff7e0" stop-opacity="0.95"/>
        <stop offset="100%" stop-color="#fff7e0" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#sky)"/>
    <rect width="${W}" height="${H}" fill="url(#sun)"/>
    <rect y="${H * 0.82}" width="${W}" height="${H * 0.18}" fill="#5a7d3a"/>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

// --- Font-free abstract logo mark (rounded square + play triangle). ---
async function makeLogo(): Promise<Buffer> {
  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="240" height="240">
    <rect width="240" height="240" rx="52" fill="#111827"/>
    <rect x="14" y="14" width="212" height="212" rx="42" fill="none" stroke="#FFD23F" stroke-width="10"/>
    <polygon points="96,74 176,120 96,166" fill="#FFD23F"/>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function main() {
  const background = await makeBackground();
  const logo = await makeLogo();
  const logoMeta = await sharp(logo).metadata();

  const style: BrandStyle = {
    logo,
    fonts: [
      { role: "headline", data: readFileSync("/System/Library/Fonts/Supplemental/Impact.ttf"), weight: 800 },
      { role: "body", data: readFileSync("/System/Library/Fonts/Supplemental/Arial.ttf"), weight: 400 },
    ],
  };

  // What Claude (vision) would emit after inspecting the photo:
  const layout: LayoutSpec = {
    canvas: { width: W, height: H },
    safeMarginPct: 6,
    scrim: { position: "bottom", color: "#000000", opacity: 0.8, sizePct: 62 },
    blocks: [
      {
        anchor: "bottom-left",
        fontFamily: "headline",
        fontSizePx: 96,
        lineHeightEm: 0.98,
        maxWidthPct: 94,
        align: "left",
        uppercase: true,
        treatment: "outline",
        strokeColor: "#111111",
        strokeWidthPx: 3,
        shadow: true,
        color: "#FFFFFF",
        runs: [
          { text: "ONE RIDE.", color: "#FFFFFF" },
          { text: "A WHOLE EVENT", color: "#FFD23F" },
          { text: "PEOPLE STILL", color: "#3DDC84" },
          { text: "TALK ABOUT.", color: "#FFFFFF" },
        ],
      },
    ],
    logo: { placement: "top-left", widthPct: 15, opacity: 0.96 },
  };

  const png = await renderCreative({
    background,
    style,
    layout,
    logoSize: { width: logoMeta.width!, height: logoMeta.height! },
  });

  const path = `${OUT}/demo-creative.png`;
  writeFileSync(path, png);
  console.log(`Wrote ${path} (${png.length} bytes)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
