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
          <p className="text-sm text-neutral-500">
            Pick a brand to start a creative batch, or add a new one.
          </p>
        </div>
      </div>

      {error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 border border-red-200">
          {error}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(brands ?? []).map((b) => (
          <Link
            key={b.id}
            href={`/brands/${b.id}`}
            className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-4 hover:border-neutral-400 transition-colors"
          >
            <div className="font-medium">{b.name}</div>
            <div className="text-xs text-neutral-500 mt-1 capitalize">{b.status}</div>
          </Link>
        ))}

        {/* New brand card */}
        <form
          action={createBrand}
          className="rounded-lg border border-dashed border-neutral-300 dark:border-neutral-700 p-4 flex flex-col gap-2"
        >
          <label className="text-sm font-medium" htmlFor="name">
            Add a brand
          </label>
          <input
            id="name"
            name="name"
            placeholder="e.g. Chattanooga Inflatables"
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm dark:bg-neutral-900 dark:border-neutral-700"
          />
          <button className="rounded-md bg-neutral-900 text-white py-2 text-sm font-medium hover:bg-neutral-800 dark:bg-white dark:text-neutral-900">
            Create brand
          </button>
        </form>
      </div>

      {(brands ?? []).length === 0 && (
        <p className="mt-6 text-sm text-neutral-500">
          No brands yet. Add your first one above to get started.
        </p>
      )}
    </div>
  );
}
