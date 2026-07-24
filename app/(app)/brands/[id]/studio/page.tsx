import Link from "next/link";
import { notFound } from "next/navigation";
import { requireContext } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { StudioForm } from "./StudioForm";

export const maxDuration = 60;

export default async function StudioPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireContext();
  const supabase = await supabaseServer();

  const { data: brand } = await supabase
    .from("brands")
    .select("id, name")
    .eq("id", id)
    .maybeSingle();
  if (!brand) notFound();

  return (
    <div className="max-w-3xl">
      <Link href={`/brands/${id}`} className="text-sm text-neutral-500 hover:underline">
        ← {brand.name}
      </Link>
      <h1 className="text-xl font-semibold mt-2 mb-1">Image Studio</h1>
      <p className="text-sm text-neutral-500 mb-6">
        Describe what you need (optionally attach the real product). The
        Hyperrealism Prompt Engine turns it into a photographer&apos;s master
        prompt, then generates the image.
      </p>
      <StudioForm />
    </div>
  );
}
