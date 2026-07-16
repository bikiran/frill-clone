-- ============================================================
-- COLVY V179 — PER-LOCATION CONTENT TARGETING
--
-- Announcements, ideas, roadmap items and help articles can each be
-- either company-wide (shown at every location) or targeted to one or
-- more specific outlets. Modelled as a location_ids UUID[] column:
--   NULL or empty  → all locations (company-wide, the default)
--   [uuid, ...]    → only those outlets
--
-- Starting with announcements; the others use the same column so the
-- app code and filter logic are identical across content types.
--
-- Run in the Supabase SQL editor. Safe to re-run.
-- ============================================================

ALTER TABLE announcements  ADD COLUMN IF NOT EXISTS location_ids UUID[];
ALTER TABLE ideas          ADD COLUMN IF NOT EXISTS location_ids UUID[];
ALTER TABLE help_articles  ADD COLUMN IF NOT EXISTS location_ids UUID[];

NOTIFY pgrst, 'reload schema';
