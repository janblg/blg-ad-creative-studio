# BLG Ad Creative Studio — Project Handoff / Context Dump

**Purpose of this document:** bring a fresh Claude session fully up to speed on what has been built, what works, what's broken, and every hard-won technical gotcha — so an overhaul can be planned without re-learning the landmines.

**Date:** 2026-07-24
**Repo:** `~/Projects/blg-ad-creative-studio` (local) → `github.com/janblg/blg-ad-creative-studio` (private)
**Live:** `https://blg-ad-creative-studio.vercel.app`
**Owner/operator:** Jan Feterman, Digital Marketing Manager at BLG (agency; clients are mostly party-rental / bounce-house / inflatables businesses). **Jan is not a coder** — Claude writes all code; Jan operates the app and manages infra via web dashboards.

---

## 1. The product vision

Replace a slow manual Meta-ads creative process with a web app that runs the whole workflow, multi-brand, all AI-generated (static images now, video later).

**The manual process being replaced:**
1. Ads specialist audits current campaigns → what's working (double down) / what's not (kill).
2. Builds a **hook library** — rule: **60% variations of proven winners, 40% new experiments**.
3. Generates image prompts + copy in ChatGPT, builds each ad one-by-one (image + hook + copy), iterating until it meets expectations. Minor edits/logo in Canva.
4. Assembles everything into a Google Slides deck (creative on one side, copy on the other) for internal/client review.

**Vocabulary (important — these are distinct):**
- **HOOK** = the punchy text *designed onto the image* (e.g. "ONE RIDE. A WHOLE EVENT PEOPLE STILL TALK ABOUT."). This is the scroll-stopper.
- **COPY** = Meta ad-interface fields: **primary text / caption**, **headline**, **CTA button**. Lives beside the creative, not on it.

**Originally specified as a 5-step workflow:**
1. **Setup** — choose brand, feed recent performance insights + seasonality. Each brand has a stored profile (voice, colors, logo, goals, location) + memory carried across sessions.
2. **Hook generation** — pre-trained on hook frameworks, learns from fed insights; generates a hook library; user approves/edits; approved hooks flow forward.
3. **Visual prompts** — from approved hooks, generate image prompts → 3 variants per hook; iterate on feedback until approved. Hook text must appear on the image in brand colors/style.
4. **Internal approval** — in-app page rendering each creative + copy **as it would appear in Meta**; manager comments/requests changes; loop until final approval.
5. **Export** — Google Slides deck + downloadable images/copy.

**Cross-cutting requirement:** every piece of feedback (specialist edits, manager comments, approvals/rejections) should feed a per-brand **preference memory** so future batches improve. (Implemented as prompt/RAG memory — NOT model fine-tuning.)

**Later phases (explicitly not MVP):** AI video, Canva export, direct-to-Meta draft ad push.

---

## 2. Locked product/architecture decisions

| Decision | Choice | Notes |
|---|---|---|
| Form factor | Custom hosted web app | (not Claude-native, not no-code) |
| Who builds | Claude writes all code; Jan operates | ⇒ managed hosting, no terminal for day-to-day |
| Creative generation | **Hybrid two-layer** (the core quality bet) | see below |
| Photo model | Higgsfield **Soul** planned as default; **currently OpenAI `gpt-image-1`** (working) | provider abstraction lets us swap |
| Hook text rendering | **Programmatic overlay** (NOT baked by image model) | AI models render text unreliably/off-brand |
| Image prompts | Claude, loaded with Jan's **Hyperrealism Prompt Engine** doc | see §4 |
| Performance insights | Meta Marketing API auto-pull is the *target*; MVP = manual paste/CSV | Meta API needs app review/System User — deliberately deferred |
| Users | Team logins + roles (specialist / manager / admin) | manager approves in-app |
| Settings UI | **REMOVED at Jan's request** — all config/keys via code/env vars | there is no front-end Settings page anymore |

### The hybrid two-layer creative engine (why it exists)
No diffusion model renders accurate, on-brand text. So:
1. **Photo layer** — image model generates a hyper-realistic, **text-free** background (prompt explicitly demands blank/unmarked surfaces).
2. **Text/design layer** — **Claude with vision** looks at the generated photo, finds negative space, avoids faces, and emits a **LayoutSpec** (placement, size, per-word colors, treatment, scrim, logo). The app then renders the hook as **real vector text** (exact brand font/hex) composited over the photo.

This has been **proven to produce genuinely good creatives** (see §5).

