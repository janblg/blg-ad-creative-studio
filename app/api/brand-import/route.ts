import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";
import { requireContext, isRedirectError } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getSecret } from "@/lib/secrets";
import { normalizeLogoToPng } from "@/lib/images/normalize";
import { saveBrandProfile, type ColorRole } from "@/lib/brand/profile";
import {
  extractColors,
  extractLogoCandidates,
  extractTextSnippet,
  extractTitle,
  fetchImage,
  fetchPage,
  fetchStylesheets,
  normalizeUrl,
  stylesheetUrls,
} from "@/lib/import/website";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

/**
 * Import a brand's colors + logo from its public website.
 *
 * The logo is stored immediately (same path as a manual upload). Colors are
 * only SUGGESTED — they come back to the settings form for the operator to
 * confirm and save, because role assignment is a judgement call the brand
 * owner should ratify.
 */

const MODEL = "claude-sonnet-5";

interface SuggestedColor {
  name: string;
  hex: string;
  role: ColorRole;
}

const PALETTE_TOOL = {
  name: "emit_palette",
  description: "Return the brand palette with a role for each color.",
  input_schema: {
    type: "object",
    required: ["colors"],
    properties: {
      colors: {
        type: "array",
        items: {
          type: "object",
          required: ["name", "hex", "role"],
          properties: {
            name: { type: "string" },
            hex: { type: "string" },
            role: {
              type: "string",
              enum: ["primary", "secondary", "hook_accent", "hook_text", "palette"],
            },
          },
        },
      },
    },
  },
} as const;

