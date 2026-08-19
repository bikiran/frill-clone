-- ============================================================
-- COLVY V270 — CALL TRANSCRIPT TRANSLATION
-- Store the spoken language of a call recording (detected by Deepgram) and an
-- English translation of the transcript, so a non-English call can be read in
-- English with a "View original" toggle. `transcription` keeps the ORIGINAL
-- (native-language) transcript; `transcript_en` is the English translation
-- (NULL when the call was already English). Safe to re-run.
-- ============================================================

ALTER TABLE calls ADD COLUMN IF NOT EXISTS transcript_lang TEXT;   -- e.g. 'ne', 'english'
ALTER TABLE calls ADD COLUMN IF NOT EXISTS transcript_en   TEXT;   -- English translation

NOTIFY pgrst, 'reload schema';
