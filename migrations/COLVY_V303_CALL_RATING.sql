-- ============================================================
-- COLVY V303 — CALL RATING (post-call thumbs up/down)
--
-- The web call panel shows a brief review card when a call ends. This stores
-- the agent's 👍/👎 on the calls row so call quality can be reviewed later.
--
-- Run in the Supabase SQL editor. Safe to re-run.
-- ============================================================

ALTER TABLE calls ADD COLUMN IF NOT EXISTS rating            SMALLINT;   -- 1 = good, -1 = bad
ALTER TABLE calls ADD COLUMN IF NOT EXISTS rating_by_user_id TEXT;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS rating_at         TIMESTAMPTZ;

NOTIFY pgrst, 'reload schema';
