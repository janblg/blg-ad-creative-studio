import { NextResponse } from "next/server";
import { requireContext } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { getImageProvider } from "@/lib/providers/image-factory";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const DEFAULT_STYLE = `Professional advertising photograph. Photorealistic, natural light, shallow depth of field, shot on an 85mm lens at f/1.8, rich color, crisp detail, authentic candid moment, high production value.`;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const brandId = searchParams.get("brandId");
  const desc = (searchParams.get("desc") ?? "").trim();
  if (!desc) return NextResponse.json({ error: "missing desc" }, { status: 400 });

  const { orgId } = await requireContext();
  const supabase = await supabaseServer();

  let style = DEFAULT_STYLE;
  if (brandId) {
    const { data } = await supabase
      .from("brand_profiles")
      .select("image_prompt_style")
      .eq("brand_id", brandId)
      .maybeSingle();
    if (data?.image_prompt_style) style = data.image_prompt_style;
  }

  try {
    const provider = await getImageProvider(orgId, "openai");
    const [img] = await provider.generate({
      prompt: `${style}\n\nScene to depict: ${desc}`,
      n: 1,
      quality: "medium",
      aspectRatio: "4:5",
    });
    return new NextResponse(new Uint8Array(img.buffer), {
      headers: { "Content-Type": "image/png", "Cache-Control": "no-store" },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "generation failed" },
      { status: 500 },
    );
  }
}
