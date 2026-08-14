"use server";
import sharp from "sharp";
import { requireContext } from "@/lib/auth";
import { getSecret } from "@/lib/secrets";
import { buildMasterPrompt } from "@/lib/prompt-engine/engine";
import { getImageProvider } from "@/lib/providers/image-factory";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import {
  generateHooks,
  generateAdCopy,
  type AdCopy,
  type GeneratedHook,
} from "@/lib/ai/creative";
import { generateLayout } from "@/lib/render/vision";
import { renderCreative } from "@/lib/render/overlay";
import {
  loadBrandProfile,
  paletteFromProfile,
  resolveBrandStyle,
  engineStyleDirective,
} from "@/lib/brand/profile";
import { toVisionJpegBase64 } from "@/lib/images/normalize";

/**
 * Studio actions — every step persists to the workflow tables (Phase 3), so a
 * batch survives refresh and can be resumed from the batch list.
 *
 * Authorization rule (BUILD_PLAN, commit b361caf): authorize via RLS —
 * `supabaseServer()` + `.eq("id", ...)` — and take `org_id` from the returned
 * row. Never filter by requireContext()'s single orgId. Storage and
 * cross-table writes then use the admin client with ids the RLS query proved
 * the user may touch.
 */

const err = (e: unknown) => (e instanceof Error ? e.message : String(e));
const BUCKET = "assets";

async function anthropicKey(orgId: string): Promise<string> {
  const key = await getSecret(orgId, "anthropic_api_key");
  if (!key) throw new Error("No Anthropic key configured (ANTHROPIC_API_KEY).");
  return key;
}

async function signed(path: string): Promise<string> {
  const admin = supabaseAdmin();
  const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(path, 3600);
  if (error || !data) throw new Error(`Could not sign ${path}: ${error?.message}`);
  return data.signedUrl;
}

async function upload(path: string, buf: Buffer, contentType: string) {
  const admin = supabaseAdmin();
  const { error } = await admin.storage
    .from(BUCKET)
    .upload(path, buf, { contentType, upsert: true });
  if (error) throw new Error(`Upload failed: ${error.message}`);
}

async function download(path: string): Promise<Buffer> {
  const admin = supabaseAdmin();
  const { data, error } = await admin.storage.from(BUCKET).download(path);
  if (error || !data) throw new Error(`Download failed: ${error?.message}`);
  return Buffer.from(await data.arrayBuffer());
}

/** RLS-authorized brand fetch; org_id comes from the row, never the session. */
async function authorizeBrand(brandId: string): Promise<{ orgId: string; brandName: string }> {
  const supabase = await supabaseServer();
  const { data } = await supabase
    .from("brands")
    .select("id, org_id, name")
    .eq("id", brandId)
    .limit(1);
  const brand = data?.[0];
  if (!brand) throw new Error("Brand not found or not accessible.");
  return { orgId: brand.org_id, brandName: brand.name };
}

/** RLS-authorized batch fetch (joins to brand for org + name). */
async function authorizeBatch(batchId: string): Promise<{
  batch: {
    id: string;
    brand_id: string;
    brief: string | null;
    visual_system: string | null;
    master_prompt: string | null;
    master_prompt_approved: boolean;
    base_image_asset_id: string | null;
    ref_asset_ids: string[];
    category: string | null;
    product_id: string | null;
  };
  orgId: string;
  brandName: string;
}> {
  const supabase = await supabaseServer();
  const { data } = await supabase
    .from("batches")
    .select(
      "id, brand_id, brief, visual_system, master_prompt, master_prompt_approved, base_image_asset_id, ref_asset_ids, category, product_id",
    )
    .eq("id", batchId)
    .limit(1);
  const batch = data?.[0];
  if (!batch) throw new Error("Session not found or not accessible.");
  const { orgId, brandName } = await authorizeBrand(batch.brand_id);
  return { batch, orgId, brandName };
}

async function assetPath(assetId: string): Promise<string> {
  const admin = supabaseAdmin();
  const { data } = await admin
    .from("image_assets")
    .select("storage_path")
    .eq("id", assetId)
    .maybeSingle();
  if (!data?.storage_path) throw new Error(`Asset ${assetId} missing.`);
  return data.storage_path;
}

