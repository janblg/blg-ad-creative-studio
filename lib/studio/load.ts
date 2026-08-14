import "server-only";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { AdCopy, GeneratedHook } from "@/lib/ai/creative";

/**
 * Reads a persisted Studio session back out of the workflow tables so the feed
 * can be reconstructed after a refresh (Phase 3).
 *
 * Domain reads go through `supabaseServer()` so RLS authorizes them; only
 * storage-URL signing uses the admin client, and only for paths those
 * RLS-authorized rows pointed at.
 */

const BUCKET = "assets";

export interface BatchSummary {
  id: string;
  name: string;
  status: string;
  currentStep: number;
  createdAt: string;
  hookCount: number;
}

export type RestoredHook = GeneratedHook & { id: string };

export interface RestoredBatch {
  id: string;
  brief: string;
  category?: string;
  productName?: string;
  visualSystem: string;
  masterPrompt: string;
  masterPromptApproved: boolean;
  refUrls: string[];
  imageUrl?: string;
  hooks: RestoredHook[];
  selectedHookText?: string;
  creativeId?: string;
  overlayUrl?: string;
  copy?: AdCopy;
}

async function signAsset(assetId: string | null): Promise<string | undefined> {
  if (!assetId) return undefined;
  const admin = supabaseAdmin();
  const { data: asset } = await admin
    .from("image_assets")
    .select("storage_path")
    .eq("id", assetId)
    .maybeSingle();
  if (!asset?.storage_path) return undefined;
  const { data } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(asset.storage_path, 3600);
  return data?.signedUrl;
}

export async function listBatches(brandId: string): Promise<BatchSummary[]> {
  const supabase = await supabaseServer();
  const { data } = await supabase
    .from("batches")
    .select("id, name, status, current_step, created_at, hooks(count)")
    .eq("brand_id", brandId)
    .order("created_at", { ascending: false })
    .limit(30);

  return (data ?? []).map((b) => ({
    id: b.id,
    name: b.name ?? "Untitled session",
    status: b.status,
    currentStep: b.current_step,
    createdAt: b.created_at,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    hookCount: (b.hooks as any)?.[0]?.count ?? 0,
  }));
}

export async function loadBatch(batchId: string): Promise<RestoredBatch | null> {
  const supabase = await supabaseServer();
  const { data: batchRows } = await supabase
    .from("batches")
    .select(
      "id, brief, visual_system, master_prompt, master_prompt_approved, base_image_asset_id, ref_asset_ids, category, product_id",
    )
    .eq("id", batchId)
    .limit(1);
  const batch = batchRows?.[0];
  if (!batch) return null;

  const { data: hookRows } = await supabase
    .from("hooks")
    .select("id, text, edited_text, framework, origin, status, emphasis, visual, why, negative, order_index")
    .eq("batch_id", batchId)
    .order("order_index", { ascending: true });

  const hooks: RestoredHook[] = (hookRows ?? []).map((h) => ({
    id: h.id,
    text: h.edited_text ?? h.text,
    framework: h.framework ?? "",
    origin: (h.origin ?? "experiment") as GeneratedHook["origin"],
    negative: !!h.negative,
    emphasis: h.emphasis ?? "",
    visual: h.visual ?? "",
    why: h.why ?? "",
  }));

  // Most recent creative in this batch carries the finished overlay + copy.
  const { data: creativeRows } = await supabase
    .from("creatives")
    .select("id, hook_id, selected_variant_id, copy_id, created_at")
    .eq("batch_id", batchId)
    .order("created_at", { ascending: false })
    .limit(1);
  const creative = creativeRows?.[0];

  let overlayUrl: string | undefined;
  let copy: AdCopy | undefined;
  let selectedHookText: string | undefined;

  if (creative) {
    selectedHookText = hooks.find((h) => h.id === creative.hook_id)?.text;

    if (creative.selected_variant_id) {
      const { data: variant } = await supabase
        .from("image_variants")
        .select("composited_asset_id")
        .eq("id", creative.selected_variant_id)
        .maybeSingle();
      overlayUrl = await signAsset(variant?.composited_asset_id ?? null);
    }
    if (creative.copy_id) {
      const { data: copyRow } = await supabase
        .from("ad_copy")
        .select("primary_text, headline, cta")
        .eq("id", creative.copy_id)
        .maybeSingle();
      if (copyRow) {
        copy = {
          primaryText: copyRow.primary_text ?? "",
          headline: copyRow.headline ?? "",
          cta: copyRow.cta ?? "",
        };
      }
    }
  }

  const refUrls: string[] = [];
  for (const id of batch.ref_asset_ids ?? []) {
    const u = await signAsset(id);
    if (u) refUrls.push(u);
  }

  let productName: string | undefined;
  if (batch.product_id) {
    const { data } = await supabase
      .from("products")
      .select("name")
      .eq("id", batch.product_id)
      .limit(1);
    productName = (data?.[0]?.name as string | undefined) ?? undefined;
  }

  return {
    id: batch.id,
    brief: batch.brief ?? "",
    category: batch.category ?? undefined,
    productName,
    visualSystem: batch.visual_system ?? "",
    masterPrompt: batch.master_prompt ?? "",
    masterPromptApproved: !!batch.master_prompt_approved,
    refUrls,
    imageUrl: await signAsset(batch.base_image_asset_id),
    hooks,
    selectedHookText,
    creativeId: creative?.id,
    overlayUrl,
    copy,
  };
}

/** Distinct product categories that actually have active products. */
export async function listProductCategories(brandId: string): Promise<string[]> {
  const supabase = await supabaseServer();
  const { data } = await supabase
    .from("products")
    .select("category")
    .eq("brand_id", brandId)
    .eq("status", "active")
    .not("category", "is", null)
    .limit(2000);

  const seen = new Map<string, number>();
  for (const row of data ?? []) {
    const c = (row.category as string | null)?.trim();
    if (c) seen.set(c, (seen.get(c) ?? 0) + 1);
  }
  return [...seen.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([c]) => c);
}