---

## 3. Current tech stack

- **Next.js 16.2.11** (App Router, Turbopack), **React 19.2**, **TypeScript**, **Tailwind 4**
- **Supabase** — Postgres + Auth + Storage (bucket: `assets`, private)
- **Vercel** — git-push auto-deploy from `main`
- **Anthropic SDK** (`@anthropic-ai/sdk`) — model id used: `claude-sonnet-5` (hooks, copy, prompt engine, vision layout)
- **OpenAI REST** (`gpt-image-1`) — `/v1/images/generations` and `/v1/images/edits`
- **satori** (HTML/JSX → SVG with text as vector paths) + **@resvg/resvg-wasm** (SVG → PNG) + **sharp** (compositing, normalization)
- **heic-convert** — iPhone HEIC decoding
- **zod** — validation
- **inngest** — INSTALLED BUT NOT YET USED (planned for background jobs)
- `tsx` for running the diagnostic scripts

### Config that matters (`next.config.ts`)
```ts
serverExternalPackages: ["@resvg/resvg-wasm", "sharp", "satori", "heic-convert"],
experimental: { serverActions: { bodySizeLimit: "12mb" } },
outputFileTracingIncludes: { "/**": ["./fonts/**", "./node_modules/@resvg/resvg-wasm/index_bg.wasm"] },
```
Native/wasm packages **must** be external — Turbopack cannot bundle them.

### Environment variables
**Vercel (production) + `.env.local` (local dev).** Values are NOT in this doc.
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Supabase now calls this the **Publishable** key)
- `SUPABASE_SERVICE_ROLE_KEY` (Supabase now calls this the **Secret** key)
- `SECRETS_MASTER_KEY` (encrypts the DB-stored secrets; keep safe)
- `NEXT_PUBLIC_APP_URL` (optional — must stay optional, see §7)
- `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` — read via `lib/secrets.ts` env fallback

**Key resolution:** `lib/secrets.ts` first checks an encrypted `secrets` DB table, then falls back to `process.env`. Since the Settings UI was removed, **env vars are the live path**.

---

## 4. The Hyperrealism Prompt Engine

Jan supplied `HYPERREALISM_PROMPT_ENGINE.md` (~51k chars) — a "capture simulator" knowledge doc: six laws of hyperrealism, the realism equation (8 variables), layer libraries (capture system/optics/light physics/subject behavior/spatial evidence/material truth/color science/imperfection budget), assembly order, scenario templates, tool-specific translation (§14.3 covers DALL·E/gpt-image: convert every negative into a positive statement), diagnosis tables, phrase bank.

**How it's wired:**
- Embedded base64 in `lib/prompt-engine/engine-doc.ts` (so it ships with the bundle).
- `lib/prompt-engine/engine.ts` → `buildMasterPrompt({ brief, apiKey, referenceImages? })` loads the whole doc as the **system prompt**, passes the user's brief (+ product photos as vision input), and returns `{ visualSystem, masterPrompt }`.
- **Output format is PLAIN TEXT**, parsed from `VISUAL SYSTEM:` / `MASTER PROMPT:` headers — NOT forced tool-JSON. (Forced tool calls returned empty ~intermittently with a system prompt that large. Text is reliable; retries once on empty.)