// ---------------------------------------------------------------------------
// Step 0: category -> five suggested products from the brand's catalog
// ---------------------------------------------------------------------------
export interface SuggestedProduct {
  id: string;
  name: string;
  priceText?: string;
  why?: string;
}

export async function suggestProducts(args: {
  brandId: string;
  category: string;
}): Promise<{ error?: string; products?: SuggestedProduct[] }> {
  try {
    const { orgId } = await authorizeBrand(args.brandId);
    const supabase = await supabaseServer();
    const { data } = await supabase
      .from("products")
      .select("id, name, price_text")
      .eq("brand_id", args.brandId)
      .eq("category", args.category)
      .eq("status", "active")
      .limit(200);

    const all = (data ?? []).map((p) => ({
      id: p.id as string,
      name: p.name as string,
      priceText: (p.price_text as string | null) ?? undefined,
    }));
    if (all.length <= 5) return { products: all };

    // Let the model choose a spread worth advertising rather than the first
    // five alphabetically — variety of size/theme makes a better hook set.
    try {
      const key = await anthropicKey(orgId);
      const { pickProducts } = await import("@/lib/ai/products");
      const picked = await pickProducts({
        apiKey: key,
        category: args.category,
        products: all.map((p) => ({ id: p.id, name: p.name })),
      });
      if (picked.length) {
        const byId = new Map(all.map((p) => [p.id, p]));
        const out = picked
          .map((p) => {
            const base = byId.get(p.id);
            return base ? { ...base, why: p.why } : null;
          })
          .filter(Boolean) as SuggestedProduct[];
        if (out.length) return { products: out.slice(0, 5) };
      }
    } catch {
      // fall through to a plain sample
    }
    return { products: all.slice(0, 5) };
  } catch (e) {
    return { error: err(e) };
  }
}

/** Brief text sent to the AI: the user's words plus the chosen product. */
function briefWithProduct(brief: string, productName?: string | null): string {
  return productName
    ? `${brief}\n\nThe ad features this exact rental product from the brand's catalog: "${productName}". It must be the hero of the image.`
    : brief;
}

// ---------------------------------------------------------------------------
// Step 1: brief + product photos -> engine; creates the persistent batch
// ---------------------------------------------------------------------------
export interface BriefResult {
  error?: string;
  batchId?: string;
  visualSystem?: string;
  masterPrompt?: string;
}

export async function startBrief(args: {
  brandId: string;
  brief: string;
  refs: { path: string; visionB64: string }[];
  category?: string;
  productId?: string;
}): Promise<BriefResult> {
  try {
    const brief = args.brief.trim();
    if (!brief) return { error: "Describe the image you need." };
    const { user } = await requireContext();
    const { orgId } = await authorizeBrand(args.brandId);
    const key = await anthropicKey(orgId);

    const profile = await loadBrandProfile(args.brandId);

    // The catalog product becomes the hero of the scene.
    let productName: string | null = null;
    if (args.productId) {
      const supabase = await supabaseServer();
      const { data } = await supabase
        .from("products")
        .select("name")
        .eq("id", args.productId)
        .limit(1);
      productName = (data?.[0]?.name as string | undefined) ?? null;
    }

    const engine = await buildMasterPrompt({
      brief: briefWithProduct(brief, productName),
      apiKey: key,
      referenceImages: args.refs.length
        ? args.refs.map((r) => ({ b64: r.visionB64, mime: "image/jpeg" }))
        : undefined,
      brandContext: engineStyleDirective(profile),
    });

    const admin = supabaseAdmin();
    // Product photos become first-class reference assets.
    const refIds: string[] = [];
    for (const r of args.refs) {
      const { data, error } = await admin
        .from("image_assets")
        .insert({
          org_id: orgId,
          brand_id: args.brandId,
          kind: "reference",
          storage_path: r.path,
          mime: "image/png",
        })
        .select("id")
        .single();
      if (error || !data) throw new Error(`Could not record reference: ${error?.message}`);
      refIds.push(data.id);
    }

    const { data: batch, error: batchErr } = await admin
      .from("batches")
      .insert({
        brand_id: args.brandId,
        created_by: user.id,
        name: brief.slice(0, 80),
        status: "setup",
        current_step: 1,
        brief,
        visual_system: engine.visualSystem,
        master_prompt: engine.masterPrompt,
        ref_asset_ids: refIds,
        category: args.category ?? null,
        product_id: args.productId ?? null,
      })
      .select("id")
      .single();
    if (batchErr || !batch) throw new Error(`Could not create session: ${batchErr?.message}`);

    return {
      batchId: batch.id,
      visualSystem: engine.visualSystem,
      masterPrompt: engine.masterPrompt,
    };
  } catch (e) {
    return { error: err(e) };
  }
}

