/**
 * Creative text/design renderer.
 *
 * renderCreative(background photo + BrandStyle + LayoutSpec) -> composited PNG.
 *
 * Pipeline: Satori lays out the text/logo with the brand's real fonts and
 * emits an SVG whose glyphs are VECTOR PATHS (so no font is needed at
 * rasterization time and the exact brand typeface renders identically on any
 * server). resvg rasterizes that SVG to a transparent PNG. Sharp covers the
 * canvas with the photo and composites the text layer on top.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import satori from "satori";
import { Resvg, initWasm } from "@resvg/resvg-wasm";
import sharp from "sharp";

// resvg-wasm renders Satori's SVG correctly (same engine as resvg-js) and runs
// reliably on Vercel (pure WebAssembly, no native binary). Init once.
let resvgInit: Promise<void> | undefined;
function ensureResvg(): Promise<void> {
  if (!resvgInit) {
    const wasm = readFileSync(
      path.join(process.cwd(), "node_modules/@resvg/resvg-wasm/index_bg.wasm"),
    );
    resvgInit = initWasm(wasm);
  }
  return resvgInit;
}
import type {
  Anchor,
  BrandStyle,
  LayoutSpec,
  ScrimSpec,
  TextBlock,
} from "./types";

// Minimal JSX-free element type Satori accepts at runtime.
type El = { type: string; props: Record<string, unknown> };
const h = (
  type: string,
  style: Record<string, unknown>,
  children?: unknown,
): El => ({ type, props: { style, ...(children !== undefined ? { children } : {}) } });

function anchorFlex(anchor: Anchor): {
  justifyContent: string; // vertical (column main axis)
  alignItems: string; // horizontal (cross axis)
} {
  const [v, hpos] = anchor.split("-");
  const justifyContent =
    v === "top" ? "flex-start" : v === "bottom" ? "flex-end" : "center";
  const alignItems =
    hpos === "left" ? "flex-start" : hpos === "right" ? "flex-end" : "center";
  return { justifyContent, alignItems };
}

function scrimBackground(scrim: ScrimSpec): string {
  const c = scrim.color;
  const strong = hexToRgba(c, scrim.opacity);
  const none = hexToRgba(c, 0);
  if (scrim.position === "full") return strong;
  const dir = scrim.position === "top" ? "180deg" : "0deg"; // fades away from the edge
  const reach = scrim.sizePct ?? 55;
  return `linear-gradient(${dir}, ${strong} 0%, ${hexToRgba(c, scrim.opacity * 0.6)} ${reach * 0.5}%, ${none} ${reach}%)`;
}

function hexToRgba(hex: string, alpha: number): string {
  const m = hex.replace("#", "");
  const full = m.length === 3 ? m.split("").map((x) => x + x).join("") : m;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function buildTextEl(block: TextBlock): El {
  const fontFamily = block.fontFamily === "headline" ? "Headline" : "Body";
  const wordStyleBase: Record<string, unknown> = {
    fontFamily,
    fontSize: block.fontSizePx,
    fontWeight: block.fontWeight ?? (block.fontFamily === "headline" ? 800 : 400),
    lineHeight: block.lineHeightEm ?? 1.05,
    letterSpacing: block.letterSpacingPx ?? 0,
    color: block.color,
  };
  if (block.uppercase) wordStyleBase.textTransform = "uppercase";
  if (block.treatment === "outline") {
    wordStyleBase.WebkitTextStrokeWidth = `${block.strokeWidthPx ?? 2}px`;
    wordStyleBase.WebkitTextStrokeColor = block.strokeColor ?? "#000000";
  }
  if (block.shadow) {
    wordStyleBase.textShadow = "0px 2px 8px rgba(0,0,0,0.55)";
  }

  // Each run becomes one or more word children so the headline can wrap.
  const words: El[] = [];
  block.runs.forEach((run) => {
    run.text.split(/\s+/).filter(Boolean).forEach((word) => {
      words.push(
        h("div", { ...wordStyleBase, color: run.color ?? block.color }, word),
      );
    });
  });

  const textAlign = block.align ?? "center";
  const textWrap = h(
    "div",
    {
      display: "flex",
      flexWrap: "wrap",
      gap: `${Math.round(block.fontSizePx * 0.28)}px`,
      justifyContent:
        textAlign === "left" ? "flex-start" : textAlign === "right" ? "flex-end" : "center",
      maxWidth: `${block.maxWidthPct ?? 90}%`,
    },
    words,
  );

  if (block.treatment === "box") {
    return h(
      "div",
      {
        display: "flex",
        backgroundColor: block.boxColor ?? "#000000",
        padding: `${block.boxPaddingPx ?? 18}px ${(block.boxPaddingPx ?? 18) * 1.4}px`,
        borderRadius: `${block.boxRadiusPx ?? 10}px`,
      },
      [textWrap],
    );
  }
  return textWrap;
}

export interface RenderOptions {
  background: Buffer;
  style: BrandStyle;
  layout: LayoutSpec;
  /** Logo intrinsic size, if a logo is used (computed by caller via sharp). */
  logoSize?: { width: number; height: number };
}

