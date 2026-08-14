import { notFound } from "next/navigation";
import { requireContext } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { listBatches, loadBatch, listProductCategories } from "@/lib/studio/load";
import { BoardShell } from "./BoardShell";

// Server actions invoked from this route inherit this ceiling; hook and image
// generation both run well past 60s.
export const maxDuration = 300;

export default async function BoardPage({
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

  // RLS authorizes; never filter by the session's single orgId (BUILD_PLAN rule).
  const { data: brandRows } = await supabase
    .from("brands")
    .select("id, name")
    .eq("id", id)
    .limit(1);
  const brand = brandRows?.[0];
  if (!brand) notFound();

  const [batches, restored, categories] = await Promise.all([
    listBatches(brand.id),
    batchParam ? loadBatch(batchParam) : Promise.resolve(null),
    listProductCategories(brand.id),
  ]);

  return (
    <div className="fixed inset-0 top-14 bg-canvas">
      <BoardShell
        key={restored?.id ?? "new"}
        brandId={brand.id}
        brandName={brand.name}
        initialBatch={restored}
        batches={batches}
        categories={categories}
      />
    </div>
  );
}
