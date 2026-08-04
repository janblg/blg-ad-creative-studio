import "server-only";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { User } from "@supabase/supabase-js";

export type Role = "specialist" | "manager" | "admin";

/**
 * True if this error is Next's internal `redirect()` control-flow throw.
 *
 * `requireContext()` calls `redirect("/login")`, which works in a page but in a
 * ROUTE HANDLER the throw gets caught by the handler's try/catch and surfaces as
 * a meaningless `500 {"error":"NEXT_REDIRECT"}`. API callers need a real 401 so
 * the client can say "sign in again" instead of showing a raw server error.
 */
export function isRedirectError(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    typeof (e as { digest?: unknown }).digest === "string" &&
    (e as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

export interface AppContext {
  user: User;
  orgId: string;
  role: Role;
}

/**
 * The single source of truth for "who is this and what workspace are they in".
 * Redirects to /login if not authenticated. Auto-creates a workspace for a
 * brand-new user (first sign-up becomes admin of a fresh org).
 */
export async function requireContext(): Promise<AppContext> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // NOT maybeSingle(): it errors when a user has more than one membership,
  // which used to return null and fall through to bootstrapWorkspace() —
  // minting a brand-new org on EVERY request. Ordering by created_at keeps the
  // user's original workspace stable across requests.
  const { data: memberships } = await supabase
    .from("memberships")
    .select("org_id, role, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1);

  const membership = memberships?.[0];
  if (membership) {
    return { user, orgId: membership.org_id, role: membership.role as Role };
  }
  const bootstrapped = await bootstrapWorkspace(user);
  return { user, orgId: bootstrapped.orgId, role: bootstrapped.role };
}

/** Create org + admin membership + profile for a first-time user. */
async function bootstrapWorkspace(
  user: User,
): Promise<{ orgId: string; role: Role }> {
  const admin = supabaseAdmin();

  // Guard against a race: re-check via service role. Same reason as above for
  // avoiding maybeSingle() — with 2+ rows it reports an error and returns null,
  // which would create yet another org instead of reusing the existing one.
  const { data: existing } = await admin
    .from("memberships")
    .select("org_id, role, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1);
  if (existing?.[0]) {
    return { orgId: existing[0].org_id, role: existing[0].role as Role };
  }

  const orgName =
    (user.email?.split("@")[0] ?? "My").replace(/[._-]/g, " ") + " workspace";

  const { data: org, error: orgErr } = await admin
    .from("orgs")
    .insert({ name: orgName })
    .select("id")
    .single();
  if (orgErr || !org) throw new Error(`Could not create workspace: ${orgErr?.message}`);

  await admin.from("profiles").upsert({
    id: user.id,
    full_name: (user.user_metadata?.full_name as string) ?? user.email,
  });

  const { error: memErr } = await admin.from("memberships").insert({
    user_id: user.id,
    org_id: org.id,
    role: "admin",
  });
  if (memErr) throw new Error(`Could not create membership: ${memErr.message}`);

  return { orgId: org.id, role: "admin" };
}
