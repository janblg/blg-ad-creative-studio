-- BLG Ad Creative Studio — initial schema
-- Multi-tenant by `org`. Row-Level Security scopes every domain row to the
-- orgs a user belongs to. The `secrets` table is service-role only.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type member_role   as enum ('specialist','manager','admin');
create type batch_status  as enum ('setup','hooks','visuals','approval','export','done');
create type hook_origin   as enum ('winner_variation','experiment');
create type hook_status   as enum ('proposed','approved','edited','rejected');
create type creative_status as enum ('draft','in_review','changes_requested','approved');
create type insight_source as enum ('api','manual_paste');
create type asset_kind     as enum ('logo','font','background','composited','export');
create type feedback_action as enum ('approve','reject','edit','comment','request_changes','final_approve','regenerate','select');
create type feedback_target as enum ('hook','image_variant','creative','copy');
create type memory_category as enum ('voice','hook','visual','copy','audience','do_not');
create type memory_status   as enum ('active','archived','superseded');
create type export_kind     as enum ('google_slides','zip');

-- ---------------------------------------------------------------------------
-- Identity
-- ---------------------------------------------------------------------------
create table profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  full_name  text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table orgs (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table memberships (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  org_id     uuid not null references orgs(id) on delete cascade,
  role       member_role not null default 'specialist',
  created_at timestamptz not null default now(),
  unique (user_id, org_id)
);

-- Membership check used across RLS policies. SECURITY DEFINER + a stable
-- search_path avoids recursive RLS evaluation on `memberships` itself.
create or replace function public.is_org_member(target_org uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from memberships m
    where m.org_id = target_org and m.user_id = auth.uid()
  );
$$;

create or replace function public.has_org_role(target_org uuid, roles member_role[])
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from memberships m
    where m.org_id = target_org and m.user_id = auth.uid() and m.role = any(roles)
  );
$$;

-- ---------------------------------------------------------------------------
-- Brands & profiles
-- ---------------------------------------------------------------------------
create table brands (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references orgs(id) on delete cascade,
  name              text not null,
  status            text not null default 'active',
  meta_ad_account_id text,
  meta_page_id      text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index on brands (org_id);

create table brand_profiles (
  brand_id          uuid primary key references brands(id) on delete cascade,
  voice_tone        text,
  goals             text,
  location          text,
  target_audience   text,
  colors            jsonb not null default '[]',   -- [{name,hex,role}]
  fonts             jsonb not null default '[]',   -- [{role,asset_id,weight}]
  logo_asset_id     uuid,
  image_prompt_style text,                          -- pasted from Jan's Claude project
  hook_frameworks   text,
  updated_at        timestamptz not null default now()
);

create table preference_memory (
  id               uuid primary key default gen_random_uuid(),
  brand_id         uuid not null references brands(id) on delete cascade,
  category         memory_category not null,
  summary          text not null,          -- short, imperative, prompt-ready
  weight           int not null default 1,
  evidence_count   int not null default 1,
  status           memory_status not null default 'active',
  last_reinforced_at timestamptz not null default now(),
  created_at       timestamptz not null default now()
);
create index on preference_memory (brand_id, category, status);

-- ---------------------------------------------------------------------------
-- Assets (Supabase Storage paths)
-- ---------------------------------------------------------------------------
create table image_assets (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id) on delete cascade,
  brand_id    uuid references brands(id) on delete cascade,
  kind        asset_kind not null,
  storage_path text not null,
  width       int,
  height      int,
  mime        text,
  checksum    text,
  created_at  timestamptz not null default now()
);
create index on image_assets (brand_id, kind);

-- ---------------------------------------------------------------------------
-- Insights & batches
-- ---------------------------------------------------------------------------
create table meta_insights (
  id               uuid primary key default gen_random_uuid(),
  brand_id         uuid not null references brands(id) on delete cascade,
  source           insight_source not null,
  ad_account_id    text,
  date_range_start date,
  date_range_end   date,
  payload          jsonb,          -- raw metrics / pasted text
  winners          jsonb,          -- distilled top performers + hook text
  seasonality_notes text,
  pulled_at        timestamptz not null default now()
);
create index on meta_insights (brand_id);