// ---------------------------------------------------------------------------
// Step 2: approved (possibly edited) master prompt -> image
// ---------------------------------------------------------------------------
export interface ImageResult {
  error?: string;
  imageUrl?: string;
  note?: string;
}

export async function approveAndGenerate(args: {
  batchId: string;
  masterPrompt: string;
}): Promise<ImageResult> {
  try {
    const { batch, orgId } = await authorizeBatch(args.batchId);

    // Reference photos come from storage — the batch owns them now, so resume
    // works with nothing held in the browser. These are OUR normalized PNGs.
    const refs: { buffer: Buffer; mime: string }[] = [];
    for (const id of batch.ref_asset_ids ?? []) {
      refs.push({ buffer: await download(await assetPath(id)), mime: "image/png" });
    }

    const provider = await getImageProvider(orgId, "openai");
    const base = {
      prompt: args.masterPrompt,
      n: 1,
      quality: "medium" as const,
      aspectRatio: "4:5" as const,
    };

    let outBuf: Buffer;
    let note: string | undefined;
    try {
      const [img] = await provider.generate({
        ...base,
        referenceImages: refs.length ? refs : undefined,
      });
      outBuf = img.buffer;
    } catch (e) {
      const m = err(e);
      if (refs.length && /invalid_image|image file or mode/i.test(m)) {
        const [img] = await provider.generate(base);
        outBuf = img.buffer;
        note =
          "The generator couldn't use the uploaded photo directly, so this was created from the engine's written description of it.";
      } else {
        throw e;
      }
    }

    const admin = supabaseAdmin();
    const imagePath = `${orgId}/studio/gen/${crypto.randomUUID()}.png`;
    await upload(imagePath, outBuf, "image/png");
    const { data: asset, error: assetErr } = await admin
      .from("image_assets")
      .insert({
        org_id: orgId,
        brand_id: batch.brand_id,
        kind: "background",
        storage_path: imagePath,
        mime: "image/png",
      })
      .select("id")
      .single();
    if (assetErr || !asset) throw new Error(`Could not record image: ${assetErr?.message}`);

    await admin
      .from("batches")
      .update({
        master_prompt: args.masterPrompt,
        master_prompt_approved: true,
        base_image_asset_id: asset.id,
        status: "hooks",
        current_step: 2,
      })
      .eq("id", batch.id);

    return { imageUrl: await signed(imagePath), note };
  } catch (e) {
    return { error: err(e) };
  }
}

// ---------------------------------------------------------------------------
// Step 3: hooks — generated by the Hook Engine, persisted with §12 metadata
// ---------------------------------------------------------------------------
export type PersistedHook = GeneratedHook & { id: string };

