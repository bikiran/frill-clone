-- ============================================================
-- COLVY V225 — CALENDAR EVENTS: MULTIPLE OUTLETS
-- A calendar event (delivery, appointment, booking, task) can now involve more
-- than one outlet. Store the full set in location_ids; the existing single
-- location_id is kept as the primary for backwards compatibility. Additive and
-- safe to re-run.
-- ============================================================

ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS location_ids JSONB DEFAULT '[]'::jsonb;

NOTIFY pgrst, 'reload schema';
