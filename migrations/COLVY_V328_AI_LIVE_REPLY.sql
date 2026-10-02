-- ============================================================
-- COLVY V328 — WATCH COLVY AI REPLY, LIVE
--
-- While Colvy AI writes an automatic reply, the conversation says so; when
-- it's ready, the draft sits on the conversation for a few seconds with a
-- countdown, so anyone watching the inbox can send it now, edit it or cancel
-- it. The inbox already listens to conversation changes in realtime, so these
-- columns are all it needs.
--
-- Run in the Supabase SQL editor. Safe to re-run.
-- ============================================================

ALTER TABLE conversations ADD COLUMN IF NOT EXISTS ai_status        TEXT;         -- 'thinking' | 'pending' | null
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS ai_draft         TEXT;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS ai_draft_id      UUID;         -- one draft = one send, never two
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS ai_draft_send_at TIMESTAMPTZ;

NOTIFY pgrst, 'reload schema';
