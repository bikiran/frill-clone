-- ============================================================
-- COLVY V360 — UPLOAD-LINK AUTO-REPLY FOR PICTURE-MESSAGE VIDEOS
--
-- Settings → Automatic replies → "Ask for the original video" texts a
-- customer an upload link when their video arrives squeezed by the carrier.
-- This column records when that reply last went out on a conversation, so
-- several clips sent as separate texts a second apart get one link, not one
-- each (the update that sets it is the claim).
--
-- Run in the Supabase SQL editor. Safe to re-run.
-- ============================================================

ALTER TABLE conversations ADD COLUMN IF NOT EXISTS media_upload_reply_at TIMESTAMPTZ;

NOTIFY pgrst, 'reload schema';
