/**
 * Website brand import — pulls colors and a logo off a client's public site so
 * a brand profile can be filled in seconds instead of by hand.
 *
 * Everything here is best-effort and defensive: a marketing site is arbitrary
 * third-party HTML. Nothing throws on a missing piece; callers get whatever
 * was found and the operator confirms it before it is saved.
 *
 * Deliberately NOT marked "server-only": it holds no secrets, and keeping it
 * importable lets scripts/ exercise the extractors against real sites.
 */

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const PAGE_MAX = 3_000_000;
const CSS_MAX = 1_000_000;
const IMG_MAX = 6_000_000;

export function normalizeUrl(input: string): string {
  const t = input.trim();
  if (!t) throw new Error("Enter a website address.");
  const withProto = /^https?:\/\//i.test(t) ? t : `https://${t}`;
  const u = new URL(withProto); // throws on garbage — caller reports it
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new Error("Only http(s) addresses are supported.");
  }
  return u.toString();
}

async function fetchText(url: string, cap: number, timeoutMs = 15000): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html,text/css,*/*" },
      signal: ctrl.signal,
      redirect: "follow",
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const text = await res.text();
    return text.slice(0, cap);
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchImage(
  url: string,
): Promise<{ buffer: Buffer; contentType: string } | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "image/*" },
      signal: ctrl.signal,
      redirect: "follow",
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > IMG_MAX) return null;
    return { buffer: buf, contentType: res.headers.get("content-type") ?? "" };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchPage(url: string): Promise<string> {
  return fetchText(url, PAGE_MAX);
}

const abs = (href: string, base: string): string | null => {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
};

/** Stylesheet URLs referenced by the page, most-promising first. */
export function stylesheetUrls(html: string, base: string, limit = 4): string[] {
  const out: string[] = [];
  const re = /<link\b[^>]*>/gi;
  for (const tag of html.match(re) ?? []) {
    if (!/rel\s*=\s*["']?[^"'>]*stylesheet/i.test(tag)) continue;
    const href = tag.match(/href\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!href) continue;
    const u = abs(href, base);
    if (u && !out.includes(u)) out.push(u);
  }
  return out.slice(0, limit);
}

export async function fetchStylesheets(urls: string[]): Promise<string> {
  const parts = await Promise.all(
    urls.map((u) => fetchText(u, CSS_MAX).catch(() => "")),
  );
  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// Colors
// ---------------------------------------------------------------------------

function toHex(r: number, g: number, b: number): string {
  const c = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`.toUpperCase();
}

/** Grey/near-white/near-black are chrome, not brand identity. */
function isInterestingColor(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max > 240 && min > 240) return false; // white-ish
  if (max < 28) return false; // black-ish
  if (max - min < 20) return false; // grey
  return true;
}

/**
 * Bootstrap/Tailwind default theme colors. Sites built on a framework ship
 * these whether or not the brand uses them, and they often out-rank the real
 * brand colors by raw frequency — so they are FLAGGED rather than dropped
 * (a brand may genuinely use one) and the palette step is told to discount them.
 */
const FRAMEWORK_DEFAULTS = new Set([
  // Bootstrap 5
  "#0D6EFD", "#0A58CA", "#6C757D", "#198754", "#157347", "#DC3545", "#BB2D3B",
  "#FFC107", "#FFCA2C", "#0DCAF0", "#31D2F2", "#6610F2", "#6F42C1", "#D63384",
  "#FD7E14", "#20C997", "#F8F9FA", "#212529", "#495057", "#ADB5BD",
  // Tailwind common
  "#3B82F6", "#2563EB", "#EF4444", "#10B981", "#F59E0B", "#8B5CF6", "#6366F1",
]);

export interface ColorCandidate {
  hex: string;
  count: number;
  /** True when this is a known framework default rather than brand identity. */
  frameworkDefault: boolean;
}

/** Rank hex/rgb colors by how often the site's own CSS uses them. */
export function extractColors(text: string, limit = 14): ColorCandidate[] {
  const counts = new Map<string, number>();
  const bump = (hex: string) => counts.set(hex, (counts.get(hex) ?? 0) + 1);

  for (const m of text.matchAll(/#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/g)) {
    const raw = m[1];
    const full =
      raw.length === 3
        ? raw.split("").map((c) => c + c).join("")
        : raw;
    bump(`#${full.toUpperCase()}`);
  }
  for (const m of text.matchAll(
    /rgba?\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})/gi,
  )) {
    bump(toHex(Number(m[1]), Number(m[2]), Number(m[3])));
  }

  return [...counts.entries()]
    .filter(([hex]) => isInterestingColor(hex))
    .map(([hex, count]) => ({
      hex,
      count,
      frameworkDefault: FRAMEWORK_DEFAULTS.has(hex),
    }))
    // Real brand colors first, then by usage.
    .sort((a, b) =>
      a.frameworkDefault === b.frameworkDefault
        ? b.count - a.count
        : a.frameworkDefault
          ? 1
          : -1,
    )
    .slice(0, limit);
}

// ---------------------------------------------------------------------------
// Logo
// ---------------------------------------------------------------------------

const metaContent = (html: string, prop: string): string | undefined => {
  const re = new RegExp(
    `<meta\\b[^>]*(?:property|name)\\s*=\\s*["']${prop}["'][^>]*>`,
    "i",
  );
  const tag = html.match(re)?.[0];
  return tag?.match(/content\s*=\s*["']([^"']+)["']/i)?.[1];
};

/** Logo URLs, best guess first. */
export function extractLogoCandidates(html: string, base: string): string[] {
  const out: string[] = [];
  const add = (href?: string | null) => {
    if (!href) return;
    const u = abs(href, base);
    // SVG/ICO frequently fail to rasterize; keep them last-resort only.
    if (u && !out.includes(u)) out.push(u);
  };

  // 1. <img> whose src/alt/class/id mentions "logo" — usually the real mark.
  for (const tag of html.match(/<img\b[^>]*>/gi) ?? []) {
    if (!/logo|brand-mark|site-logo/i.test(tag)) continue;
    add(tag.match(/\bsrc\s*=\s*["']([^"']+)["']/i)?.[1]);
  }
  // 2. Social preview images.
  add(metaContent(html, "og:image"));
  add(metaContent(html, "twitter:image"));
  // 3. Touch icon / favicon.
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    if (!/rel\s*=\s*["']?[^"'>]*(apple-touch-icon|icon)/i.test(tag)) continue;
    add(tag.match(/href\s*=\s*["']([^"']+)["']/i)?.[1]);
  }

  // De-prioritise formats sharp often cannot decode.
  const rank = (u: string) => (/\.(ico|svg)(\?|$)/i.test(u) ? 1 : 0);
  return out.sort((a, b) => rank(a) - rank(b)).slice(0, 8);
}

export function extractTitle(html: string): string {
  const t = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "";
  return t.replace(/\s+/g, " ").trim().slice(0, 200);
}

/** Visible text, stripped — context for the palette decision. */
export function extractTextSnippet(html: string, max = 1200): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}
