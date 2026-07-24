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
    { n: 5, title: "Export", desc: "Slides deck + downloadable assets" },
  ];

  return (
    <div>
      <div className="mb-6">
        <Link href="/" className="text-sm text-neutral-500 hover:underline">
          ← Brands
        </Link>
        <h1 className="text-xl font-semibold mt-2">{brand.name}</h1>
        <p className="text-sm text-neutral-500 capitalize">{brand.status}</p>
        <Link
          href={`/brands/${brand.id}/studio`}
          className="inline-block mt-3 rounded-md bg-neutral-900 text-white px-4 py-2 text-sm font-medium hover:bg-neutral-800 dark:bg-white dark:text-neutral-900"
        >
          Open Image Studio →
        </Link>
      </div>

      <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-6">
        <h2 className="font-medium mb-4">Creative workflow</h2>
        <ol className="space-y-3">
          {steps.map((s) => (
            <li key={s.n} className="flex items-start gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-neutral-200 dark:bg-neutral-800 text-xs font-semibold">
                {s.n}
              </span>
              <div>
                <div className="text-sm font-medium">{s.title}</div>
                <div className="text-xs text-neutral-500">{s.desc}</div>
              </div>
            </li>
          ))}
        </ol>
        <p className="mt-6 text-sm text-neutral-500">
          The interactive workflow is being built next. First, add your API keys
          in{" "}
          <Link href="/settings" className="underline">
            Settings
          </Link>{" "}
          so generation is ready to go.
        </p>
      </div>
    </div>
  );
}