export async function makeHooks(args: {
  batchId: string;
}): Promise<{ error?: string; hooks?: PersistedHook[] }> {
  try {
    const { batch, orgId, brandName } = await authorizeBatch(args.batchId);
    const key = await anthropicKey(orgId);

    const profile = await loadBrandProfile(batch.brand_id);
    const ctx = [
      profile.voiceTone && `Voice/tone: ${profile.voiceTone}`,
      profile.targetAudience && `Audience: ${profile.targetAudience}`,
      profile.location && `Location: ${profile.location}`,
      profile.goals && `Goals: ${profile.goals}`,
      profile.hookFrameworks && `Brand hook notes: ${profile.hookFrameworks}`,
    ]
      .filter(Boolean)
      .join("\n");

    let productName: string | null = null;
    if (batch.product_id) {
      const { data } = await supabaseAdmin()
        .from("products")
        .select("name")
        .eq("id", batch.product_id)
        .maybeSingle();
      productName = (data?.name as string | undefined) ?? null;
    }

    const hooks = await generateHooks({
      apiKey: key,
      brandName,
      brief: briefWithProduct(batch.brief ?? "", productName),
      count: 10,
      brandContext: ctx || undefined,
    });

    const admin = supabaseAdmin();
    const rows = hooks.map((h, i) => ({
      batch_id: batch.id,
      text: h.text,
      framework: h.framework,
      origin: h.origin,
      status: "proposed" as const,
      order_index: i,
      emphasis: h.emphasis,
      visual: h.visual,
      why: h.why,
      negative: h.negative,
    }));
    const { data, error } = await admin.from("hooks").insert(rows).select("id, order_index");
    if (error || !data) throw new Error(`Could not save hooks: ${error?.message}`);

    const byIndex = new Map(data.map((r) => [r.order_index, r.id]));
    await admin.from("batches").update({ current_step: 3 }).eq("id", batch.id);

    return { hooks: hooks.map((h, i) => ({ ...h, id: byIndex.get(i) as string })) };
  } catch (e) {
    return { error: err(e) };
  }
}

// ---------------------------------------------------------------------------
// Step 4: hook -> creative (layout vision + overlay render), persisted
// ---------------------------------------------------------------------------
export async function applyHook(args: {
  batchId: string;
  hookId: string;
}): Promise<{
  error?: string;
  overlayUrl?: string;
  overlayDataUrl?: string;
  creativeId?: string;
  diag?: string;
}> {
  const canvas = { width: 1080, height: 1350 };
  let ctx;
  try {
    ctx = await authorizeBatch(args.batchId);
  } catch (e) {
    return { error: err(e) };
  }
  const { batch, orgId } = ctx;
  let key: string;
  try {
    key = await anthropicKey(orgId);
  } catch (e) {
    return { error: err(e) };
  }

  const admin = supabaseAdmin();
  const { data: hookRows } = await admin
    .from("hooks")
    .select("id, text, edited_text, emphasis")
    .eq("id", args.hookId)
    .eq("batch_id", batch.id)
    .limit(1);
  const hook = hookRows?.[0];
  if (!hook) return { error: "Hook not found for this session." };
  if (!batch.base_image_asset_id) return { error: "Generate the image before picking a hook." };

  const profile = await loadBrandProfile(batch.brand_id);
  const palette = paletteFromProfile(profile);
  const resolved = await resolveBrandStyle(batch.brand_id);

  let photo: Buffer;
  try {
    photo = await download(await assetPath(batch.base_image_asset_id));
  } catch (e) {
    return { error: `download step: ${err(e)}` };
  }

  let framed: Buffer;
  try {
    framed = await sharp(photo)
      .resize(canvas.width, canvas.height, { fit: "cover", position: "attention" })
      .png()
      .toBuffer();
  } catch (e) {
    return { error: `crop step: ${err(e)}` };
  }

  let layout;
  try {
    const visionBuf = Buffer.from(await toVisionJpegBase64(framed, 1024), "base64");
    layout = await generateLayout({
      photoPng: visionBuf,
      photoMime: "image/jpeg",
      hook: hook.edited_text ?? hook.text,
      emphasis: hook.emphasis || undefined,
      palette,
      canvas,
      hasLogo: !!resolved.style.logo,
      apiKey: key,
    });
  } catch (e) {
    return { error: `layout step: ${err(e)}` };
  }

  let png: Buffer;
  try {
    png = await renderCreative({
      background: framed,
      style: resolved.style,
      layout,
      logoSize: resolved.logoSize,
    });
  } catch (e) {
    return { error: `render step: ${err(e)}` };
  }

  let meta: { width?: number; height?: number } | null = null;
  try {
    meta = await sharp(png).metadata();
  } catch {
    meta = null;
  }
  if (!meta?.width) {
    return { error: `render produced an invalid image (${png.length}b)` };
  }

  let dataUrl: string | undefined;
  try {
    const preview = await sharp(png).jpeg({ quality: 85 }).toBuffer();
    dataUrl = `data:image/jpeg;base64,${preview.toString("base64")}`;
  } catch {
    /* signed URL below still works */
  }

  try {
    const { user } = await requireContext();
    const overlayPath = `${orgId}/studio/creative/${crypto.randomUUID()}.png`;
    await upload(overlayPath, png, "image/png");
    const { data: asset, error: assetErr } = await admin
      .from("image_assets")
      .insert({
        org_id: orgId,
        brand_id: batch.brand_id,
        kind: "composited",
        storage_path: overlayPath,
        width: meta.width,
        height: meta.height,
        mime: "image/png",
      })
      .select("id")
      .single();
    if (assetErr || !asset) throw new Error(assetErr?.message);

    const { data: creative, error: creativeErr } = await admin
      .from("creatives")
      .insert({ batch_id: batch.id, hook_id: hook.id, status: "draft" })
      .select("id")
      .single();
    if (creativeErr || !creative) throw new Error(creativeErr?.message);

    const { data: variant, error: variantErr } = await admin
      .from("image_variants")
      .insert({
        creative_id: creative.id,
        provider: "openai",
        model: "gpt-image-1",
        background_asset_id: batch.base_image_asset_id,
        composited_asset_id: asset.id,
        layout_spec: layout,
        generation_round: 1,
        is_selected: true,
      })
      .select("id")
      .single();
    if (variantErr || !variant) throw new Error(variantErr?.message);

    await admin
      .from("creatives")
      .update({ selected_variant_id: variant.id })
      .eq("id", creative.id);
    await admin.from("hooks").update({ status: "approved" }).eq("id", hook.id);
    await admin.from("batches").update({ status: "approval", current_step: 4 }).eq("id", batch.id);
    await admin.from("feedback").insert({
      brand_id: batch.brand_id,
      batch_id: batch.id,
      target_type: "hook",
      target_id: hook.id,
      actor_user_id: user.id,
      action: "select",
      step: 3,
    });

    return {
      overlayUrl: await signed(overlayPath),
      overlayDataUrl: dataUrl,
      creativeId: creative.id,
      diag: `${meta.width}x${meta.height}, ${png.length}b`,
    };
  } catch (e) {
    // The render succeeded — show it even if persistence hiccuped.
    return dataUrl
      ? { overlayDataUrl: dataUrl, diag: `render ok; not fully saved: ${err(e)}` }
      : { error: `persist step: ${err(e)}` };
  }
}

