-- Track which authenticated Colvy user played a call recording, so a recording
-- card can show "N listeners · M plays · Last played by <name> · <ago>" and, if a
-- customer complaint comes up, you can see exactly who listened and when.
CREATE TABLE IF NOT EXISTS call_recording_plays (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id     uuid NOT NULL,
  company_id  uuid,
  user_id     uuid,
  user_name   text,
  played_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crp_call_played ON call_recording_plays(call_id, played_at DESC);
CREATE INDEX IF NOT EXISTS idx_crp_company     ON call_recording_plays(company_id);

ALTER TABLE call_recording_plays ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can record recording plays" ON call_recording_plays;
CREATE POLICY "Anyone can record recording plays" ON call_recording_plays FOR ALL USING (true) WITH CHECK (true);
