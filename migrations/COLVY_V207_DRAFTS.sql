-- ============================================================
-- COLVY V207 — DRAFTS
--
-- Saves half-written messages, tasks and events per team member so they can
-- come back and finish later. Drafts are personal: one row per user per thing
-- being drafted.
--
-- `ref_id` is NOT NULL with an empty-string default rather than nullable, so
-- the unique constraint is a plain one — partial unique indexes don't play
-- nicely with upserts.
--
-- Run in the Supabase SQL editor. Safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS drafts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID REFERENCES companies(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL,
  kind        TEXT NOT NULL,               -- message | task | event
  ref_id      TEXT NOT NULL DEFAULT '',    -- conversation id for messages; '' for a new task
  content     JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS drafts_owner_uniq
  ON drafts (user_id, kind, ref_id);
CREATE INDEX IF NOT EXISTS idx_drafts_user
  ON drafts (user_id, updated_at DESC);

ALTER TABLE drafts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can manage drafts" ON drafts;
CREATE POLICY "Anyone can manage drafts" ON drafts FOR ALL USING (true);

NOTIFY pgrst, 'reload schema';
