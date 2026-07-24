import { NextResponse } from "next/server";
import { requireContext } from "@/lib/auth";
import { normalizeToPng, toVisionJpegBase64 } from "@/lib/images/normalize";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

/**
 * Binary-safe product-photo upload. Uses native multipart parsing
 * (request.formData) — passing Files through server actions was corrupting
 * the binary via a UTF-8 text pass. Normalizes + stores each image.
 */
export async function POST(req: Request) {
  try {
    const { orgId } = await requireContext();
    const form = await req.formData();
    const files = form
      .getAll("images")
      .filter((f): f is File => f instanceof File && f.size > 0)
      .slice(0, 4);

    const admin = supabaseAdmin();
    const refs: { path: string; url: string | undefined; visionB64: string }[] = [];
    for (const f of files) {
      const raw = Buffer.from(await f.arrayBuffer());
      let png: Buffer;
      let visionB64: string;
      try {
        png = await normalizeToPng(raw, 1024);
        // Produce the small vision JPEG here, from the just-decoded in-memory
        // image — no storage round-trip / second decode later.
        visionB64 = await toVisionJpegBase64(png, 1024);
      } catch (e) {
        return NextResponse.json(
          {
            error: `[upload-route] Couldn't read "${f.name}" (${f.type || "unknown"}, ${raw.length}b, sig=${raw.subarray(0, 4).toString("hex")}). ${
              e instanceof Error ? e.message : String(e)
            }`,
          },
          { status: 400 },
        );
      }
      const path = `${orgId}/studio/refs/${crypto.randomUUID()}.png`;
      const up = await admin.storage
        .from("assets")
        .upload(path, png, { contentType: "image/png", upsert: true });
      if (up.error) {
        return NextResponse.json({ error: up.error.message }, { status: 500 });
      }
      const signed = await admin.storage.from("assets").createSignedUrl(path, 3600);
      refs.push({ path, url: signed.data?.signedUrl, visionB64 });
    }
    return NextResponse.json({ refs });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