**The required flow (Jan's explicit spec):**
> user prompt → prompt engine turns it into a **visual system + master prompt** → sends master prompt to image generator → image generated

The **master prompt is shown in the UI and is user-editable; nothing generates until the user approves it.**

**Quality proof:** from the 12-word brief *"kids laughing on a mechanical bull at a summer block party, pure joy"*, the engine produced a master prompt specifying full-frame DSLR 35mm f/2.8 1/500s ISO 400 Kodak Gold 200, single backlit late-afternoon sun with named falloff and "no fill," body mechanics instead of expressions, a blurred bystander's forearm as foreground obstruction, dust in the beam, bounded palette, and "all banners…blank and unmarked." The resulting image was excellent.

---

## 5. What is BUILT AND WORKING (verified)

### Infrastructure ✅
GitHub → Vercel auto-deploy; Supabase project with migrations `0001` + `0002` applied; `assets` storage bucket; email auth; macOS keychain configured so Claude can `git push` from Jan's machine.

### Auth & workspace ✅
- `/login` — email+password sign in / sign up (Supabase). Email confirmation turned off for internal use.
- `lib/auth.ts` `requireContext()` — resolves `{ user, orgId, role }`, **auto-bootstraps** an org + admin membership for a first-time user.
- `middleware.ts` — session refresh + route gating. **Skips `/api/*` entirely** (critical, see §7).
- App shell with header (`app/(app)/layout.tsx`), brands list + create (`app/(app)/page.tsx`, `actions.ts`), brand detail (`app/(app)/brands/[id]/page.tsx`).

### The Studio — feed/chat UX ✅ (`app/(app)/brands/[id]/studio/`)
Chat-style feed, ORRISO-inspired styling (light gradient canvas, glass pill top bar with **brand dropdown**, floating glass composer with gradient glow, dark rounded content cards).

Working sequence:
1. **Attach product photos** — `+` button, **drag-and-drop** anywhere, or **paste**; thumbnail previews with per-item remove + clear. Max 4.
2. **Brief** → user bubble (with thumbnails).
3. **Engine card** — shows `visualSystem` + **editable `masterPrompt` textarea** → "Approve & generate image".
4. **Image card** → "Generate hooks →"
5. **Hooks card** — 5 hook options as pills; clicking one triggers the overlay.
6. **Overlay card** (finished creative) → "Generate Meta copy →"  ← **CURRENTLY BROKEN, see §6**
7. **Copy card** — primary text / headline / CTA.

### Generation pipeline ✅
- `POST /api/upload` — binary-safe multipart upload. Normalizes each photo to clean 8-bit sRGB PNG, **also produces a small vision JPEG (base64) in the same in-memory pass**, stores the PNG in Supabase Storage, returns `{ refs: [{ path, url, visionB64 }] }`.
- `startBrief({ brief, refs })` → prompt engine (vision reads the real product) → `{ visualSystem, masterPrompt }`.
- `approveAndGenerate({ masterPrompt, refB64 })` → `gpt-image-1`; with refs it uses **`/v1/images/edits`** (image-to-image) so the customer's real product is preserved; falls back to text-only generation if the endpoint rejects the reference (surfaces an amber note).
- `makeHooks({...})` → 5 hooks via Claude (`lib/ai/creative.ts`).
- `makeCopy({...})` → Meta primary text / headline / CTA via Claude.
- `applyHook({...})` → Claude-vision LayoutSpec → satori → resvg-wasm → sharp composite.

### Verified proof points (all real, run end-to-end)
- **Render engine proven offline** (`scripts/demo-render.ts`) — exact brand font, per-word multi-color, outline, shadow, scrim, logo, 4:5 canvas.
- **Full generation proven** (`scripts/prove-generation.ts`) — gpt-image-1 photo → Claude vision layout → rendered finished ad.
- **Prompt engine proven** (`scripts/test-engine.ts`).
- **Reference-product preservation proven** (`scripts/test-reference.ts`) — the exact red mechanical bull from a reference photo was kept while the scene changed to an indoor arcade at night.
- **Overlay renders correctly locally with resvg-wasm** — crisp Anton headline, gold accent on the key phrase, scrim, product intact.
- **Jan confirmed the deployed app works end-to-end** for: product photo → engine → image → hooks → copy.

---

## 6. CURRENT BLOCKER (the one live bug)

**The image-with-hook (text overlay) step returns a broken image on Vercel**, while rendering perfectly on macOS locally. Everything else in the chain works in production.

History of attempts on this specific bug:
1. `@resvg/resvg-js` (native) — works locally, broken image on Vercel.
2. Tried **sharp** to rasterize the satori SVG → **garbled layout** (librsvg does not honor satori's flex positioning; words overlapped). Not viable.
3. Switched to **`@resvg/resvg-wasm`** (same engine as resvg-js so layout is correct, pure WebAssembly so Vercel-safe — this is what `@vercel/og` uses). Verified perfect locally. **Still broken image on Vercel per Jan's last report.**
4. Latest deploy (`df1db99`, health version `2026-07-24-overlay-diag-dataurl`) adds instrumentation — **result not yet reported by Jan**:
   - each sub-step wrapped and labeled: `download step:` / `layout step:` / `render step:` / `upload step:`
   - server-side validation of the render output → returns `render produced an invalid image (Nb, sig=…)` instead of a silent broken `<img>`
   - the creative is returned as a **data URL** (bypasses Supabase storage + signed-URL serving entirely) with a `diag` note like `1080x1350, 3297049b`

**Next diagnostic step for whoever picks this up:** get the actual error string from that instrumented deploy. It will discriminate between (a) resvg-wasm failing on Vercel (wasm not bundled / init failure / memory), (b) the Claude-vision layout step failing, and (c) storage/signed-URL serving. Note `@resvg/resvg-js` is still in `package.json` and can be removed.

**Plausible remaining causes not yet ruled out:** the wasm file not actually shipping in the serverless bundle (`outputFileTracingIncludes` path/cwd assumption), serverless memory limits on a 1080×1350 raster, or the data URL being too large for the payload.

---

## 7. HARD-WON GOTCHAS (do not re-learn these)

These each cost real debugging time. **Preserve them through any overhaul.**

1. **NEVER pass binary `File` objects through a Next.js server action.** It corrupted the upload: the PNG signature byte `0x89` became `EF BF BD` (the UTF-8 replacement char) — a text-encoding pass mangled the bytes. Symptom: `Input buffer contains unsupported image format`, `sig=efbfbd504e470d0a…`. **Use a route handler with `request.formData()`.**

2. **`middleware.ts` must skip `/api/*`.** The Supabase `updateSession` / `NextResponse.next({ request })` reconstruction also corrupted multipart bodies — identical `EF BF BD` corruption via the route handler until middleware was bypassed for API paths. API routes authenticate themselves via `requireContext()`.

3. **Decode images ONCE.** Round-tripping through storage and re-decoding caused repeated "unsupported image format" failures. Current design: decode once at upload, forward the validated small JPEG (base64) to *both* Claude vision and the image generator.

4. **Anthropic vision rejects large images** → `Could not process image` (400, `invalid_request_error`). A lossless 1024px photo PNG can exceed the ~5MB/image limit. **Send a small JPEG (~83KB) for vision calls** (`toVisionJpegBase64`).

5. **Forced tool-JSON is unreliable with a huge system prompt.** With the ~51k-char engine doc, `tool_choice: {type:"tool"}` intermittently returned an **empty** master prompt. **Plain-text output + header parsing is reliable.**

6. **For satori rasterization use `@resvg/resvg-wasm`** — not resvg-js (native, fails on Vercel) and not sharp (wrong layout).

7. **Fonts must be committed to the repo** (`/fonts`, OFL-licensed **Anton** headline + **Barlow** body) and included via `outputFileTracingIncludes`. Mac system fonts (Impact/Arial) work locally and do not exist on Vercel. Satori converts text to vector paths, so the exact font renders identically anywhere.

8. **RLS recursion:** the `memberships` SELECT policy must NOT call `is_org_member()` (that helper reads `memberships` → infinite recursion → 500 on every authed page). Fixed in migration `0002` to `using (user_id = auth.uid())`.

9. **Env validation must not over-require.** `NEXT_PUBLIC_APP_URL` was `z.string().url()` and its absence threw inside `env()`, which broke the Supabase admin client and produced a confusing 500. Keep optional/lenient.

10. **Turbopack cannot bundle native/wasm packages** → they must be in `serverExternalPackages`.

11. **HEIC is the iPhone default** and sharp cannot decode it → `heic-convert` with magic-byte detection (`ftyp` at offset 4) plus a forced-convert fallback.

12. **gpt-image-1 requires OpenAI org verification** and prepaid credit; Anthropic requires prepaid credit too.

13. **Deploy/cache confusion is real.** Stale client JS produced errors from code paths that no longer existed. `/api/health` now returns a `version` string — **bump it on deploys** and confirm it before trusting a test. Tell Jan to **hard-refresh (⌘⇧R)**.

14. **Never write the app into the Google Drive folder** — `node_modules`/build output breaks Drive sync. The repo lives at `~/Projects/`.

---

## 8. Data model (Supabase Postgres)

Migration `supabase/migrations/0001_init.sql` (+ `0002_fix_memberships_policy.sql`) — **applied**. 16 tables, RLS on all, org-scoped via `is_org_member(org_id)` helpers (`SECURITY DEFINER`, stable `search_path`).

```
profiles, orgs, memberships(role: specialist|manager|admin)
brands(org_id, name, status, meta_ad_account_id, meta_page_id)
brand_profiles(brand_id PK, voice_tone, goals, location, target_audience,
               colors JSONB, fonts JSONB, logo_asset_id,
               image_prompt_style, hook_frameworks)
preference_memory(brand_id, category: voice|hook|visual|copy|audience|do_not,
                  summary, weight, evidence_count, status, last_reinforced_at)
image_assets(org_id, brand_id, kind: logo|font|background|composited|export,
             storage_path, width, height, mime, checksum)
meta_insights(brand_id, source: api|manual_paste, payload JSONB, winners JSONB,
              seasonality_notes, date_range_*)
batches(brand_id, created_by, status: setup|hooks|visuals|approval|export|done,
        current_step, meta_insights_id)
hooks(batch_id, text, edited_text, framework,
      origin: winner_variation|experiment, status, order_index)
visual_prompts(hook_id, prompt_text, model, status)
ad_copy(primary_text, headline, description, cta, status)
creatives(batch_id, hook_id, status: draft|in_review|changes_requested|approved,
          selected_variant_id, copy_id)
image_variants(creative_id, visual_prompt_id, provider, model,
               background_asset_id, composited_asset_id, layout_spec JSONB,
               generation_round, is_selected)
feedback(brand_id, batch_id, target_type, target_id, actor_user_id, actor_role,
         action, before_value, after_value, comment, step,
         processed_into_memory)   -- append-only audit log → preference_memory
exports(batch_id, kind: google_slides|zip, status, slides_url, storage_path)
secrets(org_id, name, ciphertext, hint)  -- service-role only, no policies
```

⚠️ **CRITICAL GAP: almost none of this is used yet.** The Studio writes only to Storage. `batches`, `hooks`, `creatives`, `image_variants`, `ad_copy`, `feedback`, `preference_memory`, `meta_insights`, `exports` are **all currently unused** — the feed is **session-only React state and is lost on refresh**.

---

## 9. File-by-file map

```
app/
  layout.tsx, globals.css
  login/{page.tsx,actions.ts}          sign in / sign up / sign out
  (app)/
    layout.tsx                         app shell + header (Settings link removed)
    page.tsx, actions.ts               brands list + create brand
    brands/[id]/page.tsx               brand detail, 5-step placeholder, link to Studio
    brands/[id]/studio/
      page.tsx                         fixed-canvas shell, glass pill top bar
      BrandSwitcher.tsx                brand dropdown (client)
      StudioFeed.tsx                   THE MAIN UI — feed, composer, drag/drop/paste
      actions.ts                       startBrief / approveAndGenerate / makeHooks
                                       / applyHook / makeCopy  (all inline server
                                       actions, maxDuration 60)
  api/
    upload/route.ts                    binary-safe multipart upload + normalize + visionB64
    health/route.ts                    env/service-role diagnostics + version string

lib/
  env.ts                               zod-validated server env
  auth.ts                              requireContext(), workspace bootstrap
  secrets.ts                           AES-256-GCM encrypted secrets + env fallback
  supabase/{server,admin,middleware}.ts
  prompt-engine/engine-doc.ts          Hyperrealism doc, base64
  prompt-engine/engine.ts              buildMasterPrompt() — plain-text output
  providers/image.ts                   ImageProvider iface; OpenAI (generations+edits),
                                       HiggsfieldSoul via gateway (UNVERIFIED contract)
  providers/image-factory.ts           getImageProvider(orgId, name) — reads secrets
  ai/creative.ts                       generateHooks(), generateAdCopy()
  images/normalize.ts                  normalizeToPng(), toVisionJpegBase64(), HEIC
  render/types.ts                      LayoutSpec / TextBlock / BrandFont / etc.
  render/schema.ts                     zod schema for LayoutSpec
  render/vision.ts                     generateLayout() — Claude vision art director
  render/overlay.ts                    satori → resvg-wasm → sharp composite
  render/fonts.ts                      defaultFonts() (Anton + Barlow from /fonts)

fonts/            Anton-Regular.ttf, Barlow-Regular.ttf, Barlow-SemiBold.ttf
types/            heic-convert.d.ts
supabase/migrations/  0001_init.sql, 0002_fix_memberships_policy.sql
scripts/          demo-render, prove-generation, test-engine, test-reference,
                  test-normalize  (diagnostic, run via `npx tsx`, read .env.local)
RUNBOOK.md        non-coder setup guide (GitHub→Supabase→master key→Vercel)
```

---

## 10. What is NOT built (gap list)

| Missing | Notes |
|---|---|
| **Persistence of the workflow** | Feed is session-only React state; refresh loses everything. All the workflow tables are unused. **Biggest structural gap.** |
| **Background jobs** | `inngest` installed but unused. Every step is an inline server action with `maxDuration 60` — slow generations can time out. |
| **Step 1 Setup** | No insights paste/upload UI, no seasonality input, no "distill winners" step, no brand-profile editor (voice/colors/fonts/logo/audience). `brand_profiles` rows are created empty. |
| **60/40 hook rule** | `generateHooks()` does NOT implement winner-variation vs experiment split or tag `origin` — no insights are fed in yet. |
| **3 variants per hook** | Currently generates 1 image. Spec calls for 3 to choose from. |
| **Step 4 Manager approval** | No Meta ad-preview mockup, no comment threads, no request-changes loop, no roles gating, no final-approval state. |
| **Step 5 Export** | No Google Slides export, no ZIP download. |
| **Feedback → preference memory** | Nothing is captured; no summarizer job; nothing injected into prompts. The "gets better every batch" promise is unimplemented. |
| **Brand identity in generation** | Brand palette/logo/fonts are NOT fed into the engine or the overlay (overlay uses a hardcoded default palette + bundled fonts; `hasLogo: false`). |
| **Higgsfield Soul** | Provider written but the gateway request/response contract is **unverified** — no account/key yet. Gateway undecided (WaveSpeed vs Segmind). |
| **Meta Marketing API** | Not started (deliberately deferred — needs System User under BLG's Business Manager). |
| **Video** | Not started. |
| **Regenerate / iterate controls** | No "try again", no per-step revision loop in the UI. |
| **Multi-brand profile management** | Can create/list brands only. |

---

## 11. UX/UI direction

**Reference set 1 (already partially implemented) — "ORRISO":** light/grey desktop canvas, frosted-glass pill toolbars, floating glass composer with a soft multi-color gradient glow + gradient underline, small icon buttons (`+`, Image, Video, mic, circular send), dark content cards with generous rounding, scattered image tiles around a central artboard, side panels (AI Agent: Storyboarder/Optimizer/Visualizer/Copywriter; Files).

Jan's feedback on the first attempt: *"looks nothing like the references"* → a redesign pass was done (light gradient canvas, glass composer with gradient glow, pill top bar, dark cards) and Jan then said *"ux/ui looks much better now thanks!"*. It is still **not** the full free-floating spatial canvas with floating tool pills and side panels — that remains unbuilt.

**Reference set 2 (newest, informing the overhaul) — node-graph / workflow canvas:** dark theme, tabbed workspaces, a left chat/conversation column, and a **node-based graph** on a dark dotted canvas — labeled nodes (Prompt, Random noise, Sampler select, Basic Scheduler, Load VAE, Image proportions, Sampler custom advanced, VAE decode, Render) connected by colored bezier edges, each node with small stepper/select rows, and a Render node showing the output image with a "file name / Variant 2123" footer. Implies: visible, inspectable, rewireable pipeline with per-node parameters and variant outputs.

**Explicit UX requirements Jan stated:**
- Product photos show as **thumbnail previews** once uploaded ✅
- Master prompt is **user-editable before generation, then approved** to advance ✅
- Manage the whole thing as a **feed/chat**: product image → user prompt → visual system + master prompt → approval → hook generation → text overlay → copy generation ✅
- **Brand dropdown at the top** ✅
- Drag-and-drop image attach ✅
- **No front-end Settings** — configuration lives in code ✅

---

## 12. Operational notes for the operator (Jan)

- Deploys are automatic on push to `main`; Jan never runs a build.
- Claude can `git push` from Jan's machine (macOS keychain holds a GitHub PAT).
- ⚠️ A GitHub PAT was once pasted into chat and should be treated as compromised/revoked.
- `RUNBOOK.md` documents the one-time setup click-by-click. Supabase renamed its keys: **Publishable** = old anon, **Secret** = old service_role; **Project URL** now lives under **Settings → Data API**.
- After any deploy, check `/api/health` `version` and hard-refresh before testing.

---

## 13. Suggested priorities (previous recommendation, pre-overhaul)

1. Fix the overlay-on-Vercel bug (get the instrumented error string).
2. **Persistence** — write the workflow to `batches`/`hooks`/`creatives`/`image_variants`/`ad_copy`; makes refresh-safe and unlocks approval/export.
3. **Background jobs (Inngest)** — remove the 60s timeout risk.
4. Step 1 Setup (brand profile editor + insights intake) → enables the real 60/40 hook rule and brand-accurate visuals.
5. Step 4 approval + Step 5 export.
6. Feedback → preference memory (the compounding-quality promise).
7. Higgsfield Soul swap; then video.
