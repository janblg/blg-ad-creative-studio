import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

/**
 * Service-role Supabase client. BYPASSES Row-Level Security — use only in
 * trusted server code (secrets, Inngest jobs, admin operations). Never expose
 * to the browser and never key any user-facing query off this without an
 * explicit membership check.
 */
export function supabaseAdmin() {
  const e = env();
  return createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
