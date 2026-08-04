import { NextResponse } from "next/server";
import { requireContext, isRedirectError } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Authenticated workspace diagnostic. Returns only the caller's own identity
 * graph — never secrets, never other users' data.
 *
 * Exists because `requireContext()` resolves exactly ONE org, while every RLS
 * policy matches ANY org the user belongs to. When those disagree, pages that
 * filter by the resolved orgId 404 while RLS-scoped pages keep working — which
 * is confusing to debug blind. `membershipCount > 1` is the tell.
 */
export async function GET() {
  try {
    const { user, orgId, role } = await requireContext();
    const admin = supabaseAdmin();

    const { data: memberships } = await admin
      .from("memberships")
      .select("org_id, role, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });

    const orgIds = (memberships ?? []).map((m) => m.org_id as string);

    const { data: brands } = await admin
      .from("brands")
      .select("id, name, org_id")
      .in("org_id", orgIds.length ? orgIds : ["00000000-0000-0000-0000-000000000000"]);

    return NextResponse.json({
      email: user.email,
      resolvedOrgId: orgId,
      resolvedRole: role,
      membershipCount: memberships?.length ?? 0,
      memberships: (memberships ?? []).map((m) => ({
        orgId: m.org_id,
        role: m.role,
        createdAt: m.created_at,
        isResolved: m.org_id === orgId,
        brandCount: (brands ?? []).filter((b) => b.org_id === m.org_id).length,
      })),
      brands: (brands ?? []).map((b) => ({
        id: b.id,
        name: b.name,
        orgId: b.org_id,
        inResolvedOrg: b.org_id === orgId,
      })),
      warning:
        (memberships?.length ?? 0) > 1
          ? "More than one membership. Brands outside the resolved org will 404 on org-filtered pages."
          : null,
    });
  } catch (e) {
    if (isRedirectError(e)) {
      return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
