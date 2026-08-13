import type { LayoutSpec, TextBlock } from "./types";

/**
 * Pre-render layout fitting — fixes the three §7 render bugs (BUILD_PLAN):
 *
 *  1. Same-anchor TextBlocks used to render in separate absolute containers
 *     and overlap. The renderer now stacks them per anchor group; this module
 *     provides the shared estimation those groups are sized with.
 *  2. Long headlines overflowed the safe margin. `fitLayout` estimates each
 *     block's wrapped height using the SAME geometry the renderer uses
 *     (word-based flex wrap, gap = 0.28em, line-height default 1.05) and
 *     shrinks fonts until the anchor group fits its cap.
 *  3. `scrim.sizePct` was whatever the vision model guessed, so the top line
 *     of a tall block could sit on unscrimmed photo. The scrim reach is now
 *     raised (never lowered) so the text's far edge still sits in the
 *     ≥~45%-strength zone of the gradient.
 *
 * Estimation is heuristic — satori gives no measurement pre-pass — so the
 * character-width factor errs wide (more shrink, never overflow).
 */

/** Average glyph advance as a fraction of font size. Errs slightly wide. */
const CHAR_W = 0.55;
/** A stacked anchor group may occupy at most this fraction of canvas height. */
const GROUP_CAP_FRAC = 0.45;
/** Gap between stacked blocks in an anchor group, as a fraction of the smallest font. */
export const STACK_GAP_EM = 0.5;

export interface BlockMetrics {
  lines: number;
  heightPx: number;
}

/** Mirror of buildTextEl's flex-wrap geometry. */
export function estimateBlock(block: TextBlock, availWidthPx: number): BlockMetrics {
  const fs = block.fontSizePx;
  const gap = Math.round(fs * 0.28); // inter-word AND inter-row gap
  const ls = block.letterSpacingPx ?? 0;
  const words = block.runs.flatMap((r) => r.text.split(/\s+/).filter(Boolean));
  if (words.length === 0) return { lines: 0, heightPx: 0 };

  let lines = 1;
  let lineW = 0;
  for (const w of words) {
    const ww = w.length * (fs * CHAR_W + ls);
    if (lineW > 0 && lineW + gap + ww > availWidthPx) {
      lines++;
      lineW = ww;
    } else {
      lineW += (lineW ? gap : 0) + ww;
    }
  }
  const lineH = fs * (block.lineHeightEm ?? 1.05);
  return { lines, heightPx: Math.round(lines * lineH + (lines - 1) * gap) };
}

function minFontPx(canvasW: number, canvasH: number): number {
  // Legibility floor at Meta feed scale (≈44px on a 1080×1350 canvas).
  return Math.max(32, Math.round(Math.min(canvasW, canvasH) * 0.04));
}

const groupKey = (b: TextBlock) => b.anchor;

export interface FittedLayout extends LayoutSpec {
  /** heightPx per anchor group, post-fit — reused for scrim derivation. */
  groupHeights: Record<string, number>;
}

export function fitLayout(layout: LayoutSpec): FittedLayout {
  const { width, height } = layout.canvas;
  const margin = Math.round((Math.min(width, height) * (layout.safeMarginPct ?? 6)) / 100);
  const safeW = width - 2 * margin;
  const safeH = height - 2 * margin;
  const minFs = minFontPx(width, height);

  // Work on copies — never mutate the vision model's spec.
  const blocks = layout.blocks.map((b) => ({ ...b, runs: b.runs.map((r) => ({ ...r })) }));

  // Pass 1 — no single word may exceed its line width (a word cannot wrap).
  for (const b of blocks) {
    const availW = (safeW * (b.maxWidthPct ?? 90)) / 100;
    const ls = b.letterSpacingPx ?? 0;
    const maxLen = Math.max(
      1,
      ...b.runs.flatMap((r) => r.text.split(/\s+/).filter(Boolean)).map((w) => w.length),
    );
    const fsWordMax = Math.floor((availW / maxLen - ls) / CHAR_W);
    if (b.fontSizePx > fsWordMax) b.fontSizePx = Math.max(minFs, fsWordMax);
  }

  // Pass 2 — each anchor group must fit its height cap.
  const cap = Math.min(GROUP_CAP_FRAC * height, safeH);
  const groups = new Map<string, TextBlock[]>();
  for (const b of blocks) {
    const g = groups.get(groupKey(b)) ?? [];
    g.push(b);
    groups.set(groupKey(b), g);
  }

  const groupHeights: Record<string, number> = {};
  for (const [key, group] of groups) {
    for (let iter = 0; iter < 3; iter++) {
      const stackGap = Math.round(Math.min(...group.map((b) => b.fontSizePx)) * STACK_GAP_EM);
      const total =
        group.reduce((sum, b) => {
          const availW = (safeW * (b.maxWidthPct ?? 90)) / 100;
          return sum + estimateBlock(b, availW).heightPx;
        }, 0) +
        (group.length - 1) * stackGap;

      groupHeights[key] = total;
      if (total <= cap) break;

      const scale = cap / total;
      let shrank = false;
      for (const b of group) {
        const next = Math.max(minFs, Math.floor(b.fontSizePx * scale));
        if (next < b.fontSizePx) {
          b.fontSizePx = next;
          shrank = true;
        }
      }
      if (!shrank) break; // everything already at the floor — accept overflow
    }
  }

  // Pass 3 — scrim reach must cover the text it backs. Raise only.
  let scrim = layout.scrim ? { ...layout.scrim } : undefined;
  if (scrim && (scrim.position === "top" || scrim.position === "bottom")) {
    const side = scrim.position;
    const extents = [...groups.keys()]
      .filter((k) => k.startsWith(side))
      .map((k) => margin + (groupHeights[k] ?? 0));
    if (extents.length) {
      const extentPct = (Math.max(...extents) / height) * 100;
      // Gradient strength at distance d from the edge is ~60% at reach/2 and 0
      // at reach; reach = 1.6×extent keeps the text's far edge at ≥~45%.
      const needed = Math.min(88, Math.ceil(extentPct * 1.6));
      scrim.sizePct = Math.max(scrim.sizePct ?? 55, needed);
    }
  }

  return { ...layout, blocks, scrim, groupHeights };
}
