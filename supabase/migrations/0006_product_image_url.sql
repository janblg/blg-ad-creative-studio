-- Phase 4d: product photos.
--
-- ERS DOES serve item photos server-side — an earlier pass missed them only
-- because the CDN URLs are protocol-relative (`//files.sysers.com/...`) and the
-- matcher required `https://`. The card links the `/items/med/` thumbnail; the
-- same file exists un-prefixed at full size, which is what gets stored.
--
-- The remote URL is kept rather than downloading every image at import time:
-- a catalog can be 400 items, and the photo is only needed when a product is
-- actually chosen for an ad (then it is fetched, normalized and stored).
alter table products
  add column if not exists image_url text;
