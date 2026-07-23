import "server-only";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { User } from "@supabase/supabase-js";

export type Role = "specialist" | "manager" | "admin";

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

  const { data: membership } = await supabase
    .from("memberships")
    .select("org_id, role")
    .eq("user_id", user.id)
    .maybeSingle();

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

  // Guard against a race: re-check via service role.
  const { data: existing } = await admin
    .from("memberships")
    .select("org_id, role")
    .eq("user_id", user.id)
    .maybeSingle();
  if (existing) return { orgId: existing.org_id, role: existing.role as Role };

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
