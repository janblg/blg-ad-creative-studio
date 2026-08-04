import { NextResponse } from "next/server";
import { requireContext, isRedirectError } from "@/lib/auth";
import { normalizeLogoToPng } from "@/lib/images/normalize";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import { validateBrandFont, fontMime } from "@/lib/render/font-validate";
import { loadBrandProfile, saveBrandProfile, type FontRole } from "@/lib/brand/profile";
import sharp from "sharp";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

/**
 * Brand font + logo upload.
 *
 * A route handler, not a server action — gotcha #1: passing binary File objects
 * through a server action mangles the bytes via a UTF-8 text pass (PNG's 0x89
 * became EF BF BD). Gotcha #2: middleware must keep skipping /api/* or the
 * multipart body is corrupted the same way. This route authenticates itself
 * via requireContext().
 *
 * Fonts are gated by validateBrandFont() — satori cannot read WOFF2 (#18) and
 * crashes outright on variable fonts (#19), and neither failure is visible
 * until render time, so they are rejected here with an actionable message.
 */
export async function POST(req: Request) {
  try {
    await requireContext();
    const form = await req.formData();

    const brandId = String(form.get("brandId") ?? "").trim();
    const kind = String(form.get("kind") ?? "").trim(); // "font" | "logo"
    const file = form.get("file");

    if (!brandId) {
      return NextResponse.json({ error: "Missing brandId." }, { status: 400 });
    }
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: "No file received." }, { status: 400 });
    }

    // Authorize through RLS (`is_org_member(org_id)`) rather than matching a
    // single orgId from the membership row — that breaks for a user in more
    // than one org. The brand's own org_id then owns the stored asset.
    const scoped = await supabaseServer();
    const { data: brand } = await scoped
      .from("brands")
      .select("id, org_id")
      .eq("id", brandId)
      .maybeSingle();
    if (!brand) {
      return NextResponse.json({ error: "Brand not found." }, { status: 404 });
    }
    const orgId = brand.org_id as string;
    const admin = supabaseAdmin();

    const raw = Buffer.from(await file.arrayBuffer());

    if (kind === "font") {
      const role = String(form.get("role") ?? "") as FontRole;
      if (role !== "headline" && role !== "body") {
        return NextResponse.json(
          { error: "Font role must be 'headline' or 'body'." },
          { status: 400 },
        );
      }
      const weightRaw = Number(form.get("weight"));
      const weight = Number.isFinite(weightRaw) && weightRaw > 0 ? weightRaw : 400;

      const check = validateBrandFont(raw, file.name);
      if (!check.ok) {
        return NextResponse.json({ error: check.error }, { status: 400 });
      }

      const ext = check.format;
      const path = `${orgId}/brands/${brandId}/fonts/${crypto.randomUUID()}.${ext}`;
      const up = await admin.storage
        .from("assets")
        .upload(path, raw, { contentType: fontMime(check.format), upsert: true });
      if (up.error) {
        return NextResponse.json({ error: up.error.message }, { status: 500 });
      }

      const { data: asset, error: assetErr } = await admin
        .from("image_assets")
        .insert({
          org_id: orgId,
          brand_id: brandId,
          kind: "font",
          storage_path: path,
          mime: fontMime(check.format),
        })
        .select("id")
        .single();
      if (assetErr || !asset) {
        return NextResponse.json(
          { error: assetErr?.message ?? "Could not record font asset." },
          { status: 500 },
        );
      }

      // Replace any existing font in this role.
      const profile = await loadBrandProfile(brandId);
      const fonts = [
        ...profile.fonts.filter((f) => f.role !== role),
        { role, asset_id: asset.id, weight, filename: file.name },
      ];
      await saveBrandProfile(brandId, { fonts });

      return NextResponse.json({
        ok: true,
        kind: "font",
        role,
        assetId: asset.id,
        filename: file.name,
        format: check.format,
        weight,
      });
    }

    if (kind === "logo") {
      let png: Buffer;
      try {
        png = await normalizeLogoToPng(raw, 1024);
      } catch (e) {
        return NextResponse.json(
          {
            error: `Couldn't read "${file.name}" (${file.type || "unknown"}, ${raw.length}b). ${
              e instanceof Error ? e.message : String(e)
            }`,
          },
          { status: 400 },
        );
      }
      const meta = await sharp(png).metadata();

      const path = `${orgId}/brands/${brandId}/logo/${crypto.randomUUID()}.png`;
      const up = await admin.storage
        .from("assets")
        .upload(path, png, { contentType: "image/png", upsert: true });
      if (up.error) {
        return NextResponse.json({ error: up.error.message }, { status: 500 });
      }

      const { data: asset, error: assetErr } = await admin
        .from("image_assets")
        .insert({
          org_id: orgId,
          brand_id: brandId,
          kind: "logo",
          storage_path: path,
          width: meta.width ?? null,
          height: meta.height ?? null,
          mime: "image/png",
        })
        .select("id")
        .single();
      if (assetErr || !asset) {
        return NextResponse.json(
          { error: assetErr?.message ?? "Could not record logo asset." },
          { status: 500 },
        );
      }

      await saveBrandProfile(brandId, { logoAssetId: asset.id });

      const signed = await admin.storage.from("assets").createSignedUrl(path, 3600);
      return NextResponse.json({
        ok: true,
        kind: "logo",
        assetId: asset.id,
        url: signed.data?.signedUrl,
        width: meta.width,
        height: meta.height,
        hasAlpha: meta.hasAlpha ?? false,
      });
    }

    return NextResponse.json(
      { error: "kind must be 'font' or 'logo'." },
      { status: 400 },
    );
  } catch (e) {
    if (isRedirectError(e)) {
      return NextResponse.json(
        { error: "Your session expired. Reload the page and sign in again." },
        { status: 401 },
      );
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
