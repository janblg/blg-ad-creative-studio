import Link from "next/link";
import { notFound } from "next/navigation";
import { requireContext } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { saveStyle } from "./actions";

export default async function StudioPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ desc?: string; saved?: string }>;
}) {
  const { id } = await params;
  const { desc, saved } = await searchParams;
  await requireContext();
  const supabase = await supabaseServer();

  const { data: brand } = await supabase
    .from("brands")
    .select("id, name")
    .eq("id", id)
    .maybeSingle();
  if (!brand) notFound();

  const { data: profile } = await supabase
    .from("brand_profiles")
    .select("image_prompt_style")
    .eq("brand_id", id)
    .maybeSingle();

  return (
    <div className="max-w-3xl">
      <Link href={`/brands/${id}`} className="text-sm text-neutral-500 hover:underline">
        ← {brand.name}
      </Link>
      <h1 className="text-xl font-semibold mt-2 mb-1">Image Studio</h1>
      <p className="text-sm text-neutral-500 mb-6">
        Describe the image you need and the tool generates it — using this brand&apos;s
        photography style.
      </p>

      {/* Style "training" */}
      <details className="mb-6 rounded-lg border border-neutral-200 dark:border-neutral-800 p-4" open={!profile?.image_prompt_style}>
        <summary className="cursor-pointer text-sm font-medium">
          Photography style instructions {profile?.image_prompt_style ? "✓" : "(set this first)"}
        </summary>
        <form action={saveStyle} className="mt-3 space-y-2">
          <input type="hidden" name="brand_id" value={id} />
          <textarea
            name="image_prompt_style"
            rows={7}
            defaultValue={profile?.image_prompt_style ?? ""}
            placeholder="Paste your Claude image-prompt project instructions here (photography fundamentals: light, exposure, lens, aperture, mood…). This trains every image for this brand."
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm font-mono dark:bg-neutral-900 dark:border-neutral-700"
          />
          <button className="rounded-md bg-neutral-900 text-white px-4 py-2 text-sm font-medium hover:bg-neutral-800 dark:bg-white dark:text-neutral-900">
            Save style
          </button>
          {saved && <span className="ml-3 text-sm text-emerald-600">Saved ✓</span>}
        </form>
      </details>

      {/* Prompt -> image */}
      <form className="flex gap-2 mb-6">
        <input
          name="desc"
          defaultValue={desc ?? ""}
          placeholder="e.g. a mechanical bull at a corporate summer event, guests cheering"
          className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm dark:bg-neutral-900 dark:border-neutral-700"
        />
        <button className="rounded-md bg-neutral-900 text-white px-5 py-2 text-sm font-medium hover:bg-neutral-800 dark:bg-white dark:text-neutral-900">
          Generate
        </button>
      </form>

      {desc && (
        <div>
          <p className="text-sm text-neutral-500 mb-2">
            Generating (~20–30s)… “{desc}”
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/studio-image?brandId=${id}&desc=${encodeURIComponent(desc)}`}
            alt={desc}
            className="w-full max-w-md rounded-lg border border-neutral-200 dark:border-neutral-800"
          />
        </div>
      )}
    </div>
  );
}
