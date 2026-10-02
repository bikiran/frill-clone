-- ============================================================
-- COLVY V325 — ASSIGN IDEAS TO A TEAM MEMBER
--
-- The idea panel's "Assign" showed three placeholder names and saved
-- nothing. Ideas now record who they're assigned to: the user id (so the
-- assignee can be notified and filtered on) plus the name at the time.
--
-- Also drops the waving-hand emoji from the sample "Welcome to …!" idea
-- that new workspaces were seeded with.
--
-- Run in the Supabase SQL editor. Safe to re-run.
-- ============================================================

ALTER TABLE ideas ADD COLUMN IF NOT EXISTS assigned_to_id   UUID;
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS assigned_to_name TEXT;

CREATE INDEX IF NOT EXISTS idx_ideas_assignee
  ON ideas (assigned_to_id)
  WHERE assigned_to_id IS NOT NULL;

UPDATE ideas
   SET title = regexp_replace(title, '\s*👋\s*$', '')
 WHERE title LIKE 'Welcome to %👋';

NOTIFY pgrst, 'reload schema';
