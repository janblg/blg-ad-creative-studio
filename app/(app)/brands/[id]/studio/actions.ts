"use server";
import { requireContext } from "@/lib/auth";
import { getSecret } from "@/lib/secrets";
import { buildMasterPrompt } from "@/lib/prompt-engine/engine";
import { getImageProvider } from "@/lib/providers/image-factory";
import { supabaseAdmin } from "@/lib/supabase/admin";

export interface GenState {
  error?: string;
  brief?: string;
  visualSystem?: string;
  masterPrompt?: string;
  imageUrl?: string;
  usedReference?: boolean;
}

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export async function generate(
  _prev: GenState,
  formData: FormData,
): Promise<GenState> {
  const brief = String(formData.get("brief") ?? "").trim();
  if (!brief) return { error: "Enter a description of the image you need." };

  const { orgId } = await requireContext();
  const anthropic = await getSecret(orgId, "anthropic_api_key");
  if (!anthropic) {
    return { error: "No Anthropic key configured. Set ANTHROPIC_API_KEY in the environment.", brief };
  }

  // Collect uploaded reference product images (max 4).
  const files = formData
    .getAll("images")
    .filter((f): f is File => f instanceof File && f.size > 0)
    .slice(0, 4);
  const refB64: { b64: string; mime: string }[] = [];
  const refBufs: { buffer: Buffer; mime: string }[] = [];
  for (const f of files) {
    const buf = Buffer.from(await f.arrayBuffer());
    const mime = f.type || "image/png";
    refBufs.push({ buffer: buf, mime });
    refB64.push({ b64: buf.toString("base64"), mime });
  }
  const usedReference = refB64.length > 0;

  let engine;
  try {
    engine = await buildMasterPrompt({
      brief,
      apiKey: anthropic,
      referenceImages: usedReference ? refB64 : undefined,
    });
  } catch (e) {
    return { error: `Prompt engine failed: ${msg(e)}`, brief };
  }

  let outBuf: Buffer;
  try {
    const provider = await getImageProvider(orgId, "openai");
    const [img] = await provider.generate({
      prompt: engine.masterPrompt,
      n: 1,
      quality: "medium",
      aspectRatio: "4:5",
      referenceImages: usedReference ? refBufs : undefined,
    });
    outBuf = img.buffer;
  } catch (e) {
    return {
      error: `Image generation failed: ${msg(e)}`,
      brief,
      visualSystem: engine.visualSystem,
      masterPrompt: engine.masterPrompt,
      usedReference,
    };
  }

  // Store the result and hand back a signed URL to display.
  try {
    const admin = supabaseAdmin();
    const path = `${orgId}/studio/${crypto.randomUUID()}.png`;
    const up = await admin.storage
      .from("assets")
      .upload(path, outBuf, { contentType: "image/png", upsert: false });
    if (up.error) throw up.error;
    const signed = await admin.storage.from("assets").createSignedUrl(path, 3600);
    return {
      brief,
      visualSystem: engine.visualSystem,
      masterPrompt: engine.masterPrompt,
      imageUrl: signed.data?.signedUrl,
      usedReference,
    };
  } catch (e) {
    return {
      error: `Saving image failed: ${msg(e)}`,
      brief,
      visualSystem: engine.visualSystem,
      masterPrompt: engine.masterPrompt,
      usedReference,
    };
  }
}
