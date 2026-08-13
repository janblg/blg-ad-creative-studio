-- Phase 3: persist the Studio workflow.
-- New columns only — no new tables and no new policies. Existing RLS already
-- covers every row through the brand/batch joins (gotcha #8 untouched).
--
-- RUN AS TWO SEPARATE QUERIES. `ALTER TYPE ... ADD VALUE` can refuse to run
-- inside a transaction block on some Postgres builds, and the SQL editor may
-- wrap a multi-statement script in one. Step 1 alone, then Step 2.

-- ===== STEP 1 (run this by itself) =====
alter type asset_kind add value if not exists 'reference';

-- ===== STEP 2 (run this after step 1 succeeds) =====
alter table batches
  add column if not exists brief text,
  add column if not exists visual_system text,
  add column if not exists master_prompt text,
  add column if not exists master_prompt_approved boolean not null default false,
  -- The batch-level generated photo (pre-hook). Picking a hook then creates a
  -- creative + image_variant that composites the text on top of it.
  add column if not exists base_image_asset_id uuid references image_assets(id),
  add column if not exists ref_asset_ids uuid[] not null default '{}';

-- HOOK_ENGINE §12 metadata travels with each hook.
alter table hooks
  add column if not exists emphasis text,
  add column if not exists visual text,
  add column if not exists why text,
  add column if not exists negative boolean not null default false;
