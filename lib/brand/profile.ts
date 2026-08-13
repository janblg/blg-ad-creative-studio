import "server-only";
import sharp from "sharp";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { defaultFonts } from "@/lib/render/fonts";
import type { BrandFont, BrandStyle } from "@/lib/render/types";
import type { BrandColor } from "@/lib/render/vision";

/**
 * The brand identity layer.
 *
 * One place that reads `brand_profiles` and turns it into the three things the
 * generation pipeline needs:
 *
 *   resolveBrandPalette() -> colors for the Claude-vision LayoutSpec call
 *   resolveBrandStyle()   -> real fonts + logo buffers for the renderer
 *   engineStyleDirective() -> bounded-palette prose for the prompt engine
 *
 * Everything degrades gracefully: a brand with an empty profile still renders,
 * using the bundled Anton/Barlow and a sane default palette. That matters
 * because `createBrand` inserts an empty `brand_profiles` row.
 */

const BUCKET = "assets";

export type ColorRole =
  | "primary"
  | "secondary"
  | "hook_accent"
  | "hook_text"
  | "palette";

export interface BrandColorEntry {
  name?: string;
  hex: string;
  role: ColorRole;
}

export type FontRole = "headline" | "body";

export interface BrandFontEntry {
  role: FontRole;
  asset_id: string;
  weight?: number;
  filename?: string;
}

export interface BrandProfile {
  brandId: string;
  voiceTone: string;
  goals: string;
  location: string;
  targetAudience: string;
  colors: BrandColorEntry[];
  fonts: BrandFontEntry[];
  logoAssetId: string | null;
  imagePromptStyle: string;
  hookFrameworks: string;
}

export const HEX_RE = /^#[0-9a-fA-F]{6}$/;

/**
 * Used when a brand has no palette yet. Deliberately neutral — white hook text
 * on a dark scrim with a warm accent reads on almost any photo.
 */
export const DEFAULT_COLORS: BrandColorEntry[] = [
  { name: "Hook text", hex: "#FFFFFF", role: "hook_text" },
  { name: "Accent", hex: "#FFD23F", role: "hook_accent" },
  { name: "Dark", hex: "#111111", role: "palette" },
];

export function emptyProfile(brandId: string): BrandProfile {
  return {
    brandId,
    voiceTone: "",
    goals: "",
    location: "",
    targetAudience: "",
    colors: [],
    fonts: [],
    logoAssetId: null,
    imagePromptStyle: "",
    hookFrameworks: "",
  };
}

function coerceColors(raw: unknown): BrandColorEntry[] {
  if (!Array.isArray(raw)) return [];
  const roles: ColorRole[] = [
    "primary",
    "secondary",
    "hook_accent",
    "hook_text",
    "palette",
  ];
  return raw
    .filter(
      (c): c is { hex: string; role?: string; name?: string } =>
        !!c && typeof c === "object" && HEX_RE.test((c as { hex?: string }).hex ?? ""),
    )
    .map((c) => ({
      name: typeof c.name === "string" ? c.name : undefined,
      hex: c.hex.toUpperCase(),
      role: roles.includes(c.role as ColorRole) ? (c.role as ColorRole) : "palette",
    }));
}

function coerceFonts(raw: unknown): BrandFontEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (f): f is BrandFontEntry =>
        !!f &&
        typeof f === "object" &&
        typeof (f as BrandFontEntry).asset_id === "string" &&
        ((f as BrandFontEntry).role === "headline" ||
          (f as BrandFontEntry).role === "body"),
    )
    .map((f) => ({
      role: f.role,
      asset_id: f.asset_id,
      weight: typeof f.weight === "number" ? f.weight : undefined,
      filename: typeof f.filename === "string" ? f.filename : undefined,
    }));
}

