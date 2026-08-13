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
import { fitLayout, STACK_GAP_EM } from "./fit";

// resvg-wasm renders Satori's SVG correctly (same engine as resvg-js) and runs
// reliably on Vercel (pure WebAssembly, no native binary).
//
// initWasm() THROWS "Already initialized. The initWasm() function can be used
// only once." if the wasm was already loaded — and a module-level promise guard
// does NOT protect against that, because a second module instance (separate
// bundle chunk, warm lambda re-evaluation, another caller) starts with an empty
// guard while the underlying wasm is already live. So the init must tolerate
// that specific error instead of propagating it. Never let this throw.
let resvgReady: Promise<void> | undefined;
function ensureResvg(): Promise<void> {
  if (!resvgReady) {
    resvgReady = (async () => {
      try {
        const wasm = readFileSync(
          path.join(process.cwd(), "node_modules", "@resvg", "resvg-wasm", "index_bg.wasm"),
        );
        await initWasm(wasm);
      } catch (e) {
        const m = e instanceof Error ? e.message : String(e);
        // Already initialized elsewhere -> the renderer is usable, carry on.
        if (/already initialized/i.test(m)) return;
        resvgReady = undefined; // allow a genuine failure to be retried
        throw e;
      }
    })();
  }
  return resvgReady;
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
  const fontFamily =
    block.fontFamily === "headline"
      ? "Headline"
      : block.fontFamily === "accent"
        ? "Accent"
        : "Body";
  const wordStyleBase: Record<string, unknown> = {
    fontFamily,
    fontSize: block.fontSizePx,
    fontWeight:
      block.fontWeight ?? (block.fontFamily === "headline" ? 800 : 400),
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
      const style: Record<string, unknown> = {
        ...wordStyleBase,
        color: run.color ?? block.color,
      };
      if (run.underline) {
        style.textDecoration = "underline";
        style.textDecorationColor = run.underlineColor ?? run.color ?? block.color;
      }
      words.push(h("div", style, word));
    });
  });

  const textAlign = block.align ?? "center";
  const maxW = `${block.maxWidthPct ?? 90}%`;
  // When a wrapper (box/highlight/rotate) is present, the percentage max-width
  // MUST live on the wrapper: a percentage on the inner text resolves against
  // the wrapper's own content-sized width, which re-shrinks the text below its
  // natural width and forces a wrap at ANY font size.
  const makeTextWrap = (constrained: boolean) =>
    h(
      "div",
      {
        display: "flex",
        flexWrap: "wrap",
        gap: `${Math.round(block.fontSizePx * 0.28)}px`,
        justifyContent:
          textAlign === "left" ? "flex-start" : textAlign === "right" ? "flex-end" : "center",
        maxWidth: constrained ? maxW : "100%",
      },
      words,
    );

  // Whole-block tilt (flyer energy). Applied on the outermost element so the
  // box/highlight rotates with the text. Satori supports CSS transforms.
  const rotate = block.rotateDeg
    ? { transform: `rotate(${Math.max(-8, Math.min(8, block.rotateDeg))}deg)` }
    : {};

  if (block.treatment === "box") {
    return h(
      "div",
      {
        display: "flex",
        maxWidth: maxW,
        backgroundColor: block.boxColor ?? "#000000",
        padding: `${block.boxPaddingPx ?? 18}px ${(block.boxPaddingPx ?? 18) * 1.4}px`,
        borderRadius: `${block.boxRadiusPx ?? 10}px`,
        ...rotate,
      },
      [makeTextWrap(false)],
    );
  }

  if (block.treatment === "highlight") {
    // Brush-stroke bar: an uneven hand-drawn border-radius plus a slight skew
    // reads as a painted stroke behind the line (references: "A CENTERPIECE.").
    const pad = Math.round(block.fontSizePx * 0.18);
    return h(
      "div",
      {
        display: "flex",
        maxWidth: maxW,
        backgroundColor: block.highlightColor ?? "#FF0000",
        padding: `${pad}px ${Math.round(pad * 2.2)}px`,
        borderRadius: "255px 15px 225px 18px / 18px 225px 15px 255px",
        transform: `${rotate.transform ?? ""} skewX(-4deg)`.trim(),
      },
      [makeTextWrap(false)],
    );
  }

  if (block.rotateDeg) {
    return h("div", { display: "flex", maxWidth: maxW, ...rotate }, [makeTextWrap(false)]);
  }
  return makeTextWrap(true);
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
  const { style } = opts;
  // Fit BEFORE rendering: shrinks overflowing fonts, and sizes the scrim to
  // the text it backs (§7 render bugs 2 and 3).
  const layout = fitLayout(opts.layout);
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
  // §7 bug 1: blocks sharing an anchor used to live in separate absolute
  // containers and overlap. Group per anchor and stack as a column — array
  // order is visual order, top to bottom. (A logo placed at the same anchor
  // can still collide; the vision prompt steers logo and text apart.)
  const anchorGroups = new Map<Anchor, TextBlock[]>();
  for (const block of layout.blocks) {
    const group = anchorGroups.get(block.anchor) ?? [];
    group.push(block);
    anchorGroups.set(block.anchor, group);
  }
  for (const [anchor, group] of anchorGroups) {
    const { justifyContent, alignItems } = anchorFlex(anchor);
    const stackGap = Math.round(
      Math.min(...group.map((b) => b.fontSizePx)) * STACK_GAP_EM,
    );
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
          gap: `${stackGap}px`,
        },
        group.map(buildTextEl),
      ),
    );
  }

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
    name: f.role === "headline" ? "Headline" : f.role === "accent" ? "Accent" : "Body",
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
