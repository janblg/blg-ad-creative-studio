"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireContext } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";

export async function createBrand(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) redirect("/?error=" + encodeURIComponent("Brand name is required."));

  const { orgId } = await requireContext();
  const supabase = await supabaseServer();

  const { data: brand, error } = await supabase
    .from("brands")
    .insert({ org_id: orgId, name })
    .select("id")
    .single();
  if (error || !brand) {
    redirect("/?error=" + encodeURIComponent(error?.message ?? "Could not create brand."));
  }
  await supabase.from("brand_profiles").insert({ brand_id: brand.id });

  revalidatePath("/");
  redirect(`/brands/${brand.id}`);
}
