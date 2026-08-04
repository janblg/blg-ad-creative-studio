# BUILD PLAN — v3 Overhaul, Decisions Locked

> ## ⏸ RESUME HERE — paused 2026-07-30 end of day
>
> **Read this file top to bottom first, then `HANDOFF.md` §7 gotchas. Nothing is committed yet** (`BUILD_PLAN.md`, `HOOK_ENGINE.md`, `scripts/test-brand-fonts.ts`, `brand-assets/` are all untracked — Jan has not asked for a commit).
>
> **Done today:** all 10 decisions captured (§1). `HOOK_ENGINE.md` written from Jan's video playbook, translated for static ads. Phase 1 render stack **verified green in production** — `/api/render-selftest` and `?full=1` both return `ALL RENDER STEPS PASSED ✓` at 1080×1350 on version `2026-07-30-resvg-init-idempotent`. Jump N Bounce assets received, validated, and font pipeline solved (§7).
>
> **Next action:** start **Phase 2a — brand profile editor** (§2). Jan approved starting it; he was asked whether to fix the three §7 render bugs first and the answer was to do the editor first, so the bug fixes have real brand data to verify against.
>
> **Still open, one item only:** Jan owes a single **browser click-through in the deployed app** — one brief run to the hook step — to confirm the Claude-vision layout call and the real image download. The render stack itself needs no further testing. Do NOT give Jan curl commands; he is not a coder and `/api/render-selftest` is public, so run it yourself.
>
> **Ready-to-use brand data for testing:** `brand-assets/jump-n-bounce/` — `fonts-ttf/` holds the satori-safe converted fonts (Passion One 400, Rubik 400/600), `original/brand.json` holds the palette, `render-proof/` holds the two accent comparisons. Default Jump N Bounce's `hookAccent` to **red `#FF0000`**, not the blue primary (§7).


