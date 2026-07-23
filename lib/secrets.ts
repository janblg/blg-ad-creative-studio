import "server-only";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { env } from "@/lib/env";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Encrypted secret storage for provider API keys, managed from the in-app
 * Settings page. Values are encrypted with AES-256-GCM under a key derived
 * from SECRETS_MASTER_KEY (scrypt). Ciphertext is stored in the `secrets`
 * table (org-scoped, RLS-locked to service role only). Plaintext is never
 * returned to the client — the UI shows only a masked hint.
 */

export type SecretName =
  | "anthropic_api_key"
  | "image_gateway_api_key" // WaveSpeed/Segmind (Higgsfield Soul)
  | "image_gateway_base_url"
  | "openai_api_key" // alternate image provider
  | "google_service_account_json"
  | "meta_system_user_token"; // v1

// Local-dev fallback so providers can be exercised with a plain env var
// before Supabase/Settings are wired.
const ENV_FALLBACK: Partial<Record<SecretName, string>> = {
  anthropic_api_key: "ANTHROPIC_API_KEY",
  image_gateway_api_key: "IMAGE_GATEWAY_API_KEY",
  image_gateway_base_url: "IMAGE_GATEWAY_BASE_URL",
  openai_api_key: "OPENAI_API_KEY",
  google_service_account_json: "GOOGLE_SERVICE_ACCOUNT_JSON",
  meta_system_user_token: "META_SYSTEM_USER_TOKEN",
};

const ALG = "aes-256-gcm";

function key(): Buffer {
  // Fixed salt is acceptable here: the master key is the real secret, and a
  // fixed salt keeps derivation deterministic across instances.
  return scryptSync(env().SECRETS_MASTER_KEY, "blg-ad-studio-secrets-v1", 32);
}

function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALG, key(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

function decrypt(packed: string): string {
  const raw = Buffer.from(packed, "base64");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const enc = raw.subarray(28);
  const decipher = createDecipheriv(ALG, key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

export async function setSecret(
  orgId: string,
  name: SecretName,
  value: string,
): Promise<void> {
  const db = supabaseAdmin();
  const { error } = await db.from("secrets").upsert(
    {
      org_id: orgId,
      name,
      ciphertext: encrypt(value),
      hint: hintOf(value),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "org_id,name" },
  );
  if (error) throw new Error(`setSecret(${name}): ${error.message}`);
}

export async function getSecret(
  orgId: string,
  name: SecretName,
): Promise<string | null> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("secrets")
    .select("ciphertext")
    .eq("org_id", orgId)
    .eq("name", name)
    .maybeSingle();
  if (error) throw new Error(`getSecret(${name}): ${error.message}`);
  if (data?.ciphertext) return decrypt(data.ciphertext);
  const fallback = ENV_FALLBACK[name];
  return fallback ? (process.env[fallback] ?? null) : null;
}

/** Non-throwing helper for jobs: returns the secret or throws a clear message. */
export async function requireSecret(
  orgId: string,
  name: SecretName,
): Promise<string> {
  const v = await getSecret(orgId, name);
  if (!v) {
    throw new Error(
      `Missing "${name}" for this workspace. Add it in Settings → Integrations.`,
    );
  }
  return v;
}

/** Masked, safe-to-display hints for the Settings UI (never the real value). */
export async function listSecretHints(
  orgId: string,
): Promise<Record<string, string | null>> {
  const db = supabaseAdmin();
  const { data } = await db
    .from("secrets")
    .select("name, hint")
    .eq("org_id", orgId);
  const out: Record<string, string | null> = {};
  (data ?? []).forEach((r) => (out[r.name] = r.hint));
  return out;
}

function hintOf(value: string): string {
  const v = value.trim();
  if (v.length <= 8) return "•".repeat(v.length);
  return `${v.slice(0, 3)}…${v.slice(-4)}`;
}