// ---------------------------------------------------------------------------
// Step 5: Meta ad copy, persisted onto the creative
// ---------------------------------------------------------------------------
export async function makeCopy(args: {
  batchId: string;
  creativeId: string;
}): Promise<{ error?: string; copy?: AdCopy }> {
  try {
    const { batch, orgId, brandName } = await authorizeBatch(args.batchId);
    const key = await anthropicKey(orgId);

    const admin = supabaseAdmin();
    const { data: creativeRows } = await admin
      .from("creatives")
      .select("id, hook_id, hooks(text, edited_text)")
      .eq("id", args.creativeId)
      .eq("batch_id", batch.id)
      .limit(1);
    const creative = creativeRows?.[0];
    if (!creative) return { error: "Creative not found for this session." };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hookRel = creative.hooks as any;
    const hookText = hookRel?.edited_text ?? hookRel?.text ?? "";

    const copy = await generateAdCopy({
      apiKey: key,
      brandName,
      brief: batch.brief ?? "",
      hook: hookText,
    });

    const { data: copyRow, error: copyErr } = await admin
      .from("ad_copy")
      .insert({
        primary_text: copy.primaryText,
        headline: copy.headline,
        cta: copy.cta,
        status: "draft",
      })
      .select("id")
      .single();
    if (copyErr || !copyRow) throw new Error(copyErr?.message);
    await admin.from("creatives").update({ copy_id: copyRow.id }).eq("id", creative.id);

    return { copy };
  } catch (e) {
    return { error: err(e) };
  }
}
