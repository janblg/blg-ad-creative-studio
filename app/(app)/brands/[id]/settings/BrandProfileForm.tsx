"use client";
import { useActionState, useRef, useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { saveProfile, removeFont, removeLogo, type SaveResult } from "./actions";

type ColorRole = "primary" | "secondary" | "hook_accent" | "hook_text" | "palette";

interface ColorRow {
  name: string;
  hex: string;
  role: ColorRole;
}

const ROLE_LABELS: Record<ColorRole, string> = {
  primary: "Primary",
  secondary: "Secondary",
  hook_accent: "Hook accent",
  hook_text: "Hook text",
  palette: "Palette only",
};

const ROLE_HELP: Record<ColorRole, string> = {
  primary: "The brand's main color. Influences the scene palette.",
  secondary: "Supporting brand color.",
  hook_accent: "Colors the emphasised words in the hook. Must read on a dark scrim.",
  hook_text: "The main hook text color — usually white.",
  palette: "Feeds the scene palette only; never used for text.",
};

/** WCAG relative luminance. */
function luminance(hex: string): number {
  const v = hex.replace("#", "");
  const ch = [0, 2, 4].map((i) => {
    const c = parseInt(v.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

/**
 * Contrast against the near-black scrim the renderer lays under hook text.
 * Jump N Bounce's primary blue (#01509B) scores ~2.6 here and is genuinely
 * hard to read; their red (#FF0000) scores ~5.3 and reads cleanly. So we warn
 * at setup time instead of letting it surface in a finished ad.
 */
function contrastOnScrim(hex: string): number {
  return (luminance(hex) + 0.05) / 0.05;
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

const field =
  "w-full rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm";
const label = "block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1";

export interface FontSlot {
  role: "headline" | "body";
  filename: string | null;
  weight: number | null;
}

export default function BrandProfileForm({
  brandId,
  brandName,
  profile,
  logoUrl,
  fonts,
}: {
  brandId: string;
  brandName: string;
  profile: {
    voiceTone: string;
    goals: string;
    location: string;
    targetAudience: string;
    imagePromptStyle: string;
    colors: ColorRow[];
  };
  logoUrl: string | null;
  fonts: FontSlot[];
}) {
  const [state, formAction, pending] = useActionState<SaveResult | null, FormData>(
    saveProfile,
    null,
  );
  const [colors, setColors] = useState<ColorRow[]>(
    profile.colors.length
      ? profile.colors
      : [
          { name: "Hook text", hex: "#FFFFFF", role: "hook_text" },
          { name: "Accent", hex: "#FFD23F", role: "hook_accent" },
        ],
  );

  const setRow = (i: number, patch: Partial<ColorRow>) =>
    setColors((c) => c.map((row, j) => (j === i ? { ...row, ...patch } : row)));

  // ---------- Website import ----------
  const router = useRouter();
  const [siteUrl, setSiteUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const runImport = async () => {
    if (!siteUrl.trim() || importing) return;
    setImporting(true);
    setImportMsg(null);
    try {
      const res = await fetch("/api/brand-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId, url: siteUrl.trim() }),
      });
      const j = await res.json();
      if (!res.ok) {
        setImportMsg({ ok: false, text: j.error ?? "Import failed." });
        return;
      }
      if (Array.isArray(j.colors) && j.colors.length) setColors(j.colors as ColorRow[]);
      setImportMsg({
        ok: true,
        text: `Found ${j.colors?.length ?? 0} colors${j.logo ? " and a logo" : " (no logo found)"} on ${j.title || j.url}. Review below, then Save.`,
      });
      // The logo is already stored server-side; refresh to show it.
      if (j.logo) router.refresh();
    } catch (e) {
      setImportMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* ---------- Import from website ---------- */}
      <section className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-5">
        <h2 className="font-medium mb-1">Import from website</h2>
        <p className="text-xs text-neutral-500 mb-4">
          Paste the client&apos;s website and we&apos;ll pull their logo and brand
          colors. Colors land in the palette below for you to check before saving.
        </p>
        <div className="flex gap-2">
          <input
            value={siteUrl}
            onChange={(e) => setSiteUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                runImport();
              }
            }}
            placeholder="jumpnbounce.com"
            className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm dark:bg-neutral-900 dark:border-neutral-700"
          />
          <button
            type="button"
            onClick={runImport}
            disabled={importing || !siteUrl.trim()}
            className="rounded-md bg-neutral-900 text-white px-4 py-2 text-sm font-medium hover:bg-neutral-800 disabled:opacity-40 dark:bg-white dark:text-neutral-900"
          >
            {importing ? "Reading site…" : "Import"}
          </button>
        </div>
        {importMsg && (
          <p
            className={`mt-3 rounded-md px-3 py-2 text-sm border ${
              importMsg.ok
                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                : "bg-red-50 text-red-700 border-red-200"
            }`}
          >
            {importMsg.text}
          </p>
        )}
      </section>

      <form action={formAction} className="space-y-8">
        <input type="hidden" name="brandId" value={brandId} />
        <input type="hidden" name="colors" value={JSON.stringify(colors)} />

        {/* ---------- Identity ---------- */}
        <section className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-5">
          <h2 className="font-medium mb-1">Brand</h2>
          <p className="text-xs text-neutral-500 mb-4">
            Feeds hook generation, the image prompt engine, and ad copy.
          </p>
          <div className="space-y-4">
            <div>
              <label className={label} htmlFor="brandName">Name</label>
              <input id="brandName" name="brandName" defaultValue={brandName} className={field} />
            </div>
            <div>
              <label className={label} htmlFor="voiceTone">Voice &amp; tone</label>
              <textarea
                id="voiceTone" name="voiceTone" rows={3} className={field}
                defaultValue={profile.voiceTone}
                placeholder="Warm, playful, family-first. Never corporate. Short punchy sentences."
              />
            </div>
            <div>
              <label className={label} htmlFor="targetAudience">Target audience</label>
              <textarea
                id="targetAudience" name="targetAudience" rows={2} className={field}
                defaultValue={profile.targetAudience}
                placeholder="Parents 30-45 planning kids' birthday parties, suburban, price-aware."
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={label} htmlFor="location">Location</label>
                <input
                  id="location" name="location" className={field}
                  defaultValue={profile.location}
                  placeholder="Miami-Dade & Broward County, FL"
                />
              </div>
              <div>
                <label className={label} htmlFor="goals">Goals</label>
                <input
                  id="goals" name="goals" className={field}
                  defaultValue={profile.goals}
                  placeholder="Weekend party bookings, May-September peak"
                />
              </div>
            </div>
            <div>
              <label className={label} htmlFor="imagePromptStyle">Visual style notes</label>
              <textarea
                id="imagePromptStyle" name="imagePromptStyle" rows={3} className={field}
                defaultValue={profile.imagePromptStyle}
                placeholder="Real backyard parties, not studio. Sunny, mid-afternoon. Kids mid-motion."
              />
              <p className="mt-1 text-xs text-neutral-500">
                Guides the scene. The hyperrealism rules always take precedence over style notes.
              </p>
            </div>
          </div>
        </section>

        {/* ---------- Palette ---------- */}
        <section className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-5">
          <div className="flex items-start justify-between gap-4 mb-1">
            <h2 className="font-medium">Palette</h2>
            <button
              type="button"
              onClick={() => setColors((c) => [...c, { name: "", hex: "#000000", role: "palette" }])}
              className="text-xs rounded-md border border-neutral-300 dark:border-neutral-700 px-2 py-1 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            >
              + Add color
            </button>
          </div>
          <p className="text-xs text-neutral-500 mb-4">
            Brand colors constrain the scene palette and set the hook text colors.
          </p>

          <div className="space-y-3">
            {colors.map((row, i) => {
              const valid = HEX_RE.test(row.hex);
              const ratio = valid ? contrastOnScrim(row.hex) : null;
              const lowContrast =
                valid && (row.role === "hook_accent" || row.role === "hook_text") && ratio! < 3;
              return (
                <div key={i} className="rounded-md border border-neutral-200 dark:border-neutral-800 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="color"
                      aria-label={`Color ${i + 1} swatch`}
                      value={valid ? row.hex : "#000000"}
                      onChange={(e) => setRow(i, { hex: e.target.value.toUpperCase() })}
                      className="h-9 w-12 shrink-0 cursor-pointer rounded border border-neutral-300 dark:border-neutral-700 bg-transparent"
                    />
                    <input
                      aria-label={`Color ${i + 1} hex`}
                      value={row.hex}
                      onChange={(e) => setRow(i, { hex: e.target.value.toUpperCase() })}
                      className={`w-28 font-mono ${field} ${valid ? "" : "border-red-500"}`}
                      placeholder="#01509B"
                    />
                    <input
                      aria-label={`Color ${i + 1} name`}
                      value={row.name}
                      onChange={(e) => setRow(i, { name: e.target.value })}
                      className={`flex-1 min-w-[8rem] ${field}`}
                      placeholder="JNB Blue"
                    />
                    <select
                      aria-label={`Color ${i + 1} role`}
                      value={row.role}
                      onChange={(e) => setRow(i, { role: e.target.value as ColorRole })}
                      className={`w-40 ${field}`}
                    >
                      {(Object.keys(ROLE_LABELS) as ColorRole[]).map((r) => (
                        <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setColors((c) => c.filter((_, j) => j !== i))}
                      className="shrink-0 rounded-md border border-neutral-300 dark:border-neutral-700 px-2 py-1.5 text-xs hover:bg-neutral-100 dark:hover:bg-neutral-800"
                      aria-label={`Remove color ${i + 1}`}
                    >
                      Remove
                    </button>
                  </div>
                  <p className="mt-2 text-xs text-neutral-500">{ROLE_HELP[row.role]}</p>
                  {!valid && (
                    <p className="mt-1 text-xs text-red-600">
                      Needs a 6-digit hex like #01509B.
                    </p>
                  )}
                  {lowContrast && (
                    <p className="mt-1 text-xs text-amber-600 dark:text-amber-500">
                      Low contrast on a dark scrim ({ratio!.toFixed(1)}:1). This will be hard to
                      read as hook text over a photo — a lighter or more saturated color reads better.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-neutral-900 text-white px-4 py-2 text-sm font-medium hover:bg-neutral-800 disabled:opacity-60 dark:bg-white dark:text-neutral-900"
          >
            {pending ? "Saving…" : "Save brand profile"}
          </button>
          {state?.ok && <span className="text-sm text-green-600">Saved.</span>}
          {state?.error && <span className="text-sm text-red-600">{state.error}</span>}
        </div>
      </form>

      {/* ---------- Assets (separate: binary must not cross a server action) ---------- */}
      <section className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-5">
        <h2 className="font-medium mb-1">Fonts</h2>
        <p className="text-xs text-neutral-500 mb-4">
          Rendered as real vector text, so the exact font ships. Needs a single fixed
          weight as <code className="font-mono">.ttf</code>, <code className="font-mono">.otf</code>{" "}
          or <code className="font-mono">.woff</code> — not <code className="font-mono">.woff2</code>,
          and not a variable font.
        </p>
        <div className="space-y-3">
          {fonts.map((f) => (
            <FontUpload key={f.role} brandId={brandId} slot={f} />
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-5">
        <h2 className="font-medium mb-1">Logo</h2>
        <p className="text-xs text-neutral-500 mb-4">
          Composited onto every creative. Transparent PNG works best — transparency is preserved.
        </p>
        <LogoUpload brandId={brandId} currentUrl={logoUrl} />
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------

function FontUpload({ brandId, slot }: { brandId: string; slot: FontSlot }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState<{ filename: string; weight: number } | null>(
    slot.filename ? { filename: slot.filename, weight: slot.weight ?? 400 } : null,
  );
  const [weight, setWeight] = useState(slot.weight ?? (slot.role === "headline" ? 400 : 400));
  const [, startTransition] = useTransition();

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("brandId", brandId);
      fd.set("kind", "font");
      fd.set("role", slot.role);
      fd.set("weight", String(weight));
      fd.set("file", file);
      const res = await fetch("/api/brand-assets", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Upload failed.");
        return;
      }
      setCurrent({ filename: json.filename, weight: json.weight });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const fallback = slot.role === "headline" ? "Anton" : "Barlow SemiBold";

  return (
    <div className="rounded-md border border-neutral-200 dark:border-neutral-800 p-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="w-20 text-sm font-medium capitalize">{slot.role}</span>
        <span className="text-xs text-neutral-500 flex-1 min-w-[10rem]">
          {current ? (
            <>
              <span className="font-mono">{current.filename}</span> · weight {current.weight}
            </>
          ) : (
            <>Using bundled fallback: {fallback}</>
          )}
        </span>
        <label className="text-xs text-neutral-600 dark:text-neutral-400">
          Weight{" "}
          <input
            type="number" min={100} max={900} step={100} value={weight}
            onChange={(e) => setWeight(Number(e.target.value))}
            className="w-20 rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1 text-sm"
          />
        </label>
        <input
          ref={inputRef}
          type="file"
          accept=".ttf,.otf,.woff,font/ttf,font/otf,font/woff"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
          }}
          disabled={busy}
          className="text-xs"
          aria-label={`Upload ${slot.role} font`}
        />
        {current && (
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              startTransition(async () => {
                const r = await removeFont(brandId, slot.role);
                if (r.error) setError(r.error);
                else setCurrent(null);
              })
            }
            className="rounded-md border border-neutral-300 dark:border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            Remove
          </button>
        )}
      </div>
      {busy && <p className="mt-2 text-xs text-neutral-500">Checking and uploading…</p>}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}

function LogoUpload({ brandId, currentUrl }: { brandId: string; currentUrl: string | null }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(currentUrl);
  const [meta, setMeta] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("brandId", brandId);
      fd.set("kind", "logo");
      fd.set("file", file);
      const res = await fetch("/api/brand-assets", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Upload failed.");
        return;
      }
      setUrl(json.url ?? null);
      setMeta(
        `${json.width}×${json.height}${json.hasAlpha ? " · transparent" : " · no transparency"}`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="flex h-20 w-32 items-center justify-center rounded-md border border-neutral-200 dark:border-neutral-800 bg-[repeating-conic-gradient(#e5e5e5_0_25%,transparent_0_50%)] bg-[length:16px_16px]">
        {url ? (
          <Image
            src={url}
            alt="Brand logo"
            width={128}
            height={80}
            unoptimized
            className="max-h-20 w-auto object-contain"
          />
        ) : (
          <span className="text-xs text-neutral-500">No logo</span>
        )}
      </div>
      <div className="space-y-1">
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
          }}
          disabled={busy}
          className="text-xs"
          aria-label="Upload brand logo"
        />
        {meta && <p className="text-xs text-neutral-500">{meta}</p>}
        {busy && <p className="text-xs text-neutral-500">Uploading…</p>}
        {error && <p className="text-xs text-red-600">{error}</p>}
        {url && !busy && (
          <button
            type="button"
            onClick={() =>
              startTransition(async () => {
                const r = await removeLogo(brandId);
                if (r.error) setError(r.error);
                else {
                  setUrl(null);
                  setMeta(null);
                }
              })
            }
            className="rounded-md border border-neutral-300 dark:border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            Remove logo
          </button>
        )}
      </div>
    </div>
  );
}
