"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireContext } from "@/lib/auth";
import { getSecret, setSecret, type SecretName } from "@/lib/secrets";

const FIELDS: SecretName[] = [
  "anthropic_api_key",
  "image_gateway_api_key",
  "image_gateway_base_url",
  "openai_api_key",
];

export async function saveIntegrations(formData: FormData) {
  const { orgId } = await requireContext();
  let saved = 0;
  for (const name of FIELDS) {
    const value = String(formData.get(name) ?? "").trim();
    if (value) {
      await setSecret(orgId, name, value);
      saved++;
    }
  }
  revalidatePath("/settings");
  redirect(`/settings?saved=${saved}`);
}

/** Validate the Anthropic key with a no-cost GET /v1/models. */
export async function testAnthropic() {
  const { orgId } = await requireContext();
  const key = await getSecret(orgId, "anthropic_api_key");
  if (!key) {
    redirect(`/settings?test=${encodeURIComponent("Anthropic: no key saved yet")}`);
  }

  let msg: string;
  try {
    const res = await fetch("https://api.anthropic.com/v1/models", {
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
    });
    msg = res.ok ? "Anthropic: connection OK ✓" : `Anthropic: failed (${res.status})`;
  } catch {
    msg = "Anthropic: network error";
  }
  redirect(`/settings?test=${encodeURIComponent(msg)}`);
}
