import { notFound } from "next/navigation";
import { requireContext } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { StudioFeed } from "./StudioFeed";
import { BrandSwitcher } from "./BrandSwitcher";
import { listBatches, loadBatch, listProductCategories } from "@/lib/studio/load";

// Server actions invoked from this route inherit this ceiling. Hook
// generation (10 blocks through the 21k-char playbook, possible retry) and
// image generation both run well past 60s. Fluid compute allows 300.
export const maxDuration = 300;

export default async function StudioPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ batch?: string }>;
}) {
  const { id } = await params;
  const { batch: batchParam } = await searchParams;
  await requireContext();
  const supabase = await supabaseServer();

  // RLS authorizes both reads; org_id is never taken from the session
  // (BUILD_PLAN rule, commit b361caf). `.limit(1)` not `.maybeSingle()`.
  const [{ data: brandRows }, { data: brands }] = await Promise.all([
    supabase.from("brands").select("id, name").eq("id", id).limit(1),
    supabase.from("brands").select("id, name").order("name"),
  ]);
  const brand = brandRows?.[0];
  if (!brand) notFound();

  const [batches, restored, categories] = await Promise.all([
    listBatches(brand.id),
    batchParam ? loadBatch(batchParam) : Promise.resolve(null),
    listProductCategories(brand.id),
  ]);

  return (
    <div className="fixed inset-0 top-14 bg-gradient-to-b from-neutral-100 to-neutral-200 dark:from-neutral-900 dark:to-neutral-950">
      {/* Glass pill top bar */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2">
        <BrandSwitcher brands={brands ?? []} current={brand.id} />
        <div className="rounded-full border border-white/60 dark:border-white/10 bg-white/60 dark:bg-white/5 backdrop-blur px-4 py-2">
          <span className="text-[11px] uppercase tracking-widest text-neutral-400 mr-2">Format</span>
          <span className="text-sm font-medium">4:5 Feed</span>
        </div>
      </div>
      <div className="h-full pt-16">
        <StudioFeed
          key={restored?.id ?? "new"}
          brandId={brand.id}
          brandName={brand.name}
          initialBatch={restored}
          batches={batches}
          categories={categories}
        />
      </div>
    </div>
  );
}
