-- ============================================================
-- COLVY V369 — INDEX FOR A BUSINESS'S REEL / QR / BIO LINKS
--
-- Link Reports' Social & QR tab looks up "this business's public links" (the
-- ones made in the Links Generator for a Reel, a post, a QR poster…) on every
-- load: short_links where company_id = … and channel in ('instagram_reel',
-- 'qr', …). short_links also holds one row per SMS / campaign recipient, so a
-- business that sends campaigns has thousands of links and only a handful of
-- public ones — and with no index on channel, that lookup read every one of
-- the business's links to find them. This index lets the database go straight
-- to them.
--
-- The page works without it (just more slowly), so it can be run at any time.
-- Only adds an index: no data changes. Building it briefly holds up new links
-- (campaign sends, the inbox) on a big table, so run it at a quiet time.
--
-- Run in the Supabase SQL editor. Safe to re-run.
-- ============================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'short_links' AND column_name = 'channel'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_short_links_company_channel ON public.short_links (company_id, channel);
    ANALYZE public.short_links;
  ELSE
    RAISE NOTICE 'Skipped idx_short_links_company_channel: short_links.channel is not in this database (run V189 first)';
  END IF;
END $$;

-- ── Check ───────────────────────────────────────────────────────────────────
-- Expect one row.
SELECT tablename, indexname
  FROM pg_indexes
 WHERE schemaname = 'public'
   AND indexname = 'idx_short_links_company_channel';
