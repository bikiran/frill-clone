-- ============================================================
-- COLVY V227 — TASKS: MULTIPLE OUTLETS
-- A task can now involve more than one outlet, matching calendar events. Store
-- the full set in location_ids; the existing location_id stays the primary for
-- backwards compatibility (filters still use it). Additive and safe to re-run.
-- ============================================================

ALTER TABLE conversation_tasks ADD COLUMN IF NOT EXISTS location_ids JSONB DEFAULT '[]'::jsonb;

NOTIFY pgrst, 'reload schema';
