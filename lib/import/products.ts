/**
 * Product discovery on a rental company's website.
 *
 * Rental sites are wildly inconsistent, so this does the mechanical half only:
 * find plausible listing pages, and pull out every "card" that pairs an image
 * with a link and some text. Deciding which of those are actually rentable
 * products — and what they should be called — is left to the model, which
 * handles the variety far better than more regex would.
 *
 * Not "server-only" for the same reason as website.ts: scripts must be able to
 * exercise it against real sites.
 */

const PRODUCTish =
  /(rental|product|inflatable|bounce|bouncer|moonwalk|slide|combo|castle|jumper|obstacle|water|party|item|shop|category|catalog|equipment|tent|table|chair|concession|game)/i;

/** Junk that pairs with an image but is never a product. */
const NOT_PRODUCT =
  /(logo|icon|badge|sprite|banner|arrow|star|placeholder|avatar|favicon|payment|visa|mastercard|paypal|facebook|instagram|twitter|yelp|google|review|award|seal|cart|search|menu|spinner|loading|pixel|blank)/i;

export interface ProductCandidate {
  name: string;
  imageUrl: string;
  href?: string;
  priceText?: string;
}

const absolute = (href: string, base: string): string | null => {
  try {
    const u = new URL(href, base);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
};

const stripTags = (html: string) =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Same-origin pages that look like product listings, best guess first. */
export function findListingPages(html: string, base: string, limit = 6): string[] {
  const origin = new URL(base).origin;
  const scored = new Map<string, number>();

  for (const m of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const url = absolute(m[1], base);
    if (!url || !url.startsWith(origin)) continue;

    const path = new URL(url).pathname;
    if (path === "/" || /\.(jpg|jpeg|png|gif|pdf|zip|svg|webp)$/i.test(path)) continue;
    // Anything transactional or legal is not an inventory page.
    if (/(cart|checkout|login|account|privacy|terms|contact|blog|faq|about)/i.test(path)) continue;

    const label = stripTags(m[2]);
    let score = 0;
    if (PRODUCTish.test(path)) score += 3;
    if (PRODUCTish.test(label)) score += 2;
    // Shallow paths are usually category pages; deep ones single items.
    const depth = path.split("/").filter(Boolean).length;
    if (depth <= 2) score += 1;
    if (score <= 0) continue;

    const clean = url.split("#")[0];
    scored.set(clean, Math.max(scored.get(clean) ?? 0, score));
  }

  return [...scored.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([u]) => u);
}

/**
 * Every anchor that wraps an image — the near-universal product-card shape.
 * Deduped by image URL, with obvious non-products dropped.
 */
export function extractProductCandidates(
  html: string,
  base: string,
  limit = 60,
): ProductCandidate[] {
  const byImage = new Map<string, ProductCandidate>();

  for (const m of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const inner = m[2];
    const imgTag = inner.match(/<img\b[^>]*>/i)?.[0];
    if (!imgTag) continue;

    const rawSrc =
      imgTag.match(/\bdata-src\s*=\s*["']([^"']+)["']/i)?.[1] ??
      imgTag.match(/\bsrc\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!rawSrc || rawSrc.startsWith("data:")) continue;

    const imageUrl = absolute(rawSrc, base);
    if (!imageUrl || NOT_PRODUCT.test(imageUrl)) continue;

    const alt = imgTag.match(/\balt\s*=\s*["']([^"']*)["']/i)?.[1]?.trim() ?? "";
    const text = stripTags(inner);
    const name = (alt.length >= 3 ? alt : text).slice(0, 120).trim();
    if (!name || NOT_PRODUCT.test(name)) continue;

    const href = absolute(m[1], base) ?? undefined;
    const priceText = text.match(/\$\s?\d[\d,.]*/)?.[0];

    // First occurrence wins, but prefer a richer name if we see it again.
    const existing = byImage.get(imageUrl);
    if (!existing || (existing.name.length < name.length && name.length <= 120)) {
      byImage.set(imageUrl, { name, imageUrl, href, priceText });
    }
    if (byImage.size >= limit) break;
  }

  return [...byImage.values()];
}