export async function POST(req: Request) {
  try {
    await requireContext();
    const body = (await req.json()) as { brandId?: string; url?: string };
    const brandId = String(body.brandId ?? "").trim();
    if (!brandId) {
      return NextResponse.json({ error: "Missing brandId." }, { status: 400 });
    }

    let url: string;
    try {
      url = normalizeUrl(String(body.url ?? ""));
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Invalid address." },
        { status: 400 },
      );
    }

    // RLS authorizes; org_id comes from the brand row (never requireContext).
    const scoped = await supabaseServer();
    const { data: brandRows } = await scoped
      .from("brands")
      .select("id, org_id, name")
      .eq("id", brandId)
      .limit(1);
    const brand = brandRows?.[0];
    if (!brand) return NextResponse.json({ error: "Brand not found." }, { status: 404 });
    const orgId = brand.org_id as string;
    const admin = supabaseAdmin();

    // ---- fetch the site ----
    let html: string;
    try {
      html = await fetchPage(url);
    } catch (e) {
      return NextResponse.json(
        {
          error: `Couldn't open ${url} — ${e instanceof Error ? e.message : String(e)}. Check the address, or add the colors by hand.`,
        },
        { status: 400 },
      );
    }
    const css = await fetchStylesheets(stylesheetUrls(html, url));
    const candidates = extractColors(`${html}\n${css}`);
    const title = extractTitle(html);
    const snippet = extractTextSnippet(html);

    // ---- logo: first candidate that actually decodes ----
    let logo: { assetId: string; url?: string; width?: number; height?: number } | null = null;
    let logoPngForVision: Buffer | null = null;
    for (const candidate of extractLogoCandidates(html, url)) {
      const got = await fetchImage(candidate);
      if (!got) continue;
      let png: Buffer;
      try {
        png = await normalizeLogoToPng(got.buffer, 1024);
      } catch {
        continue; // ICO/SVG variants sharp can't read — try the next one
      }
      const meta = await sharp(png).metadata();
      // Skip tiny favicons when something better may follow.
      if ((meta.width ?? 0) < 48) continue;

      const path = `${orgId}/brands/${brandId}/logo/${crypto.randomUUID()}.png`;
      const up = await admin.storage
        .from("assets")
        .upload(path, png, { contentType: "image/png", upsert: true });
      if (up.error) continue;

      const { data: asset } = await admin
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
      if (!asset) continue;

      await saveBrandProfile(brandId, { logoAssetId: asset.id });
      const signed = await admin.storage.from("assets").createSignedUrl(path, 3600);
      logo = {
        assetId: asset.id,
        url: signed.data?.signedUrl,
        width: meta.width,
        height: meta.height,
      };
      logoPngForVision = png;
      break;
    }

    if (!candidates.length && !logo) {
      return NextResponse.json(
        {
          error:
            "Nothing usable found on that page. It may be script-rendered or blocking automated visits — add the colors and logo by hand.",
        },
        { status: 422 },
      );
    }

    // ---- role assignment ----
    let colors: SuggestedColor[] = candidates.slice(0, 4).map((c, i) => ({
      name: `Color ${i + 1}`,
      hex: c.hex,
      role: (i === 0 ? "primary" : i === 1 ? "secondary" : "palette") as ColorRole,
    }));

    const key = await getSecret(orgId, "anthropic_api_key");
    if (key && (candidates.length || logoPngForVision)) {
      try {
        const client = new Anthropic({ apiKey: key });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const content: any[] = [];
        if (logoPngForVision) {
          // Flatten onto white — a JPEG has no alpha, and a logo on black
          // would read as the wrong color.
          const flat = await sharp(logoPngForVision)
            .flatten({ background: "#ffffff" })
            .resize(512, 512, { fit: "inside" })
            .jpeg({ quality: 80 })
            .toBuffer();
          content.push({
            type: "image",
            source: { type: "base64", media_type: "image/jpeg", data: flat.toString("base64") },
          });
        }
        content.push({
          type: "text",
          text: `Website: ${url}\nTitle: ${title}\nPage text: ${snippet}\n\nColors found in the site's CSS (likely brand colors first, then framework defaults):\n${candidates
            .map(
              (c) =>
                `${c.hex} — used ${c.count}x${c.frameworkDefault ? " — FRAMEWORK DEFAULT, almost certainly not a brand color" : ""}`,
            )
            .join("\n")}`,
        });

        const msg = await client.messages.create({
          model: MODEL,
          max_tokens: 1000,
          system: `You identify a brand's palette for an ad-creative tool. You are given the brand's logo (if available) and the colors its website's CSS uses most.

Return 3-5 colors, each with a short human name and one role:
- "primary": the dominant brand color (usually the logo's main color).
- "secondary": the supporting brand color.
- "hook_accent": the color used to emphasize words in ad headlines. CRITICAL — this is set as text or a solid bar over photographs and dark scrims, so it must be BRIGHT and SATURATED. A dark navy or deep brand blue is a poor accent even when it is the primary; prefer a red, orange, yellow or bright green from the brand's range. Pick the most legible option available.
- "hook_text": the main headline text color — almost always #FFFFFF.
- "palette": any other genuine brand color.

Colors marked FRAMEWORK DEFAULT come from Bootstrap/Tailwind and are almost never the brand's — only pick one if the logo clearly shows that color. Trust the LOGO over CSS frequency. Ignore greys and near-black/near-white. Every hex must be a real 6-digit hex. Include exactly one hook_accent and one hook_text.`,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          tools: [PALETTE_TOOL as any],
          tool_choice: { type: "tool", name: "emit_palette" },
          messages: [{ role: "user", content }],
        });
        const tool = msg.content.find((b) => b.type === "tool_use");
        if (tool && tool.type === "tool_use") {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const got = ((tool.input as any).colors ?? []) as SuggestedColor[];
          const valid = got.filter((c) => /^#[0-9a-fA-F]{6}$/.test(c.hex ?? ""));
          if (valid.length) {
            colors = valid.map((c) => ({ ...c, hex: c.hex.toUpperCase() }));
          }
        }
      } catch {
        // Keep the frequency-ranked fallback — an import with plain colors is
        // still far better than typing them in.
      }
    }

    if (!colors.some((c) => c.role === "hook_text")) {
      colors.push({ name: "Headline white", hex: "#FFFFFF", role: "hook_text" });
    }

    return NextResponse.json({
      ok: true,
      url,
      title,
      colors,
      logo,
      candidateCount: candidates.length,
    });
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
