-- Phase 4c: a session can start from a chosen category + catalog product,
-- so the creative features a real rental item the brand actually stocks.
-- One safe query.

alter table batches
  add column if not exists category text,
  add column if not exists product_id uuid references products(id) on delete set null;
