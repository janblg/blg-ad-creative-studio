import { NextResponse } from "next/server";
import { requireContext } from "@/lib/auth";
import { getImageProvider } from "@/lib/providers/image-factory";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** Generates the image from an already-engineered master prompt. */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const master = (searchParams.get("master") ?? "").trim();
  if (!master) return NextResponse.json({ error: "missing master prompt" }, { status: 400 });

  const { orgId } = await requireContext();
  try {
    const provider = await getImageProvider(orgId, "openai");
    const [img] = await provider.generate({
      prompt: master,
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