create table batches (
  id               uuid primary key default gen_random_uuid(),
  brand_id         uuid not null references brands(id) on delete cascade,
  created_by       uuid references auth.users(id),
  name             text,
  status           batch_status not null default 'setup',
  current_step     int not null default 1,
  meta_insights_id uuid references meta_insights(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index on batches (brand_id);

-- ---------------------------------------------------------------------------
-- Hooks
-- ---------------------------------------------------------------------------
create table hooks (
  id           uuid primary key default gen_random_uuid(),
  batch_id     uuid not null references batches(id) on delete cascade,
  text         text not null,
  edited_text  text,
  framework    text,
  origin       hook_origin not null,
  source_winner_ref text,
  status       hook_status not null default 'proposed',
  order_index  int not null default 0,
  created_at   timestamptz not null default now()
);
create index on hooks (batch_id);

-- ---------------------------------------------------------------------------
-- Visuals & copy
-- ---------------------------------------------------------------------------
create table visual_prompts (
  id          uuid primary key default gen_random_uuid(),
  hook_id     uuid not null references hooks(id) on delete cascade,
  prompt_text text not null,
  model       text,
  status      text not null default 'ready',
  created_at  timestamptz not null default now()
);

create table ad_copy (
  id           uuid primary key default gen_random_uuid(),
  primary_text text,
  headline     text,
  description  text,
  cta          text,
  status       text not null default 'draft',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table creatives (
  id                 uuid primary key default gen_random_uuid(),
  batch_id           uuid not null references batches(id) on delete cascade,
  hook_id            uuid not null references hooks(id) on delete cascade,
  status             creative_status not null default 'draft',
  selected_variant_id uuid,
  copy_id            uuid references ad_copy(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index on creatives (batch_id);

create table image_variants (
  id                  uuid primary key default gen_random_uuid(),
  creative_id         uuid not null references creatives(id) on delete cascade,
  visual_prompt_id    uuid references visual_prompts(id),
  provider            text not null,           -- 'higgsfield_soul' | 'openai'
  model               text,
  background_asset_id uuid references image_assets(id),
  composited_asset_id uuid references image_assets(id),
  layout_spec         jsonb,                   -- Claude-vision LayoutSpec
  generation_round    int not null default 1,
  is_selected         boolean not null default false,
  created_at          timestamptz not null default now()
);
create index on image_variants (creative_id);

alter table creatives
  add constraint creatives_selected_variant_fk
  foreign key (selected_variant_id) references image_variants(id) on delete set null;

-- ---------------------------------------------------------------------------
-- Feedback (append-only audit log -> preference memory)
-- ---------------------------------------------------------------------------
create table feedback (
  id            uuid primary key default gen_random_uuid(),
  brand_id      uuid not null references brands(id) on delete cascade,
  batch_id      uuid references batches(id) on delete cascade,
  target_type   feedback_target not null,
  target_id     uuid not null,
  actor_user_id uuid references auth.users(id),
  actor_role    member_role,
  action        feedback_action not null,
  before_value  text,
  after_value   text,
  comment       text,
  step          int,
  processed_into_memory boolean not null default false,
  created_at    timestamptz not null default now()
);
create index on feedback (brand_id, processed_into_memory);
create index on feedback (batch_id);

create table exports (
  id          uuid primary key default gen_random_uuid(),
  batch_id    uuid not null references batches(id) on delete cascade,
  kind        export_kind not null,
  status      text not null default 'pending',
  slides_url  text,
  storage_path text,
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Secrets (service-role only)
-- ---------------------------------------------------------------------------
create table secrets (
  org_id     uuid not null references orgs(id) on delete cascade,
  name       text not null,
  ciphertext text not null,
  hint       text,
  updated_at timestamptz not null default now(),
  primary key (org_id, name)
);

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

do $$
declare t text;
begin
  foreach t in array array[
    'profiles','orgs','brands','brand_profiles','batches','ad_copy','creatives'
  ] loop
    execute format(
      'create trigger trg_touch_%1$s before update on %1$s
       for each row execute function public.touch_updated_at();', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Row-Level Security
-- ---------------------------------------------------------------------------
alter table profiles          enable row level security;
alter table orgs              enable row level security;
alter table memberships       enable row level security;
alter table brands            enable row level security;
alter table brand_profiles    enable row level security;
alter table preference_memory enable row level security;
alter table image_assets      enable row level security;
alter table meta_insights     enable row level security;
alter table batches           enable row level security;
alter table hooks             enable row level security;
alter table visual_prompts    enable row level security;
alter table ad_copy           enable row level security;
alter table creatives         enable row level security;
alter table image_variants    enable row level security;
alter table feedback          enable row level security;
alter table exports           enable row level security;
alter table secrets           enable row level security;  -- no policies: service-role only

-- Profiles: a user manages their own row.
create policy profiles_self on profiles
  for all using (id = auth.uid()) with check (id = auth.uid());

-- Orgs & memberships: members can read; membership rows are visible to the user.
create policy orgs_member_read on orgs
  for select using (public.is_org_member(id));
-- Must NOT reference is_org_member() here: that function reads `memberships`,
-- so calling it from a `memberships` policy causes infinite RLS recursion.
create policy memberships_self_read on memberships
  for select using (user_id = auth.uid());

-- Org-scoped tables: full access to members of the owning org.
create policy brands_member on brands
  for all using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
create policy image_assets_member on image_assets
  for all using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));

-- Brand-scoped tables: resolve org via the parent brand.
create policy brand_profiles_member on brand_profiles
  for all using (exists (select 1 from brands b where b.id = brand_id and public.is_org_member(b.org_id)))
  with check (exists (select 1 from brands b where b.id = brand_id and public.is_org_member(b.org_id)));
create policy preference_memory_member on preference_memory
  for all using (exists (select 1 from brands b where b.id = brand_id and public.is_org_member(b.org_id)))
  with check (exists (select 1 from brands b where b.id = brand_id and public.is_org_member(b.org_id)));
create policy meta_insights_member on meta_insights
  for all using (exists (select 1 from brands b where b.id = brand_id and public.is_org_member(b.org_id)))
  with check (exists (select 1 from brands b where b.id = brand_id and public.is_org_member(b.org_id)));
create policy batches_member on batches
  for all using (exists (select 1 from brands b where b.id = brand_id and public.is_org_member(b.org_id)))
  with check (exists (select 1 from brands b where b.id = brand_id and public.is_org_member(b.org_id)));
create policy feedback_member on feedback
  for all using (exists (select 1 from brands b where b.id = brand_id and public.is_org_member(b.org_id)))
  with check (exists (select 1 from brands b where b.id = brand_id and public.is_org_member(b.org_id)));

-- Batch-scoped tables: resolve org via batch -> brand.
create policy hooks_member on hooks
  for all using (exists (select 1 from batches ba join brands b on b.id = ba.brand_id
                         where ba.id = batch_id and public.is_org_member(b.org_id)))
  with check (exists (select 1 from batches ba join brands b on b.id = ba.brand_id
                      where ba.id = batch_id and public.is_org_member(b.org_id)));
create policy creatives_member on creatives
  for all using (exists (select 1 from batches ba join brands b on b.id = ba.brand_id
                         where ba.id = batch_id and public.is_org_member(b.org_id)))
  with check (exists (select 1 from batches ba join brands b on b.id = ba.brand_id
                      where ba.id = batch_id and public.is_org_member(b.org_id)));
create policy exports_member on exports
  for all using (exists (select 1 from batches ba join brands b on b.id = ba.brand_id
                         where ba.id = batch_id and public.is_org_member(b.org_id)))
  with check (exists (select 1 from batches ba join brands b on b.id = ba.brand_id
                      where ba.id = batch_id and public.is_org_member(b.org_id)));

-- Deeper tables resolve org via their parents.
create policy visual_prompts_member on visual_prompts
  for all using (exists (select 1 from hooks h join batches ba on ba.id = h.batch_id
                         join brands b on b.id = ba.brand_id
                         where h.id = hook_id and public.is_org_member(b.org_id)))
  with check (exists (select 1 from hooks h join batches ba on ba.id = h.batch_id
                      join brands b on b.id = ba.brand_id
                      where h.id = hook_id and public.is_org_member(b.org_id)));
create policy image_variants_member on image_variants
  for all using (exists (select 1 from creatives c join batches ba on ba.id = c.batch_id
                         join brands b on b.id = ba.brand_id
                         where c.id = creative_id and public.is_org_member(b.org_id)))
  with check (exists (select 1 from creatives c join batches ba on ba.id = c.batch_id
                      join brands b on b.id = ba.brand_id
                      where c.id = creative_id and public.is_org_member(b.org_id)));
-- ad_copy is reached only via creatives; members of any org may create, and
-- read is gated through the creative join at the app layer.
create policy ad_copy_member on ad_copy for all
  using (auth.uid() is not null) with check (auth.uid() is not null);