**Date:** 2026-07-30
**Source:** interview with Jan, on top of `claude-code-prompt-v3-overhaul.md`, `HANDOFF.md`, `HYPERREALISM_PROMPT_ENGINE.md`
**Status of this file:** authoritative. Where this file and the v3 prompt disagree, **this file wins** (it records Jan's later decisions). `HANDOFF.md` §7 gotchas remain inviolable.

---

## 1. Decisions

| # | Question | Decision |
|---|---|---|
| 1 | Rebuild or continue? | **Continue in `~/Projects/blg-ad-creative-studio`.** Nothing proven gets rebuilt: prompt-engine wiring, binary-safe upload, gpt-image-1 `/edits` reference preservation, satori→resvg-wasm→sharp render engine, all 16 gotchas. |
| 2 | Reference screenshots — replicate what? | **Visual language + real knobs.** Pixel-close to the reference's node aesthetic, but the nodes are the BLG pipeline. Expose parameters that genuinely exist; no decorative seed/sampler/VAE rows. |
| 3 | Left chat column's job | **Fixed pipeline; chat drives and approves.** Brief + photos in, checkpoints and feedback through chat. Chat commands act on nodes, never rewire them. No agentic graph authoring. |
| 4 | Batch shape | **One chain per approved hook.** Each approved hook runs its own Prompt Engine pass → images → overlay → copy. 5 approved hooks = 5 finished ads. |
| 5 | Variants per hook | **`variantCount` is a per-batch setting on the Image node. Default 1.** Jan raises it to 3 only when testing alternatives for a hook. |
| 6 | Series consistency | **§15 anchor-first.** Hook 1's image is the batch anchor; remaining hooks fan out in parallel with the §15 consistency block appended. Lock the system, vary the moment. |
| 7 | Output sizes | **4:5 (1080×1350) hero, always.** 1:1 (1080×1080) and 9:16 (1080×1920) **on demand** — ticked per batch on the Image node or from Review. Each requested size gets its own generation (anchored) and its own LayoutSpec pass. No size is ever a degraded crop. |
| 8 | Brand identity | **Pulled forward, before the node board.** Brand profile → prompt engine bounded palette, LayoutSpec vision call, and overlay renderer. Kills the hardcoded palette, `hasLogo: false`, and bundled-fonts-only. |
| 9 | Insights / 60-40 rule | **No data yet.** Hooks come from frameworks + brand profile alone, all tagged `origin: experiment`. Insights intake + winner distillation get built but sit empty until Jan has exports. |
| 10 | Hook frameworks | ✅ **Received and written to `HOOK_ENGINE.md`.** Jan's source was a short-form **video** playbook; per his decision it was translated for static image ads with the original preserved verbatim as an annex. Loaded as the `generateHooks()` system prompt, plain-text block output parsed from headers (gotcha #5 — no forced tool JSON at that size). See §6 below for the cross-layer routing it revealed. |
| 11 | Users | **Full team including manager approval.** Specialists build, managers approve/comment, `changes_requested` routes a creative back to the right step. Phase 6 is real work, gated on `memberships.role`. |
| 12 | Theme scope | **Whole app goes dark**, one design system — login, brands list, brand settings, board, review. Retires the ORRISO light styling. |
| 13 | Export | **ZIP of PNGs + `copy.csv`** (`{brand}_{batch}_{hook-slug}_{size}.png`) **and a shareable read-only in-app review link** (Meta feed previews, no login). **Google Slides dropped** — no Google Cloud setup needed. Meta draft push stays deferred. |
| 14 | Build order | **Quality before UX.** See §2. |

### Consequences worth stating plainly

- **Inngest is now mandatory, not optional.** Decision #4 means 5 hooks × (engine + image + LayoutSpec vision + render). That cannot fit in the 60s `maxDuration` of an inline server action. Background jobs must land before the board can run a real batch.
- **`gpt-image-1` has no native 4:5.** It generates 1024×1024, 1024×1536, 1536×1024 only. 1080×1350 comes from generate-at-2:3-then-crop, and the crop must happen **before** the LayoutSpec pass so hook text is laid out on the final frame and never cropped into.
- **Custom fonts must load into satori from Supabase Storage at render time.** Anton/Barlow stay as fallback. Gotcha #7 still binds: no system fonts exist on Vercel.
- **Decision #12 (whole-app dark) is deliberately sequenced late** (Phase 5), so it lands with the board as one design pass instead of being done twice.

---

## 2. Build order

Revised from the v3 prompt per decision #14 — prove the creative output is client-ready *before* investing in the interface around it.

| Phase | Scope | Gate |
|---|---|---|
| **1** | **Confirm overlay in production.** `d0643b7` (idempotent `initWasm`, gotcha #15) is pushed but unverified. Use `/api/render-selftest` and `?full=1`. | ⚠️ *Blocked on Jan testing prod.* |
| **2** | **Brand setup + hook engine — quality proof.** Brand profile editor (voice/tone, goals, audience, location, hex colors, font upload, logo upload). Wire brand identity into the prompt engine's bounded palette, the LayoutSpec vision call, and the overlay renderer. Wire `HOOK_ENGINE.md` into `generateHooks()`. Build insights intake (empty). **All on the existing feed UI** — no new UX yet. | Jan judges whether the creatives are genuinely client-ready. |
| **3** | **Persistence.** Workflow writes to `batches`/`hooks`/`creatives`/`image_variants`/`ad_copy`/`feedback`. Org-scoped, multi-user, batch list, resume where left off. No nodes/edges tables — the board renders from batches. Watch gotcha #8 (RLS recursion). | Refresh-safe; reopening a brand restores the batch. |
| **4** | **Inngest background jobs.** Anchor-first then parallel fan-out per hook. Status via polling or Supabase Realtime on batch/variant rows. Inline path stays as a flagged fallback. | A 5-hook batch completes without timing out. |
| **5** | **Dark design system + node board.** React Flow, dark dotted canvas, tabbed workspaces, left chat column, node cards with labeled ports and colored bezier edges, inline parameter rows, Render node with variant footer. Node status: running / awaiting approval / approved / changes requested. Click a node → right drawer detail. Whole app restyled dark. Existing feed route stays until parity. | Jan critiques against the reference screenshots. |
| **6** | **Manager review + export.** Meta feed ad previews, role gating, comment threads, `changes_requested` routing. ZIP + `copy.csv`. Shareable read-only review link. | A manager approves a batch end to end. |
| **7** | **Preference memory.** Inngest job distils `feedback` → `preference_memory`; top-weighted memories injected into engine, hooks, and copy prompts. Visible "what the brand has learned" panel. | Quality visibly compounds batch over batch. |

**Every phase ends with a stop:** summarize changes, tell Jan how to test in the browser, bump the `/api/health` version string, remind him to hard-refresh (⌘⇧R), wait for confirmation.

---

## 3. Node graph (target shape, Phase 5)

Fixed spine, one chain per approved hook:

```
Brief ─┬─ Reference Photos
       │
       └─→ Prompt Engine ─→ Master Prompt (editable, approval gate)
                                  │
Hook Library (approval gate) ─────┤
                                  ▼
                          [per approved hook]
                    Image Gen ─→ Variants ─→ (select)
                    knobs: size · quality · variantCount · background
                                  │
                                  ▼
                      Layout Vision ─→ Overlay Render ─→ Copy ─→ Review
                      knobs: brand palette · font · logo placement
```

Anchor rule: hook 1's Image node produces the batch anchor; the rest carry the §15 consistency block.

---

## 4. Deferred — do not build, keep architecture open

- Higgsfield Soul and other providers (contract unverified, no key) — stay behind the existing `ImageProvider` abstraction
- Nano Banana / Gemini surgical repair pass (§14.5) — attractive later as an optional node for broken hands
- Meta Marketing API auto-pull (needs System User + app review)
- Google Slides export (dropped, not deferred)
- Freeform node wiring, video, direct-to-Meta push, Canva export

---

## 5. Blocking inputs from Jan

1. ~~`HOOK_ENGINE.md`~~ ✅ **Done** — written 2026-07-30, translated from Jan's video playbook, source preserved as annex.
2. **Overlay production test** (Phase 1) — does the hook-on-image step now render correctly on Vercel? Use `/api/render-selftest` and `?full=1`.
3. ~~Brand assets~~ ✅ **Received** — Jump N Bounce (`jump-n-bounce-brand-assets.zip`). See §7.

---

## 7. First real brand: Jump N Bounce — validated 2026-07-30

Assets received and tested against the render engine via `scripts/test-brand-fonts.ts`.

**Palette:** JNB Blue `#01509B` (primary), JNB Red `#FF0000` (secondary), body `#333333`, heading `#222222`.
**Type:** Passion One 400 (display) + Rubik 300/400/500/700 (body). Both SIL OFL 1.1, redistributable.
**Logos:** primary wordmark 640×142; transparent mark 1775×1714.

### What broke, and the required font pipeline

| Problem | Detail | Fix |
|---|---|---|
| **All 3 supplied fonts are `.woff2`** | Satori's README: *"WOFF2 is not supported at the moment"*. Throws `Unsupported OpenType signature wOF2`. This is not a one-off — woff2 is what Google Fonts serves browsers, so **any** brand-asset scrape will be woff2. | The font upload path must convert to TTF/OTF/WOFF, or reject woff2 with a clear message. Gotcha #18. |
| **Rubik is a variable font** | Does not merely pick the wrong weight — it **crashes** satori's `@shuding/opentype.js` in `parseFvarAxis`. | Instance to static weights first. Gotcha #19. |
| Google Fonts static dirs are gone | `ofl/<fam>/static/` 404s; the legacy CSS API with an old UA serves **EOT**, not TTF. | Instance the variable file. Single-weight display fonts (Passion One) still ship as static TTF in the repo. |

**Working recipe** (macOS python3.9 has no fonttools):

```bash
python3 -m venv venv && venv/bin/pip install fonttools brotli && venv/bin/fonttools varLib.instancer "Rubik[wght].ttf" wght=400 -o Rubik-400.ttf
```

### Render bugs found — fix in Phase 2b

1. **Same-anchor TextBlocks overlap instead of stacking.** A `bottom-left` headline and a `bottom-left` body line collide. Nothing stops the Claude-vision LayoutSpec emitting same-anchor blocks, so the renderer needs stacking or collision handling.
2. **Long headlines overflow `safeMarginPct`.** A 3-line 104px block anchored bottom-left descends past the safe area to the frame edge. Needs auto-fit — shrink the font or cap the line count.
3. **`scrim.sizePct` is not derived from text-block height**, so the first headline line can land on unscrimmed photo. Outline + shadow rescued it here, but by luck, not design.

### Brand-application finding

**#01509B has poor contrast on a dark scrim; #FF0000 reads far better as the hook accent.** So the brand editor must store an explicit **`hookAccent`** per brand rather than assuming `primary`, and should validate accent-versus-scrim contrast.

---

## 6. Cross-layer consequence of HOOK_ENGINE.md

Writing the hook engine surfaced something not in the v3 plan: **part of the hook playbook is image and layout instruction, not hook instruction.** It must feed three places, not one. See `HOOK_ENGINE.md` §8.

| Destination | What routes there | Implementation note |
|---|---|---|
| `generateHooks()` | §1A word rules, §2 Four Horsemen, §3 Curiosity Gap, the 9 surviving frameworks | New plain-text block contract: `TEXT / FRAMEWORK / ORIGIN / NEGATIVE / EMPHASIS / VISUAL / WHY`. Generates 10, not 5. Validate word count and the ≤80% negativity cap mechanically across the set. |
| **Prompt engine** (master prompt) | "Visual environment must match the topic"; face+eyes lift retention; uncluttered/bright/saturated; Transformation and Comparison as *composition* directives | Must be reconciled against Hyperrealism Law 2 and §11 — **the realism laws win**. "Bright and clean" means legible at thumbnail scale, NOT flat fill light or poreless skin. Negative space for the hook block must be stated **positively** for gpt-image-1 (§14.3): "the upper third is open sky, unbroken and unmarked". |
| **LayoutSpec vision call** | "Never overlay text on a subject or platform UI"; per-size Meta safe zones; the nominated emphasis word | 4:5 → clear the bottom strip. 9:16 → **top and bottom thirds are Meta chrome**, hook lives in the middle third. 1:1 → feed rules, tighter margins. The renderer already supports per-word coloring, so `EMPHASIS` drives the accent color. |

**Consequence for the pipeline:** the hook and the master prompt can no longer be generated independently. The hook's `VISUAL` line feeds the Prompt Engine pass for that hook's chain — which fits decision #4 (one chain per approved hook) exactly, since each hook already gets its own engine pass.

**Also excluded, deliberately:** Storytelling hooks (framework 9) are dropped — they are built on "I" and violate the playbook's own you-not-I rule in a paid-ads context. The narrative instinct belongs in the Meta **primary text**, not the on-image hook.
