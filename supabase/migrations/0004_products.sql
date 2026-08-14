-- Phase 4b: per-brand product library, imported from the client's website.
--
-- Product photos reuse the existing `reference` asset kind added in 0003, so
-- there is no enum change here — this whole file is one safe query.

create table if not exists products (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references orgs(id) on delete cascade,
  brand_id        uuid not null references brands(id) on delete cascade,
  name            text not null,
  category        text,
  description     text,
  source_url      text,
  price_text      text,
  image_asset_id  uuid references image_assets(id),
  status          text not null default 'active',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists products_brand_status_idx on products (brand_id, status);
create index if not exists products_brand_category_idx on products (brand_id, category);

-- Re-importing a site must update rather than duplicate.
create unique index if not exists products_brand_source_key
  on products (brand_id, source_url)
  where source_url is not null;

alter table products enable row level security;

-- Same shape as image_assets: members of the owning org.
drop policy if exists products_member on products;
create policy products_member on products
  for all using (public.is_org_member(org_id))
  with check (public.is_org_member(org_id));

drop trigger if exists trg_touch_products on products;
create trigger trg_touch_products before update on products
  for each row execute function public.touch_updated_at();
