-- Conference recording for device handoff + warm transfer.
--
-- When a live call is promoted into a Twilio Conference (to hand it to another
-- device, or to warm-transfer it), the original <Dial record> stops — so audio
-- after that point was never recorded, and the transcript/AI summary missed it.
-- We now record the conference too and keep it as a SECOND recording alongside
-- the pre-conference one; the transcriber stitches both together.

ALTER TABLE calls ADD COLUMN IF NOT EXISTS conference_recording_url TEXT;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS conference_recording_duration INT;
