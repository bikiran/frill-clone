-- ============================================================
-- COLVY V312 — calls.ai_admin_review
--
-- Caches the admin-facing AI overview of a voice call (how it went + likely
-- technical/sound issues), generated in Call Diagnostics via
-- /api/platform-admin/call-review. Cached on the call row so re-opening a call
-- is instant and doesn't re-spend on the model.
--
--   ai_admin_review    : jsonb — { overview, quality, issues[], sound_quality, recommendation }
--   ai_admin_review_at : timestamptz — when it was generated
--
-- The agent's post-call thumbs rating (calls.rating / rating_by_user_id /
-- rating_at) is already present from COLVY_V303 and is shown alongside this.
--
-- Run in the Supabase SQL editor. Safe to re-run.
-- ============================================================

ALTER TABLE calls ADD COLUMN IF NOT EXISTS ai_admin_review    JSONB;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS ai_admin_review_at TIMESTAMPTZ;

NOTIFY pgrst, 'reload schema';
