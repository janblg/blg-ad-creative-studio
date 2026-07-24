import { notFound } from "next/navigation";
import { requireContext } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { StudioFeed } from "./StudioFeed";
import { BrandSwitcher } from "./BrandSwitcher";

export const maxDuration = 60;

export default async function StudioPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireContext();
  const supabase = await supabaseServer();

  const [{ data: brand }, { data: brands }] = await Promise.all([
    supabase.from("brands").select("id, name").eq("id", id).maybeSingle(),
    supabase.from("brands").select("id, name").order("name"),
  ]);
  if (!brand) notFound();

  return (
    <div className="fixed inset-0 top-14 bg-neutral-100 dark:bg-neutral-950">
      {/* Pill top bar */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2">
        <BrandSwitcher brands={brands ?? []} current={brand.id} />
        <div className="rounded-full border border-neutral-200 dark:border-white/10 bg-white/70 dark:bg-white/5 backdrop-blur px-4 py-2 text-sm text-neutral-500">
          4:5 · Feed
        </div>
      </div>
      <div className="h-full pt-16">
        <StudioFeed brandId={brand.id} brandName={brand.name} />
      </div>
    </div>
  );
}
