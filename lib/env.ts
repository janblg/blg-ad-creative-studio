import "server-only";
import { z } from "zod";

/**
 * Server-side environment. These are the ONLY things set in Vercel's dashboard
 * (the one-time bootstrap). All provider API keys (Anthropic, image gateway,
 * Google) live encrypted in the DB and are managed from the in-app Settings
 * page — see lib/secrets.ts.
 */
const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  // Any passphrase; a 32-byte key is derived from it (scrypt). Keep it safe:
  // losing it makes stored provider keys unrecoverable.
  SECRETS_MASTER_KEY: z.string().min(16),
  // Optional and lenient: it's only used to build absolute redirect URLs, and
  // must never block the app if unset or slightly malformed.
  NEXT_PUBLIC_APP_URL: z.string().optional(),
});

export function appUrl(): string {
  return env().NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "http://localhost:3000";
}

let cached: z.infer<typeof schema> | null = null;

export function env(): z.infer<typeof schema> {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const missing = parsed.error.issues
      .map((i) => i.path.join("."))
      .join(", ");
    throw new Error(
      `Missing/invalid environment variables: ${missing}. ` +
        `Set them in Vercel (or .env.local for local dev) — see RUNBOOK.md.`,
    );
  }
  cached = parsed.data;
  return cached;
}
