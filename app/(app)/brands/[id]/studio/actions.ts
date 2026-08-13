"use server";
import sharp from "sharp";
import { requireContext } from "@/lib/auth";
import { getSecret } from "@/lib/secrets";
import { buildMasterPrompt } from "@/lib/prompt-engine/engine";
import { getImageProvider } from "@/lib/providers/image-factory";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { generateHooks, generateAdCopy, type AdCopy } from "@/lib/ai/creative";
import { generateLayout } from "@/lib/render/vision";
import { renderCreative } from "@/lib/render/overlay";
import {
  loadBrandProfile,
  paletteFromProfile,
  resolveBrandStyle,
  engineStyleDirective,
} from "@/lib/brand/profile";
import { toVisionJpegBase64 } from "@/lib/images/normalize";

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

// ---------------------------------------------------------------------------
// Step 1: brief + product photos -> engine (visual system + master prompt)
// ---------------------------------------------------------------------------
export interface BriefResult {
  error?: string;
  refPaths?: string[];
  visualSystem?: string;
  masterPrompt?: string;
}

export async function startBrief(args: {
  brandId: string;
  brief: string;
  refs: { path: string; visionB64: string }[];
}): Promise<BriefResult> {
  try {
    const brief = args.brief.trim();
    if (!brief) return { error: "Describe the image you need." };
    const { orgId } = await requireContext();
    const key = await anthropicKey(orgId);

    // The small vision JPEGs were produced by /api/upload from the in-memory
    // decoded image — no re-download / re-decode here.
    const refB64 = args.refs.map((r) => ({ b64: r.visionB64, mime: "image/jpeg" }));

    // Brand identity flows into the engine as a bounded-palette directive
    // (HYPERREALISM §10.3) — constraint, never an override of the realism laws.
    const profile = await loadBrandProfile(args.brandId);

    const engine = await buildMasterPrompt({
      brief,
      apiKey: key,
      referenceImages: refB64.length ? refB64 : undefined,
      brandContext: engineStyleDirective(profile),
    });

    return {
      refPaths: args.refs.map((r) => r.path),
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
  imagePath?: string;
  imageUrl?: string;
  note?: string;
}

export async function approveAndGenerate(args: {
  masterPrompt: string;
  refB64: string[];
}): Promise<ImageResult> {
  try {
    const { orgId } = await requireContext();
    // Refs are the already-validated small JPEGs produced once at upload time.
    // No download, no re-decode — decode-once, forward-as-base64.
    const refs = args.refB64.map((b) => ({
      buffer: Buffer.from(b, "base64"),
      mime: "image/jpeg",
    }));
    const provider = await getImageProvider(orgId, "openai");
    const base = { prompt: args.masterPrompt, n: 1, quality: "medium" as const, aspectRatio: "4:5" as const };

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
      // If the reference is rejected, still deliver an image from the engine's
      // description (it already described the real product from the photo).
      if (refs.length && /invalid_image|image file or mode/i.test(m)) {
        const [img] = await provider.generate(base);
        outBuf = img.buffer;
        note =
          "The generator couldn't use the uploaded photo directly, so this was created from the engine's written description of it. For exact product fidelity, try a clean, well-lit product photo.";
      } else {
        throw e;
      }
    }

    const imagePath = `${orgId}/studio/gen/${crypto.randomUUID()}.png`;
    await upload(imagePath, outBuf, "image/png");
    return { imagePath, imageUrl: await signed(imagePath), note };
  } catch (e) {
    return { error: err(e) };
  }
}

// ---------------------------------------------------------------------------
// Step 3: hooks
// ---------------------------------------------------------------------------
export async function makeHooks(args: {
  brandId: string;
  brandName: string;
  brief: string;
}): Promise<{ error?: string; hooks?: string[] }> {
  try {
    const { orgId } = await requireContext();
    const key = await anthropicKey(orgId);
    const hooks = await generateHooks({
      apiKey: key,
      brandName: args.brandName,
      brief: args.brief,
      count: 5,
    });
    return { hooks };
  } catch (e) {
    return { error: err(e) };
  }
}

// ---------------------------------------------------------------------------
// Step 4: overlay the chosen hook onto the image (Claude vision layout)
// ---------------------------------------------------------------------------
export async function applyHook(args: {
  brandId: string;
  imagePath: string;
  hook: string;
}): Promise<{
  error?: string;
  overlayUrl?: string;
  overlayDataUrl?: string;
  overlayPath?: string;
  diag?: string;
}> {
  const { orgId } = await requireContext();
  const key = await anthropicKey(orgId);
  const canvas = { width: 1080, height: 1350 };

  // Brand identity: palette for the vision call, real fonts + logo for the
  // renderer. Both degrade gracefully for an unfilled profile (bundled
  // Anton/Barlow, neutral palette, no logo).
  const profile = await loadBrandProfile(args.brandId);
  const palette = paletteFromProfile(profile);
  const resolved = await resolveBrandStyle(args.brandId);

  let photo: Buffer;
  try {
    photo = await download(args.imagePath);
  } catch (e) {
    return { error: `download step: ${err(e)}` };
  }

  // Crop to the FINAL 4:5 frame BEFORE the LayoutSpec pass (BUILD_PLAN §1):
  // gpt-image-1 has no native 4:5, so the generated frame is 2:3 — if the
  // vision model laid text out on the uncropped image, the attention-crop
  // could shift content under the placements afterwards.
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
    // Vision gets a small JPEG of the framed image (gotcha #4 — a full-size
    // PNG can exceed Anthropic's per-image limit).
    const visionBuf = Buffer.from(await toVisionJpegBase64(framed, 1024), "base64");
    layout = await generateLayout({
      photoPng: visionBuf,
      photoMime: "image/jpeg",
      hook: args.hook,
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

  // Validate the render output server-side so a bad buffer is a clear error,
  // not a silent broken <img>.
  let meta: { width?: number; height?: number } | null = null;
  try {
    meta = await sharp(png).metadata();
  } catch {
    meta = null;
  }
  if (!meta?.width) {
    return {
      error: `render produced an invalid image (${png.length}b, sig=${png.subarray(0, 4).toString("hex")})`,
    };
  }

  // Serve via a compact data URL (bypasses storage/signed-URL serving) + also
  // store the full PNG for later export.
  let dataUrl: string | undefined;
  try {
    const preview = await sharp(png).jpeg({ quality: 85 }).toBuffer();
    dataUrl = `data:image/jpeg;base64,${preview.toString("base64")}`;
  } catch {
    /* fall back to signed URL below */
  }

  const overlayPath = `${orgId}/studio/creative/${crypto.randomUUID()}.png`;
  try {
    await upload(overlayPath, png, "image/png");
  } catch (e) {
    // If storage fails we can still show the data URL.
    return dataUrl
      ? { overlayDataUrl: dataUrl, diag: `${meta.width}x${meta.height}, ${png.length}b (not stored: ${err(e)})` }
      : { error: `upload step: ${err(e)}` };
  }

  return {
    overlayPath,
    overlayUrl: await signed(overlayPath),
    overlayDataUrl: dataUrl,
    diag: `${meta.width}x${meta.height}, ${png.length}b`,
  };
}

// ---------------------------------------------------------------------------
// Step 5: Meta ad copy
// ---------------------------------------------------------------------------
export async function makeCopy(args: {
  brandName: string;
  brief: string;
  hook: string;
}): Promise<{ error?: string; copy?: AdCopy }> {
  try {
    const { orgId } = await requireContext();
    const key = await anthropicKey(orgId);
    const copy = await generateAdCopy({
      apiKey: key,
      brandName: args.brandName,
      brief: args.brief,
      hook: args.hook,
    });
    return { copy };
  } catch (e) {
    return { error: err(e) };
  }
}
