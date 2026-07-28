-- ============================================================
-- COLVY V172 — LIVE PAGE PRESENCE
--
-- The "Currently on: <page>" banner showed the last page a visitor
-- touched, with no notion of WHEN — so a page someone left days ago
-- looked identical to one they're reading right now (which is the
-- wrong data that kept appearing on SMS/order threads).
--
-- The widget now heartbeats this timestamp every 60s while the
-- visitor's tab is open; the inbox only shows the banner when it's
-- fresh (< 2 min). Stale ⇒ they've left ⇒ it falls back to history.
--
-- Run in the Supabase SQL editor. Safe to re-run.
-- ============================================================

ALTER TABLE conversations ADD COLUMN IF NOT EXISTS page_seen_at TIMESTAMPTZ;

NOTIFY pgrst, 'reload schema';
