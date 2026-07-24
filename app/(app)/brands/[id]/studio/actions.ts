"use server";
import { requireContext } from "@/lib/auth";
import { getSecret } from "@/lib/secrets";
import { buildMasterPrompt } from "@/lib/prompt-engine/engine";
import { getImageProvider } from "@/lib/providers/image-factory";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { generateHooks, generateAdCopy, type AdCopy } from "@/lib/ai/creative";
import { generateLayout, type BrandColor } from "@/lib/render/vision";
import { renderCreative } from "@/lib/render/overlay";
import { defaultFonts } from "@/lib/render/fonts";

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

/** Brand palette from profile, with a solid default. */
async function brandPalette(brandId: string): Promise<BrandColor[]> {
  const admin = supabaseAdmin();
  const { data } = await admin
    .from("brand_profiles")
    .select("colors")
    .eq("brand_id", brandId)
    .maybeSingle();
  const colors = (data?.colors ?? []) as { hex?: string; role?: string }[];
  const valid = colors.filter((c) => /^#[0-9a-fA-F]{6}$/.test(c.hex ?? ""));
  if (valid.length >= 2) return valid.map((c) => ({ hex: c.hex!, role: c.role }));
  return [
    { hex: "#FFFFFF", role: "text" },
    { hex: "#FFD23F", role: "accent" },
    { hex: "#111111", role: "dark" },
  ];
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

    const engine = await buildMasterPrompt({
      brief,
      apiKey: key,
      referenceImages: refB64.length ? refB64 : undefined,
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
}): Promise<{ error?: string; overlayUrl?: string; overlayPath?: string }> {
  try {
    const { orgId } = await requireContext();
    const key = await anthropicKey(orgId);
    const photo = await download(args.imagePath);
    const palette = await brandPalette(args.brandId);

    // Layout on a fixed 1080x1350 canvas (4:5 Meta feed).
    const canvas = { width: 1080, height: 1350 };
    const layout = await generateLayout({
      photoPng: photo,
      hook: args.hook,
      palette,
      canvas,
      hasLogo: false,
      apiKey: key,
    });
    const png = await renderCreative({
      background: photo,
      style: { fonts: defaultFonts() },
      layout,
    });
    const overlayPath = `${orgId}/studio/creative/${crypto.randomUUID()}.png`;
    await upload(overlayPath, png, "image/png");
    return { overlayPath, overlayUrl: await signed(overlayPath) };
  } catch (e) {
    return { error: err(e) };
  }
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
