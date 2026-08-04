"use server";
import { revalidatePath } from "next/cache";
import { requireContext } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  saveBrandProfile,
  loadBrandProfile,
  HEX_RE,
  type BrandColorEntry,
  type ColorRole,
} from "@/lib/brand/profile";

const ROLES: ColorRole[] = ["primary", "secondary", "hook_accent", "hook_text", "palette"];

async function assertBrandInOrg(brandId: string): Promise<void> {
  const { orgId } = await requireContext();
  const { data } = await supabaseAdmin()
    .from("brands")
    .select("id")
    .eq("id", brandId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!data) throw new Error("Brand not found.");
}

export interface SaveResult {
  ok?: boolean;
  error?: string;
  savedAt?: string;
}

/**
 * Saves the text fields + palette. JSON only — no binary crosses this boundary
 * (gotcha #1); fonts and the logo go through /api/brand-assets instead.
 */
export async function saveProfile(
  _prev: SaveResult | null,
  formData: FormData,
): Promise<SaveResult> {
  try {
    const brandId = String(formData.get("brandId") ?? "").trim();
    if (!brandId) return { error: "Missing brand." };
    await assertBrandInOrg(brandId);

    // Colors arrive as a JSON string from the client editor.
    const colors: BrandColorEntry[] = [];
    const rawColors = String(formData.get("colors") ?? "[]");
    try {
      const parsed = JSON.parse(rawColors);
      if (!Array.isArray(parsed)) throw new Error("not an array");
      for (const c of parsed) {
        const hex = String(c?.hex ?? "").trim().toUpperCase();
        if (!HEX_RE.test(hex)) {
          return { error: `"${hex || "(blank)"}" is not a 6-digit hex color like #01509B.` };
        }
        const role = ROLES.includes(c?.role) ? (c.role as ColorRole) : "palette";
        const name = String(c?.name ?? "").trim();
        colors.push({ hex, role, ...(name ? { name } : {}) });
      }
    } catch (e) {
      return { error: `Could not read the palette: ${e instanceof Error ? e.message : String(e)}` };
    }

    // Exactly one hook_text and one hook_accent make the renderer predictable.
    for (const role of ["hook_text", "hook_accent"] as const) {
      if (colors.filter((c) => c.role === role).length > 1) {
        return {
          error: `Only one color can be "${role.replace("_", " ")}". Set the extras to "palette".`,
        };
      }
    }

    const brandName = String(formData.get("brandName") ?? "").trim();
    if (brandName) {
      await supabaseAdmin()
        .from("brands")
        .update({ name: brandName, updated_at: new Date().toISOString() })
        .eq("id", brandId);
    }

    await saveBrandProfile(brandId, {
      voiceTone: String(formData.get("voiceTone") ?? ""),
      goals: String(formData.get("goals") ?? ""),
      location: String(formData.get("location") ?? ""),
      targetAudience: String(formData.get("targetAudience") ?? ""),
      imagePromptStyle: String(formData.get("imagePromptStyle") ?? ""),
      colors,
    });

    revalidatePath(`/brands/${brandId}/settings`);
    revalidatePath(`/brands/${brandId}`);
    revalidatePath("/");
    return { ok: true, savedAt: new Date().toISOString() };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

/** Detach a brand font (falls back to the bundled Anton/Barlow for that role). */
export async function removeFont(brandId: string, role: "headline" | "body"): Promise<SaveResult> {
  try {
    await assertBrandInOrg(brandId);
    const profile = await loadBrandProfile(brandId);
    await saveBrandProfile(brandId, {
      fonts: profile.fonts.filter((f) => f.role !== role),
    });
    revalidatePath(`/brands/${brandId}/settings`);
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

/** Detach the logo (creatives then render without one). */
export async function removeLogo(brandId: string): Promise<SaveResult> {
  try {
    await assertBrandInOrg(brandId);
    await saveBrandProfile(brandId, { logoAssetId: null });
    revalidatePath(`/brands/${brandId}/settings`);
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
