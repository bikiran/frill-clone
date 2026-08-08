-- ============================================================
-- COLVY V236 — NOTES COLLABORATION
-- Adds per-member sharing, a discussion/notes thread for shared viewers, and an
-- edit log recording which visitor changed a shared note and when.
--   shared_members : jsonb array of { id, name } the owner shared the note with
--                    (in addition to the team-wide shared_with_team flag)
--   comments       : jsonb array of { id, name, email, body, at }
--   edit_log       : jsonb array of { name, email, at } visitor edits
-- Additive and safe to re-run.
-- ============================================================

ALTER TABLE notes ADD COLUMN IF NOT EXISTS shared_members jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE notes ADD COLUMN IF NOT EXISTS comments jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE notes ADD COLUMN IF NOT EXISTS edit_log jsonb NOT NULL DEFAULT '[]'::jsonb;

NOTIFY pgrst, 'reload schema';
