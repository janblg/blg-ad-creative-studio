import Link from "next/link";
import { requireContext } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { createBrand } from "./actions";

export default async function BrandsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  await requireContext();
  const supabase = await supabaseServer();
  const { data: brands } = await supabase
    .from("brands")
    .select("id, name, status, updated_at")
    .order("updated_at", { ascending: false });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold">Brands</h1>
          <p className="text-sm text-text-dim">
            Pick a brand to start a creative batch, or add a new one.
          </p>
        </div>
      </div>

      {error && (
        <p className="mb-4 rounded-md bg-bad/10 px-3 py-2 text-sm text-bad border border-bad/30">
          {error}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(brands ?? []).map((b) => (
          <Link
            key={b.id}
            href={`/brands/${b.id}`}
            className="rounded-lg border border-line p-4 hover:border-line-strong transition-colors"
          >
            <div className="font-medium">{b.name}</div>
            <div className="text-xs text-text-dim mt-1 capitalize">{b.status}</div>
          </Link>
        ))}

        {/* New brand card */}
        <form
          action={createBrand}
          className="rounded-lg border border-dashed border-line p-4 flex flex-col gap-2"
        >
          <label className="text-sm font-medium" htmlFor="name">
            Add a brand
          </label>
          <input
            id="name"
            name="name"
            placeholder="e.g. Chattanooga Inflatables"
            className="w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm"
          />
          <button className="rounded-md bg-text text-canvas py-2 text-sm font-medium hover:opacity-90">
            Create brand
          </button>
        </form>
      </div>

      {(brands ?? []).length === 0 && (
        <p className="mt-6 text-sm text-text-dim">
          No brands yet. Add your first one above to get started.
        </p>
      )}
    </div>
  );
}
