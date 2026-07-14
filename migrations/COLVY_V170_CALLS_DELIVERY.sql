-- ============================================================
-- COLVY V170 — CALL RECORDING / TRANSCRIPTION / AI, DELIVERY FIELDS,
--               AND A CLEAN CALL TIMELINE
--
-- 1. Extra columns on `calls` for the Coax-style call card.
-- 2. A `call-recordings` storage bucket.
-- 3. Scheduled delivery + delivery status on `contacts`.
-- 4. Purges the "Call not connected" spam already in the timeline.
--
-- Run in the Supabase SQL editor. Safe to re-run.
-- ============================================================

-- ── 1. Calls ────────────────────────────────────────────────
-- (recording_url, transcription, ai_summary already exist from V115.)
ALTER TABLE calls ADD COLUMN IF NOT EXISTS ai_todos JSONB DEFAULT '[]'::jsonb;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS sentiment TEXT;            -- positive | neutral | negative
ALTER TABLE calls ADD COLUMN IF NOT EXISTS cause TEXT;                -- Telnyx hangup cause
ALTER TABLE calls ADD COLUMN IF NOT EXISTS recording_duration INT;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS transcript_segments JSONB; -- [{speaker, text, start}]
ALTER TABLE calls ADD COLUMN IF NOT EXISTS answered_by TEXT;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS recording_error TEXT;   -- why a recording failed, instead of silence

-- ── 2. Recording storage ────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('call-recordings', 'call-recordings', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Anyone can manage call recordings" ON storage.objects;
CREATE POLICY "Anyone can manage call recordings" ON storage.objects
  FOR ALL USING (bucket_id = 'call-recordings') WITH CHECK (bucket_id = 'call-recordings');

-- ── 3. Delivery fields on contacts (Coax-style sidebar) ─────
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS scheduled_delivery DATE;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS delivery_status TEXT;   -- pending | scheduled | out_for_delivery | delivered | failed

-- ── 4. Clean up the timeline ────────────────────────────────
-- Every failed call attempt posted its own "Call not connected" system
-- message, so a handful of retries buried the actual conversation under
-- dozens of grey pills. Those attempts live in the `calls` table (and now
-- in Recent Calls), so they don't belong in the chat at all. Delete them.
DELETE FROM messages
WHERE sender_type = 'system'
  AND content LIKE '%Call not connected%';

-- Going forward the app only posts a message for calls that CONNECTED,
-- and it posts a rich call card (recording + transcript + AI summary).

NOTIFY pgrst, 'reload schema';
