import Link from "next/link";
import { notFound } from "next/navigation";
import { requireContext } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { loadBrandProfile } from "@/lib/brand/profile";
import BrandProfileForm, { type FontSlot } from "./BrandProfileForm";

export const dynamic = "force-dynamic";

export default async function BrandSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { orgId } = await requireContext();
  const admin = supabaseAdmin();

  const { data: brand } = await admin
    .from("brands")
    .select("id, name")
    .eq("id", id)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!brand) notFound();

  const profile = await loadBrandProfile(brand.id);

  // Signed preview URL for the current logo.
  let logoUrl: string | null = null;
  if (profile.logoAssetId) {
    const { data: asset } = await admin
      .from("image_assets")
      .select("storage_path")
      .eq("id", profile.logoAssetId)
      .maybeSingle();
    if (asset?.storage_path) {
      const signed = await admin.storage
        .from("assets")
        .createSignedUrl(asset.storage_path, 3600);
      logoUrl = signed.data?.signedUrl ?? null;
    }
  }

  const fonts: FontSlot[] = (["headline", "body"] as const).map((role) => {
    const f = profile.fonts.find((x) => x.role === role);
    return { role, filename: f?.filename ?? null, weight: f?.weight ?? null };
  });

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <Link
          href={`/brands/${brand.id}`}
          className="text-sm text-neutral-500 hover:underline"
        >
          ← {brand.name}
        </Link>
        <h1 className="text-xl font-semibold mt-2">Brand profile</h1>
        <p className="text-sm text-neutral-500">
          Everything here feeds generation: hooks, the image prompt, text layout, and copy.
        </p>
      </div>

      <BrandProfileForm
        brandId={brand.id}
        brandName={brand.name}
        profile={{
          voiceTone: profile.voiceTone,
          goals: profile.goals,
          location: profile.location,
          targetAudience: profile.targetAudience,
          imagePromptStyle: profile.imagePromptStyle,
          colors: profile.colors.map((c) => ({
            name: c.name ?? "",
            hex: c.hex,
            role: c.role,
          })),
        }}
        logoUrl={logoUrl}
        fonts={fonts}
      />
    </div>
  );
}
