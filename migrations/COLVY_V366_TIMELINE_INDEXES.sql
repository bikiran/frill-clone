-- ============================================================
-- COLVY V366 — INDEXES FOR THE CUSTOMER TIMELINE
--
-- The customer timeline (customer profile, the Contacts drawer's History, the
-- inbox's "Customer timeline") now pulls one customer's bookings, tickets,
-- contact-form submissions, recorded sales, calls, media requests and AI agent
-- actions. Each of those is looked up by the customer's contact_id (and some
-- by their conversation_id), but none of those columns had an index, so every
-- timeline load scanned each whole table. (Tracked links already have one:
-- idx_short_links_contact from V192.)
--
-- These indexes let the database jump straight to one customer's rows. Each
-- one is only created when its table and column exist in this database (some
-- features' migrations may not have been run yet), so nothing here can fail
-- part-way.
--
-- Only adds indexes: no data changes. Building them takes a moment on a big
-- table and briefly holds up writes to it, so run it at a quiet time.
--
-- Run in the Supabase SQL editor. Safe to re-run.
-- ============================================================

DO $$
DECLARE
  ix RECORD;
BEGIN
  FOR ix IN
    SELECT * FROM (VALUES
      ('bookings',                 'contact_id',      'idx_bookings_contact'),
      ('bookings',                 'conversation_id', 'idx_bookings_conversation'),
      ('support_tickets',          'contact_id',      'idx_support_tickets_contact'),
      ('contact_form_submissions', 'contact_id',      'idx_contact_form_submissions_contact'),
      ('contact_form_submissions', 'conversation_id', 'idx_contact_form_submissions_conversation'),
      ('conversation_sales',       'contact_id',      'idx_conversation_sales_contact'),
      ('calls',                    'contact_id',      'idx_calls_contact'),
      ('media_requests',           'contact_id',      'idx_media_requests_contact'),
      ('media_requests',           'conversation_id', 'idx_media_requests_conversation'),
      ('agent_runs',               'contact_id',      'idx_agent_runs_contact')
    ) AS t(tbl, col, name)
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = ix.tbl AND column_name = ix.col
    ) THEN
      -- Partial: most rows of some of these tables have no contact, and those
      -- are never looked up this way.
      EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (%I) WHERE %I IS NOT NULL', ix.name, ix.tbl, ix.col, ix.col);
    ELSE
      RAISE NOTICE 'Skipped %: %.% is not in this database', ix.name, ix.tbl, ix.col;
    END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

-- ── Check ───────────────────────────────────────────────────────────────────
-- One row per index created (fewer if a feature's table isn't set up yet).
SELECT tablename, indexname
  FROM pg_indexes
 WHERE schemaname = 'public'
   AND indexname IN ('idx_bookings_contact', 'idx_bookings_conversation', 'idx_support_tickets_contact',
                     'idx_contact_form_submissions_contact', 'idx_contact_form_submissions_conversation',
                     'idx_conversation_sales_contact', 'idx_calls_contact', 'idx_media_requests_contact',
                     'idx_media_requests_conversation', 'idx_agent_runs_contact')
 ORDER BY tablename, indexname;