export async function loadBrandProfile(brandId: string): Promise<BrandProfile> {
  const admin = supabaseAdmin();
  const { data } = await admin
    .from("brand_profiles")
    .select(
      "brand_id, voice_tone, goals, location, target_audience, colors, fonts, logo_asset_id, image_prompt_style, hook_frameworks",
    )
    .eq("brand_id", brandId)
    .maybeSingle();

  if (!data) return emptyProfile(brandId);

  return {
    brandId,
    voiceTone: data.voice_tone ?? "",
    goals: data.goals ?? "",
    location: data.location ?? "",
    targetAudience: data.target_audience ?? "",
    colors: coerceColors(data.colors),
    fonts: coerceFonts(data.fonts),
    logoAssetId: data.logo_asset_id ?? null,
    imagePromptStyle: data.image_prompt_style ?? "",
    hookFrameworks: data.hook_frameworks ?? "",
  };
}

export type BrandProfilePatch = Partial<
  Omit<BrandProfile, "brandId" | "fonts" | "logoAssetId">
> & {
  fonts?: BrandFontEntry[];
  logoAssetId?: string | null;
};

export async function saveBrandProfile(
  brandId: string,
  patch: BrandProfilePatch,
): Promise<void> {
  const admin = supabaseAdmin();
  const row: Record<string, unknown> = { brand_id: brandId, updated_at: new Date().toISOString() };

  if (patch.voiceTone !== undefined) row.voice_tone = patch.voiceTone;
  if (patch.goals !== undefined) row.goals = patch.goals;
  if (patch.location !== undefined) row.location = patch.location;
  if (patch.targetAudience !== undefined) row.target_audience = patch.targetAudience;
  if (patch.colors !== undefined) row.colors = patch.colors;
  if (patch.fonts !== undefined) row.fonts = patch.fonts;
  if (patch.logoAssetId !== undefined) row.logo_asset_id = patch.logoAssetId;
  if (patch.imagePromptStyle !== undefined) row.image_prompt_style = patch.imagePromptStyle;
  if (patch.hookFrameworks !== undefined) row.hook_frameworks = patch.hookFrameworks;

  const { error } = await admin
    .from("brand_profiles")
    .upsert(row, { onConflict: "brand_id" });
  if (error) throw new Error(`Could not save brand profile: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Generation-facing resolvers
// ---------------------------------------------------------------------------

/** Pick a color by role, first match wins. */
export function colorFor(
  profile: BrandProfile,
  role: ColorRole,
): string | undefined {
  return profile.colors.find((c) => c.role === role)?.hex;
}

/**
 * Colors for the LayoutSpec vision call.
 *
 * The hook accent is deliberately explicit rather than assumed to be `primary`:
 * Jump N Bounce's primary blue (#01509B) is nearly illegible on a dark scrim
 * while their secondary red reads cleanly, so the brand must be able to say
 * which color the hook emphasis uses.
 */
export function paletteFromProfile(profile: BrandProfile): BrandColor[] {
  const ordered: BrandColor[] = [];
  const push = (hex: string | undefined, role: string) => {
    if (hex && !ordered.some((o) => o.hex === hex)) ordered.push({ hex, role });
  };

  push(colorFor(profile, "hook_text") ?? "#FFFFFF", "text");
  push(colorFor(profile, "hook_accent") ?? colorFor(profile, "secondary"), "accent");
  push(colorFor(profile, "primary"), "primary");
  push(colorFor(profile, "secondary"), "secondary");
  for (const c of profile.colors.filter((c) => c.role === "palette")) {
    push(c.hex, c.name ?? "palette");
  }

  if (ordered.length < 2) {
    return DEFAULT_COLORS.map((c) => ({
      hex: c.hex,
      role: c.role === "hook_text" ? "text" : c.role === "hook_accent" ? "accent" : "dark",
    }));
  }
  return ordered;
}

export async function resolveBrandPalette(brandId: string): Promise<BrandColor[]> {
  return paletteFromProfile(await loadBrandProfile(brandId));
}

async function downloadAsset(assetId: string): Promise<{ buf: Buffer; mime: string | null } | null> {
  const admin = supabaseAdmin();
  const { data: asset } = await admin
    .from("image_assets")
    .select("storage_path, mime")
    .eq("id", assetId)
    .maybeSingle();
  if (!asset?.storage_path) return null;

  const { data, error } = await admin.storage.from(BUCKET).download(asset.storage_path);
  if (error || !data) return null;
  return { buf: Buffer.from(await data.arrayBuffer()), mime: asset.mime ?? null };
}

export interface ResolvedBrandStyle {
  style: BrandStyle;
  logoSize?: { width: number; height: number };
  /** Which font roles came from the brand vs the bundled fallback. */
  fontSources: Record<FontRole, "brand" | "bundled">;
}

/**
 * Real brand fonts + logo for `renderCreative`.
 *
 * Custom fonts are loaded from Storage at render time — they cannot be bundled,
 * and gotcha #7 still binds: no system fonts exist on Vercel, so a missing
 * brand font must fall back to a committed file, never to a font name.
 */
export async function resolveBrandStyle(brandId: string): Promise<ResolvedBrandStyle> {
  const profile = await loadBrandProfile(brandId);
  const fallback = defaultFonts();
  const fontSources: Record<FontRole, "brand" | "bundled"> = {
    headline: "bundled",
    body: "bundled",
  };

  const fonts: BrandFont[] = [];
  for (const role of ["headline", "body"] as const) {
    const entry = profile.fonts.find((f) => f.role === role);
    if (entry) {
      const got = await downloadAsset(entry.asset_id);
      if (got) {
        fonts.push({ role, data: got.buf, weight: entry.weight ?? 400 });
        fontSources[role] = "brand";
        continue;
      }
    }
    const fb = fallback.find((f) => f.role === role);
    if (fb) fonts.push(fb);
  }

  // The script/accent font is always the bundled one for now — brand uploads
  // cover headline/body; flyer-style blocks reference "accent" freely.
  const accent = fallback.find((f) => f.role === "accent");
  if (accent) fonts.push(accent);

  let logo: Buffer | undefined;
  let logoSize: { width: number; height: number } | undefined;
  if (profile.logoAssetId) {
    const got = await downloadAsset(profile.logoAssetId);
    if (got) {
      try {
        const meta = await sharp(got.buf).metadata();
        if (meta.width && meta.height) {
          logo = got.buf;
          logoSize = { width: meta.width, height: meta.height };
        }
      } catch {
        // A logo that won't decode is not worth failing a whole creative over.
      }
    }
  }

  return { style: { fonts, logo }, logoSize, fontSources };
}

/**
 * Brand influence for the Hyperrealism prompt engine.
 *
 * Per HYPERREALISM §10.3, a bounded palette is one of the fastest routes to a
 * professional look. Brand colors CONSTRAIN that palette — they never override
 * the realism laws, so this is phrased as guidance about the scene's color
 * response, not as a demand for flat brand-colored fills.
 *
 * Also carries HOOK_ENGINE §8.1: the scene must reserve genuine negative space
 * for the hook, stated POSITIVELY because gpt-image-1 latches onto negated
 * nouns (HYPERREALISM §14.3).
 */
export function engineStyleDirective(profile: BrandProfile): string {
  const lines: string[] = [];

  const palette = profile.colors
    .filter((c) => c.role !== "hook_text")
    .map((c) => `${c.name ?? c.role} ${c.hex}`);
  if (palette.length) {
    lines.push(
      `Bounded palette influence — the scene's colors should sit comfortably ` +
        `beside the brand's: ${palette.join(", ")}. Let these appear as real ` +
        `objects, surfaces and wardrobe in the world, not as color grading or ` +
        `flat overlays. The realism laws take precedence: never trade physical ` +
        `light behavior for brand-color accuracy.`,
    );
  }
  if (profile.targetAudience) {
    lines.push(`The people in frame should read as: ${profile.targetAudience}.`);
  }
  if (profile.location) {
    lines.push(`Location truth: the setting should be plausible for ${profile.location}.`);
  }
  if (profile.imagePromptStyle) {
    lines.push(`Brand visual style notes: ${profile.imagePromptStyle}`);
  }

  lines.push(
    `Composition requirement: leave one genuinely uncluttered region — an ` +
      `unbroken stretch of sky, wall, grass or shadow — large enough to carry a ` +
      `three-line headline. All surfaces in frame are blank and unmarked, ` +
      `carrying no text, lettering, logos or signage.`,
  );

  return lines.join("\n\n");
}
