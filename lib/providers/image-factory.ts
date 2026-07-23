import "server-only";
import { getSecret, requireSecret } from "@/lib/secrets";
import {
  createOpenAIProvider,
  createSoulProvider,
  type ImageProvider,
  type ProviderName,
} from "./image";

/** Build a provider for an org, reading keys from the encrypted secrets store. */
export async function getImageProvider(
  orgId: string,
  name: ProviderName = "higgsfield_soul",
): Promise<ImageProvider> {
  if (name === "openai") {
    return createOpenAIProvider(await requireSecret(orgId, "openai_api_key"));
  }
  const apiKey = await requireSecret(orgId, "image_gateway_api_key");
  const baseUrl =
    (await getSecret(orgId, "image_gateway_base_url")) ??
    "https://api.wavespeed.ai/api/v3";
  return createSoulProvider(apiKey, baseUrl);
}
