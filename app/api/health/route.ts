import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Setup diagnostics. Never returns secret values — only presence + connection
 * status. Public so it works even when auth/session is misconfigured.
 */
export async function GET() {
  const report: Record<string, unknown> = {
    // Bump on deploys we need to confirm are live.
    version: "2026-07-24-decode-once-jpeg-pipeline",
  };

  const required = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SECRETS_MASTER_KEY",
  ];
  const env: Record<string, string> = {};
  for (const k of required) env[k] = process.env[k] ? "set" : "MISSING";
  report.env = env;

  // Verify the service-role key is really a service key (admin API needs it).
  try {
    const { supabaseAdmin } = await import("@/lib/supabase/admin");
    const admin = supabaseAdmin();
    const { error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1 });
    report.serviceRoleKey = error
      ? `INVALID — ${error.message} (is SUPABASE_SERVICE_ROLE_KEY the "Secret" key, not the "Publishable" one?)`
      : "OK";
  } catch (e) {
    report.serviceRoleKey = `ERROR — ${e instanceof Error ? e.message : String(e)}`;
  }

  return NextResponse.json(report, { status: 200 });
}
