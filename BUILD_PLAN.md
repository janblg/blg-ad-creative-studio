# BUILD PLAN — v3 Overhaul, Decisions Locked

> ## ⏸ RESUME HERE — updated 2026-08-13
>
> **Read this file top to bottom first, then `HANDOFF.md` §7 gotchas.**
>
> **Done:** all decisions captured (§1). Phase 1 render stack verified green in production. **Phase 2a shipped** (`151dee0`): brand identity layer + editor at `/brands/[id]/settings`. **Phase 2b shipped** (`97cc2df`, health `2026-08-13-phase2b-brand-identity-live`): brand identity wired into generation — `paletteFromProfile`/`resolveBrandStyle`/`engineStyleDirective` live in `studio/actions.ts`, `hasLogo` + `logoSize` flow through, and **the crop to 4:5 now happens BEFORE the LayoutSpec pass** (vision gets a small JPEG of the final frame — gotcha #4). The three §7 render bugs are fixed in new `lib/render/fit.ts` + `overlay.ts`: same-anchor blocks stack as one column group; long headlines auto-fit (renderer-mirroring word-wrap estimation, conservative shrink, ~44px floor); scrim reach derived from stacked text height, raise-only. Verified visually via `scripts/test-render-fit.ts` (120px 15-word headline + same-anchor body + sizePct-30 scrim all corrected in one frame). **Phase 2c shipped** (`f1783ba`, health `2026-08-13-phase2c-hook-engine-live`): `HOOK_ENGINE.md` embedded base64 (`lib/hook-engine/hook-doc.ts`), loaded as the `generateHooks()` system prompt; §12 plain-text blocks parsed by `parseHookBlocks()`; §3/§6/§9 enforced mechanically by `validateHookSet()` (3–12 words, ≤80% negative, framework ≤2×, origin forced `experiment` while `meta_insights` is empty — never fabricate winners); hooks carry FRAMEWORK/EMPHASIS/VISUAL/WHY; **EMPHASIS routes into the LayoutSpec vision call** so the accent color lands on the nominated word; the feed lists hooks with framework chips + accent note, VISUAL/WHY on hover. Live-tested: 7 valid hooks, 7 distinct frameworks, 57% negativity; `max_tokens` 4500 (10 blocks truncated at 3000).
>
> **Phase 2d SHIPPED** (`f96ec08`, health `2026-08-13-phase2d-flyer-style`): flyer-style design live end-to-end. Renderer: `accent` font role (bundled Pacifico OFL) always present via `resolveBrandStyle`; per-block `rotateDeg` (±8 clamp); `highlight` treatment = brush-stroke bar (uneven hand-drawn border-radius + skewX(-4deg), padded, hugs ONE line); per-run `underline`/`underlineColor`; fit gains single-line pass for ≤5-word blocks (wider charW 0.7 caps / 0.62 script, highlight padding subtracted). **Critical fix: percentage `maxWidth` must live on the OUTERMOST wrapper** — a % on the inner text resolves against the content-sized wrapper and re-wraps at any font size (gotcha #20). Vision art director taught the flyer grammar (2-4 stacked same-anchor lines, alternate script/condensed voices, exactly one highlight bar, uniform small tilt, verbatim hook words, sub-line underlines). Live-verified: photo→vision→render produced a reference-grade ad; emphasis "WING" landed red on the blue bar.
>
> **Next action:** **Phase 3 — persistence** (batches/hooks/creatives/image_variants/ad_copy/feedback; batch list + resume; RLS rule below; gotcha #8; persist each hook's `VISUAL` line for the per-hook chains). THEN website import (decision #16: brand colors+logo pull, product library pull), THEN Phase 5 node board + whole-app dark design system.
>
> **Two items owed by Jan (unchanged):**
> 1. A **browser click-through** of the deployed app to the hook step, confirming the Claude-vision layout call and the real image download. The render stack itself needs no further testing.
> 2. **Fill in the Jump N Bounce brand profile** at `/brands/[id]/settings` so Phase 2b has real data. Fonts to upload are at `brand-assets/jump-n-bounce/fonts-ttf/` (Passion One 400 → headline, Rubik 400 → body); logo at `brand-assets/jump-n-bounce/original/assets/logo/`; palette in `original/brand.json`. Set `hook_accent` to **red `#FF0000`**, not the blue primary (§7).
>
> **Never give Jan curl or CLI commands** — he is not a coder. `/api/health`, `/api/render-selftest` are public, so call them yourself. `/api/whoami` needs his session.
>
> **⚠️ Architectural rule, learned the hard way (commit `b361caf`):** authorize brand access via **RLS** — `supabaseServer()` + `.eq("id", brandId)` — and take `org_id` from the returned brand row. **Never** filter by the single `orgId` from `requireContext()`. Every RLS policy uses `is_org_member(org_id)`, which matches *any* org the user belongs to, so the two disagree the moment a user has more than one membership. Also: **never use `.maybeSingle()` on a table that can legitimately hold multiple rows per user** — it errors rather than returning the first row, and that error read as "no membership" was minting a fresh org on every single request. `/api/whoami` now exposes this state; `membershipCount > 1` is the tell.
>
> **Open cleanup:** Jan's account probably accumulated junk empty orgs and membership rows from the bug above. Harmless but untidy — **ask before deleting anything.**


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
| 15 | Flyer-style creatives (2026-08-13) | **The reference-ad look is the quality bar.** Stacked mixed typography (script + condensed), per-line brand colors, slight rotation, brush-stroke highlights, run underlines. **Core scope first**; trust badges + decorative flourishes deliberately later. Builds BEFORE persistence. |
| 16 | Website import (2026-08-13) | **After persistence.** (a) Pull brand colors + logo from the brand's website into the profile; (b) pull PRODUCTS (name + photo) into a per-brand library so the Studio picks a product instead of requiring an upload. Upload stays as fallback. |
| 17 | Sessions | Confirmed: every session persisted and revisitable — this is exactly Phase 3. |

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
