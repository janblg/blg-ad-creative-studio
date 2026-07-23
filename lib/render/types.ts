/**
 * Types for the creative text/design layer.
 *
 * The pipeline is: a hyper-realistic, TEXT-FREE photo comes from the image
 * provider (Higgsfield Soul, etc). Claude (vision) inspects that photo and
 * emits a `LayoutSpec` describing where/how the hook text + logo should sit
 * (negative space, avoid faces, legibility). We then render that spec as
 * crisp vector text with the brand's exact fonts/colors and composite it over
 * the photo. Nothing about the text is left to the image model.
 */

/** Nine anchor regions of the safe area. */
export type Anchor =
  | "top-left" | "top-center" | "top-right"
  | "middle-left" | "middle-center" | "middle-right"
  | "bottom-left" | "bottom-center" | "bottom-right";

export type Treatment = "plain" | "outline" | "box";

/** A run of text that can carry its own color (enables multi-color headlines). */
export interface TextRun {
  text: string;
  /** Overrides the block color for this run. Hex. */
  color?: string;
}

export interface TextBlock {
  runs: TextRun[];
  anchor: Anchor;
  /** Which registered brand font to use. */
  fontFamily: "headline" | "body";
  /** Font size in pixels, relative to the canvas the layout was designed for. */
  fontSizePx: number;
  fontWeight?: number;
  lineHeightEm?: number;
  /** Max width of the text column as a % of canvas width (0-100). */
  maxWidthPct?: number;
  align?: "left" | "center" | "right";
  uppercase?: boolean;
  letterSpacingPx?: number;
  /** Default fill color for runs that don't set their own. Hex. */
  color: string;
  treatment?: Treatment;
  /** outline treatment */
  strokeColor?: string;
  strokeWidthPx?: number;
  /** box treatment */
  boxColor?: string;
  boxPaddingPx?: number;
  boxRadiusPx?: number;
  /** Soft drop shadow for legibility over busy photos. */
  shadow?: boolean;
}

export interface LogoSpec {
  placement: Anchor;
  /** Logo width as a % of canvas width. */
  widthPct: number;
  opacity?: number;
}

/** A darkening gradient behind text to guarantee legibility. */
export interface ScrimSpec {
  position: "top" | "bottom" | "full";
  /** Base color of the scrim (usually black or a brand dark). Hex. */
  color: string;
  /** Peak opacity 0-1 at the anchored edge. */
  opacity: number;
  /** How far the gradient reaches as a % of canvas height (for top/bottom). */
  sizePct?: number;
}

export interface LayoutSpec {
  canvas: { width: number; height: number };
  /** Keep all content inside this margin (% of the shorter side). */
  safeMarginPct?: number;
  scrim?: ScrimSpec;
  blocks: TextBlock[];
  logo?: LogoSpec;
}

/** A brand font, provided as a raw TTF/OTF/WOFF buffer. */
export interface BrandFont {
  /** Family name used to reference this font in a TextBlock. */
  role: "headline" | "body";
  data: Buffer | ArrayBuffer;
  weight?: number;
  style?: "normal" | "italic";
}

export interface BrandStyle {
  fonts: BrandFont[];
  /** Optional logo PNG/SVG buffer. */
  logo?: Buffer;
}
