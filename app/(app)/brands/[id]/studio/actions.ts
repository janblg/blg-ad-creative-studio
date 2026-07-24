"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireContext } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";

export async function saveStyle(formData: FormData) {
  const brandId = String(formData.get("brand_id") ?? "");
  const style = String(formData.get("image_prompt_style") ?? "");
  await requireContext();
  const supabase = await supabaseServer();
  await supabase
    .from("brand_profiles")
    .update({ image_prompt_style: style })
    .eq("brand_id", brandId);
  revalidatePath(`/brands/${brandId}/studio`);
  redirect(`/brands/${brandId}/studio?saved=1`);
}
