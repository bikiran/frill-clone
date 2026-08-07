-- ============================================================
-- COLVY V235 — NOTES ARE PRIVATE BY DEFAULT
-- Notes belong to the user who created them (notes.created_by). They are private
-- to that user unless they opt to share with the team via this flag, in which
-- case teammates see the note in their own Notes list too.
-- Additive and safe to re-run.
-- ============================================================

ALTER TABLE notes ADD COLUMN IF NOT EXISTS shared_with_team BOOLEAN NOT NULL DEFAULT false;

NOTIFY pgrst, 'reload schema';
