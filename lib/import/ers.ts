/**
 * Platform-aware product extraction for party-rental websites.
 *
 * BLG's clients run on two platforms: **ERS (Event Rental Systems)** — assets
 * served from files.sysers.com — and **IO (Inflatable Office)**.
 *
 * ERS structure, verified against live sites (orbitmoonwalks.com,
 * werentfun.com):
 *   /                      → links to /category/<slug>/
 *   /category/<slug>/      → links to /items/<slug>/   (server-rendered)
 *   /items/<slug>/         → <h1 class="item-title">Name</h1>, price as $N
 *
 * IMPORTANT, verified: ERS renders product PHOTOS via JavaScript — a category
 * page with 33 items carries only 7 images, all site chrome. So an import
 * yields names/categories/prices/URLs, and photos stay optional (uploaded per
 * product, or the creative is generated from the product name, which the
 * Hyperrealism engine handles well).
 *
 * Not "server-only" — scripts must be able to exercise this against real sites.
 */

export type RentalPlatform = "ers" | "io" | "unknown";

export interface ImportedCategory {
  name: string;
  url: string;
}

export interface ImportedProduct {
  name: string;
  url: string;
  category?: string;
  priceText?: string;
}

const absolute = (href: string, base: string): string | null => {
  try {
    const u = new URL(href, base);
    return u.protocol.startsWith("http") ? u.toString().split("#")[0] : null;
  } catch {
    return null;
  }
};

/** Turn a URL slug into a readable name: "16x25ft-paw-patrol" → "16x25ft Paw Patrol". */
export function nameFromSlug(slug: string): string {
  return decodeURIComponent(slug)
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function detectPlatform(html: string): RentalPlatform {
  if (/files\.sysers\.com|eventrentalsystems/i.test(html)) return "ers";
  if (/inflatableoffice|iocdn\.|\.io-media\./i.test(html)) return "io";
  return "unknown";
}

/** Call-to-action text that links to a product but never names it. */
const GENERIC_LABEL =
  /^(more info|book( now| it)?|view|details|see (more|details)|click here|order( now)?|rent( now| it)?|learn more|shop|add to cart|reserve)\b/i;

const CATEGORY_RE = {
  ers: /\/category\/[^/"'?#]+\/?/i,
  io: /\/(category|categories|rentals)\/[^/"'?#]+\/?/i,
} as const;

const ITEM_RE = {
  ers: /\/items\/[^"'?#]+\/?/i,
  io: /\/(item|items|product|products|rental)\/[^"'?#]+\/?/i,
} as const;

/** Anchors whose href matches `re`, paired with their visible text. */
function anchorsMatching(
  html: string,
  base: string,
  re: RegExp,
): { url: string; text: string }[] {
  const out = new Map<string, string>();
  for (const m of html.matchAll(
    /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
  )) {
    if (!re.test(m[1])) continue;
    const url = absolute(m[1], base);
    if (!url) continue;
    const text = m[2]
      .replace(/<[^>]+>/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&#39;|&apos;/g, "'")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    // Keep the richest label seen for a URL (thumbnails often link with none).
    if (!out.has(url) || text.length > (out.get(url) ?? "").length) {
      out.set(url, text);
    }
  }
  return [...out.entries()].map(([url, text]) => ({ url, text }));
}

export function extractCategories(
  html: string,
  base: string,
  platform: RentalPlatform,
): ImportedCategory[] {
  const re = platform === "io" ? CATEGORY_RE.io : CATEGORY_RE.ers;
  return anchorsMatching(html, base, re)
    .map(({ url, text }) => {
      const slug = new URL(url).pathname.replace(/\/$/, "").split("/").pop() ?? "";
      const name = text && text.length <= 60 ? text : nameFromSlug(slug);
      return { name, url };
    })
    .filter((c) => c.name.length > 1);
}

export function extractItems(
  html: string,
  base: string,
  platform: RentalPlatform,
  category?: string,
): ImportedProduct[] {
  const re = platform === "io" ? ITEM_RE.io : ITEM_RE.ers;
  return anchorsMatching(html, base, re).map(({ url, text }) => {
    const slug = new URL(url).pathname.replace(/\/$/, "").split("/").pop() ?? "";
    const fromSlug = nameFromSlug(slug);
    // The SLUG is the reliable name here: an item is linked several times per
    // card (thumbnail, title, button), and the "richest" anchor text is
    // usually the call-to-action ("More Info ...", "Click here to see our
    // generator rentals"), not the product. Anchor text is only a fallback.
    const usableText =
      text.length >= 3 &&
      text.length <= 70 &&
      !GENERIC_LABEL.test(text) &&
      !/\$/.test(text)
        ? text
        : undefined;
    return {
      name: fromSlug.length >= 3 ? fromSlug : (usableText ?? fromSlug),
      url,
      category,
      priceText: text.match(/\$\s?\d[\d,.]*/)?.[0],
    };
  });
}

/** ERS item pages carry the authoritative title. */
export function itemNameFromPage(html: string): string | undefined {
  const h1 = html.match(/<h1[^>]*class="[^"]*item-title[^"]*"[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
  const generic = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
  const raw = h1 ?? generic;
  if (!raw) return undefined;
  const text = raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return text.length >= 3 && text.length <= 120 ? text : undefined;
}