/** Build the transparent text/design layer as a PNG buffer. */
export async function renderTextLayer(opts: RenderOptions): Promise<Buffer> {
  const { style, layout } = opts;
  const { width, height } = layout.canvas;
  const margin = Math.round(
    (Math.min(width, height) * (layout.safeMarginPct ?? 6)) / 100,
  );

  const children: El[] = [];

  // Scrim first (behind text).
  if (layout.scrim) {
    const s = layout.scrim;
    const size =
      s.position === "full"
        ? { top: 0, left: 0, width, height }
        : s.position === "top"
          ? { top: 0, left: 0, width, height }
          : { top: 0, left: 0, width, height };
    children.push(
      h("div", {
        position: "absolute",
        ...size,
        display: "flex",
        backgroundImage: scrimBackground(s),
      }),
    );
  }

  // Text blocks, each spanning the safe area and self-positioning via flex.
  layout.blocks.forEach((block) => {
    const { justifyContent, alignItems } = anchorFlex(block.anchor);
    children.push(
      h(
        "div",
        {
          position: "absolute",
          top: margin,
          left: margin,
          right: margin,
          bottom: margin,
          display: "flex",
          flexDirection: "column",
          justifyContent,
          alignItems,
        },
        [buildTextEl(block)],
      ),
    );
  });

  // Logo.
  if (layout.logo && style.logo && opts.logoSize) {
    const w = Math.round((width * layout.logo.widthPct) / 100);
    const ratio = opts.logoSize.height / opts.logoSize.width;
    const hgt = Math.round(w * ratio);
    const { justifyContent, alignItems } = anchorFlex(layout.logo.placement);
    const dataUri = `data:image/png;base64,${style.logo.toString("base64")}`;
    children.push(
      h(
        "div",
        {
          position: "absolute",
          top: margin,
          left: margin,
          right: margin,
          bottom: margin,
          display: "flex",
          flexDirection: "column",
          justifyContent,
          alignItems,
        },
        [
          {
            type: "img",
            props: {
              src: dataUri,
              width: w,
              height: hgt,
              style: { opacity: layout.logo.opacity ?? 1 },
            },
          } as unknown as El,
        ],
      ),
    );
  }

  const root = h(
    "div",
    {
      position: "relative",
      width,
      height,
      display: "flex",
    },
    children,
  );

  const fonts = style.fonts.map((f) => ({
    name: f.role === "headline" ? "Headline" : "Body",
    data: f.data,
    weight: (f.weight ?? (f.role === "headline" ? 800 : 400)) as number,
    style: f.style ?? "normal",
  }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svg = await satori(root as any, { width, height, fonts: fonts as any });

  await ensureResvg();
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: width },
    background: "rgba(0,0,0,0)",
  });
  return Buffer.from(resvg.render().asPng());
}

/** Full creative: cover the canvas with the photo, composite the text layer. */
export async function renderCreative(opts: RenderOptions): Promise<Buffer> {
  const { width, height } = opts.layout.canvas;
  const textLayer = await renderTextLayer(opts);
  const base = await sharp(opts.background)
    .resize(width, height, { fit: "cover", position: "attention" })
    .toBuffer();
  return sharp(base)
    .composite([{ input: textLayer, top: 0, left: 0 }])
    .png()
    .toBuffer();
}
