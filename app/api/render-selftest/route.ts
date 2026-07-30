import { NextResponse } from "next/server";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import path from "node:path";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Render-stack self-test. Isolates every part of the overlay pipeline that can
 * fail on Vercel but works locally, WITHOUT needing an image generation, a
 * vision call, or storage. Open in a browser; read the JSON.
 *
 * Steps are independently try/caught so one failure never masks the rest.
 * Public (no requireContext) so it works regardless of session state, and it
 * exposes no secrets — only asset presence, sizes, and render byte counts.
 *
 * ?full=1  renders at the real 1080x1350 to test the memory hypothesis.
 */

type Step = { ok: boolean; detail: string };
const msg = (e: unknown) => (e instanceof Error ? `${e.name}: ${e.message}` : String(e));

function safe(fn: () => string): Step {
  try {
    return { ok: true, detail: fn() };
  } catch (e) {
    return { ok: false, detail: msg(e) };
  }
}
async function safeAsync(fn: () => Promise<string>): Promise<Step> {
  try {
    return { ok: true, detail: await fn() };
  } catch (e) {
    return { ok: false, detail: msg(e) };
  }
}

/** Assembled from segments so it is never a statically-analyzable specifier. */
const wasmPath = (cwd: string) =>
  path.join(cwd, "node_modules", "@resvg", "resvg-wasm", "index_bg.wasm");

export async function GET(req: Request) {
  const full = new URL(req.url).searchParams.get("full") === "1";
  const W = full ? 1080 : 400;
  const H = full ? 1350 : 500;

  const steps: Record<string, Step> = {};
  const cwd = process.cwd();

  // 0 — environment / what actually shipped in the bundle
  steps["0_env"] = safe(() => {
    const listing = existsSync(cwd) ? readdirSync(cwd).slice(0, 40).join(", ") : "cwd missing";
    return `node=${process.version} platform=${process.platform} cwd=${cwd} | entries: ${listing}`;
  });

  steps["1_fonts_dir"] = safe(() => {
    const dir = path.join(cwd, "fonts");
    if (!existsSync(dir)) throw new Error(`fonts dir NOT FOUND at ${dir}`);
    const files = readdirSync(dir).map((f) => `${f}(${statSync(path.join(dir, f)).size}b)`);
    return files.join(", ");
  });

  steps["2_fonts_load"] = await safeAsync(async () => {
    // Exercise the real loader used by the overlay renderer.
    const { defaultFonts } = await import("@/lib/render/fonts");
    return defaultFonts()
      .map((f) => `${f.role}:${(f.data as Buffer).length}b w=${f.weight}`)
      .join(", ");
  });

  steps["3_wasm_file"] = safe(() => {
    const p = wasmPath(cwd);
    if (!existsSync(p)) throw new Error(`wasm NOT FOUND at ${p}`);
    return `${p} (${statSync(p).size}b)`;
  });

  // What actually shipped inside the externalized package directory. Paths are
  // assembled at runtime from segments — never as a static literal, because a
  // statically-analyzable ".wasm" specifier makes Turbopack try to bundle it
  // (externalized packages only support .mjs/.cjs/.js/.json/.node) and the
  // build fails. Do not reintroduce require.resolve() on the .wasm path.
  steps["4_wasm_pkg_dir"] = safe(() => {
    const dir = path.join(cwd, "node_modules", "@resvg", "resvg-wasm");
    if (!existsSync(dir)) {
      const scope = path.join(cwd, "node_modules", "@resvg");
      const scopeInfo = existsSync(scope)
        ? `@resvg/ contains: ${readdirSync(scope).join(", ")}`
        : "@resvg/ scope dir MISSING entirely";
      throw new Error(`pkg dir NOT FOUND at ${dir} — ${scopeInfo}`);
    }
    return readdirSync(dir)
      .map((f) => `${f}(${statSync(path.join(dir, f)).size}b)`)
      .join(", ");
  });

  steps["5_wasm_init"] = await safeAsync(async () => {
    const { initWasm } = await import("@resvg/resvg-wasm");
    const buf = readFileSync(wasmPath(cwd));
    try {
      await initWasm(buf);
      return `initWasm ok (${buf.length}b)`;
    } catch (e) {
      // Already-initialized is a success for our purposes.
      if (/already/i.test(msg(e))) return `already initialized (${buf.length}b)`;
      throw e;
    }
  });

  steps["6_satori"] = await safeAsync(async () => {
    const satori = (await import("satori")).default;
    const { defaultFonts } = await import("@/lib/render/fonts");
    const fonts = defaultFonts().map((f) => ({
      name: f.role === "headline" ? "Headline" : "Body",
      data: f.data,
      weight: f.weight ?? 400,
      style: "normal" as const,
    }));
    const el = {
      type: "div",
      props: {
        style: { display: "flex", width: 200, height: 100, backgroundColor: "#000000" },
        children: {
          type: "div",
          props: {
            style: { fontFamily: "Headline", fontSize: 40, color: "#ffffff" },
            children: "TEST",
          },
        },
      },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svg = await satori(el as any, { width: 200, height: 100, fonts: fonts as any });
    const paths = (svg.match(/<path/g) ?? []).length;
    return `svg ${svg.length} chars, ${paths} vector path(s) — glyphs ${paths > 0 ? "vectorized ✓" : "MISSING (font not applied)"}`;
  });

  steps["7_resvg_raster"] = await safeAsync(async () => {
    const { Resvg } = await import("@resvg/resvg-wasm");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="60"><rect width="120" height="60" fill="#123456"/></svg>`;
    const png = Buffer.from(new Resvg(svg, { fitTo: { mode: "width", value: 120 } }).render().asPng());
    return `png ${png.length}b sig=${png.subarray(0, 4).toString("hex")}`;
  });

  // 8 — THE REAL CODE PATH: renderCreative() exactly as the overlay step calls it.
  steps["8_renderCreative"] = await safeAsync(async () => {
    const sharp = (await import("sharp")).default;
    const { renderCreative } = await import("@/lib/render/overlay");
    const { defaultFonts } = await import("@/lib/render/fonts");

    const background = await sharp({
      create: { width: W, height: H, channels: 3, background: "#3a6ea5" },
    })
      .png()
      .toBuffer();

    const png = await renderCreative({
      background,
      style: { fonts: defaultFonts() },
      layout: {
        canvas: { width: W, height: H },
        safeMarginPct: 6,
        scrim: { position: "bottom", color: "#000000", opacity: 0.75, sizePct: 55 },
        blocks: [
          {
            runs: [{ text: "SELF" }, { text: "TEST", color: "#FFD23F" }],
            anchor: "bottom-left",
            fontFamily: "headline",
            fontSizePx: full ? 96 : 44,
            color: "#FFFFFF",
            uppercase: true,
            align: "left",
            treatment: "outline",
            strokeColor: "#111111",
            strokeWidthPx: 2,
            shadow: true,
          },
        ],
      },
    });
    const meta = await sharp(png).metadata();
    if (!meta.width) throw new Error(`invalid output (${png.length}b)`);
    return `VALID ${meta.width}x${meta.height} ${meta.format} ${png.length}b`;
  });

  const failed = Object.entries(steps).filter(([, s]) => !s.ok).map(([k]) => k);

  return NextResponse.json(
    {
      version: "2026-07-30-render-selftest",
      canvas: `${W}x${H}${full ? " (full size)" : " (small — add ?full=1 for 1080x1350)"}`,
      verdict: failed.length === 0 ? "ALL RENDER STEPS PASSED ✓" : `FAILED AT: ${failed.join(", ")}`,
      steps,
    },
    { status: 200 },
  );
}
