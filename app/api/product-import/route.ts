import { NextResponse } from "next/server";
import { requireContext, isRedirectError } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { fetchPage, normalizeUrl } from "@/lib/import/website";
import {
  detectPlatform,
  extractCategories,
  extractItems,
  type ImportedProduct,
} from "@/lib/import/ers";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * Import a brand's rental catalog into the product library.
 *
 * Targets the two platforms BLG's clients actually use: ERS (Event Rental
 * Systems, files.sysers.com) and IO (Inflatable Office). Categories come from
 * the homepage; products from each category page, each with its real photo URL
 * (kept as a URL rather than downloaded — a catalog runs to hundreds of items
 * and the file is only needed once a product is actually chosen for an ad).
 */

const MAX_CATEGORIES = 14;
const MAX_PER_CATEGORY = 60;
const MAX_TOTAL = 400;

export async function POST(req: Request) {
  try {
    await requireContext();
    const body = (await req.json()) as { brandId?: string; url?: string };
    const brandId = String(body.brandId ?? "").trim();
    if (!brandId) return NextResponse.json({ error: "Missing brandId." }, { status: 400 });

    let url: string;
    try {
      url = normalizeUrl(String(body.url ?? ""));
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Invalid address." },
        { status: 400 },
      );
    }

    // RLS authorizes; org_id comes from the row.
    const scoped = await supabaseServer();
    const { data: brandRows } = await scoped
      .from("brands")
      .select("id, org_id")
      .eq("id", brandId)
      .limit(1);
    const brand = brandRows?.[0];
    if (!brand) return NextResponse.json({ error: "Brand not found." }, { status: 404 });
    const orgId = brand.org_id as string;

    let home: string;
    try {
      home = await fetchPage(url);
    } catch (e) {
      return NextResponse.json(
        {
          error: `Couldn't open ${url} — ${e instanceof Error ? e.message : String(e)}.`,
        },
        { status: 400 },
      );
    }

    const platform = detectPlatform(home);
    const categories = extractCategories(home, url, platform).slice(0, MAX_CATEGORIES);

    if (!categories.length) {
      return NextResponse.json(
        {
          error:
            platform === "unknown"
              ? "That site isn't a recognised Event Rental Systems or Inflatable Office site, and no category pages were found. Products can still be added by hand."
              : "No category pages found on that site.",
          platform,
        },
        { status: 422 },
      );
    }

    // Dedupe by item URL — an item is usually listed in several categories.
    const byUrl = new Map<string, ImportedProduct>();
    const perCategory: { name: string; count: number }[] = [];

    for (const cat of categories) {
      if (byUrl.size >= MAX_TOTAL) break;
      let html: string;
      try {
        html = await fetchPage(cat.url);
      } catch {
        perCategory.push({ name: cat.name, count: 0 });
        continue;
      }
      const items = extractItems(html, cat.url, platform, cat.name).slice(
        0,
        MAX_PER_CATEGORY,
      );
      let added = 0;
      for (const item of items) {
        if (byUrl.has(item.url) || byUrl.size >= MAX_TOTAL) continue;
        byUrl.set(item.url, item);
        added++;
      }
      perCategory.push({ name: cat.name, count: added });
    }

    const products = [...byUrl.values()];
    if (!products.length) {
      return NextResponse.json(
        { error: "Category pages loaded but no products were listed on them.", platform },
        { status: 422 },
      );
    }

    // Upsert on (brand_id, source_url) so re-importing refreshes rather than
    // duplicating — matches the partial unique index in migration 0004.
    const admin = supabaseAdmin();
    const rows = products.map((p) => ({
      org_id: orgId,
      brand_id: brandId,
      name: p.name,
      category: p.category ?? null,
      source_url: p.url,
      price_text: p.priceText ?? null,
      image_url: p.imageUrl ?? null,
      status: "active",
    }));

    const { error } = await admin
      .from("products")
      .upsert(rows, { onConflict: "brand_id,source_url" });
    if (error) {
      return NextResponse.json(
        { error: `Could not save products: ${error.message}` },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      platform,
      url,
      categories: perCategory.filter((c) => c.count > 0),
      productCount: products.length,
      withImages: products.filter((p) => p.imageUrl).length,
    });
  } catch (e) {
    if (isRedirectError(e)) {
      return NextResponse.json(
        { error: "Your session expired. Reload the page and sign in again." },
        { status: 401 },
      );
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
