-- COLVY V419 — call transcripts in three forms
--
-- A call that isn't all English (Nepali to start) is now written three ways,
-- line by line (lib/call-translate): its own script (`transcription`, as
-- before), the English translation (`transcript_en`, as before) and, new
-- here, the same words in Roman letters the way people type them on a phone
-- (`transcript_roman`). `transcript_meta` records which speech service heard
-- the call, whether English was mixed in, and the business's preferred view.
-- Per-line versions live in transcript_segments (roman, en beside text).
--
-- Before it runs, calls are still transcribed and translated; only the Roman
-- version and the metadata aren't kept. Safe to run more than once.

ALTER TABLE calls ADD COLUMN IF NOT EXISTS transcript_roman TEXT;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS transcript_meta  JSONB;
