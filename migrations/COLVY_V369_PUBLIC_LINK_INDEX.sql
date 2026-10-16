-- ============================================================
-- COLVY V369 — INDEX FOR A BUSINESS'S REEL / QR / BIO LINKS
--
-- Link Reports' Social & QR tab looks up "this business's public links" (the
-- ones made in the Links Generator for a Reel, a post, a QR poster…) on every
-- load: short_links where company_id = … and channel in ('instagram_reel',
-- 'qr', …). short_links also holds one row per SMS / campaign recipient, so a
-- business that sends campaigns has thousands of links and only a handful of
-- public ones. Until this index exists, that lookup reads every one of the
-- business's links on every Link Reports load — fine for a small account, slow
-- for a big one. Run it before big accounts use Link Reports much.
--
-- HOW TO RUN
-- CREATE INDEX CONCURRENTLY builds without blocking writes. A plain CREATE
-- INDEX would hold up every update to short_links while it builds — including
-- the click counter each tracked-link redirect bumps, so every /l/ link for
-- every business would hang. CONCURRENTLY cannot run inside a transaction
-- block, so in the Supabase SQL editor run the statement ON ITS OWN
-- (highlight it, Run). Needs short_links.channel (V189). Safe to re-run.
-- ============================================================

create index concurrently if not exists idx_short_links_company_channel
  on public.short_links (company_id, channel);

-- Confirm (one row, indisvalid = true):
--   select c.relname, i.indisvalid
--     from pg_index i join pg_class c on c.oid = i.indexrelid
--    where c.relname = 'idx_short_links_company_channel';
-- If it shows indisvalid = false (a concurrent build was interrupted), drop it
-- with DROP INDEX CONCURRENTLY idx_short_links_company_channel; and run the
-- CREATE again.
