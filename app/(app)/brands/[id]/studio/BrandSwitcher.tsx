"use client";
import { useRouter } from "next/navigation";

export function BrandSwitcher({
  brands,
  current,
}: {
  brands: { id: string; name: string }[];
  current: string;
}) {
  const router = useRouter();
  return (
    <label className="flex items-center gap-2 rounded-full border border-neutral-200 dark:border-white/10 bg-white/70 dark:bg-white/5 backdrop-blur px-4 py-2">
      <span className="text-[11px] uppercase tracking-widest text-neutral-400">
        Brand
      </span>
      <select
        value={current}
        onChange={(e) => router.push(`/brands/${e.target.value}/studio`)}
        className="bg-transparent text-sm font-medium outline-none cursor-pointer"
      >
        {brands.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
    </label>
  );
}
