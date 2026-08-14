import Link from "next/link";
import { notFound } from "next/navigation";
import { requireContext } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";

export default async function BrandPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireContext();
  const supabase = await supabaseServer();

  const { data: brand } = await supabase
    .from("brands")
    .select("id, name, status, meta_ad_account_id")
    .eq("id", id)
    .maybeSingle();
  if (!brand) notFound();

  const steps = [
    { n: 1, title: "Setup", desc: "Brand profile + performance insights" },
    { n: 2, title: "Hooks", desc: "Generate & approve the hook library" },
    { n: 3, title: "Visuals", desc: "Generate photos + design the creatives" },
    { n: 4, title: "Approval", desc: "Manager review & sign-off" },
    { n: 5, title: "Export", desc: "ZIP of PNGs + copy.csv, shareable review link" },
  ];

  return (
    <div>
      <div className="mb-6">
        <Link href="/" className="text-sm text-text-dim hover:underline">
          ← Brands
        </Link>
        <h1 className="text-xl font-semibold mt-2">{brand.name}</h1>
        <p className="text-sm text-text-dim capitalize">{brand.status}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href={`/brands/${brand.id}/studio`}
            className="inline-block rounded-md bg-text text-canvas px-4 py-2 text-sm font-medium hover:opacity-90"
          >
            Open Image Studio →
          </Link>
          <Link
            href={`/brands/${brand.id}/settings`}
            className="inline-block rounded-md border border-line px-4 py-2 text-sm font-medium hover:bg-raised"
          >
            Brand profile
          </Link>
        </div>
      </div>

      <div className="rounded-lg border border-line p-6">
        <h2 className="font-medium mb-4">Creative workflow</h2>
        <ol className="space-y-3">
          {steps.map((s) => (
            <li key={s.n} className="flex items-start gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-raised text-xs font-semibold">
                {s.n}
              </span>
              <div>
                <div className="text-sm font-medium">{s.title}</div>
                <div className="text-xs text-text-dim">{s.desc}</div>
              </div>
            </li>
          ))}
        </ol>
        <p className="mt-6 text-sm text-text-dim">
          The full step-by-step workflow is being built next. For now, try{" "}
          <Link href={`/brands/${brand.id}/studio`} className="underline">
            Image Studio
          </Link>{" "}
          to generate images from a prompt.
        </p>
      </div>
    </div>
  );
}
