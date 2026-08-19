-- ============================================================
-- COLVY V271 — INBOUND MESSAGE TRANSLATION
-- Store the detected language of an inbound message and its English translation,
-- so a non-English text shows "Translated · English / View original" in the
-- inbox. `content` stays the ORIGINAL; `translated_content` is the English
-- version (NULL when already English). `content_lang` is set once per message
-- (even to 'en'/'unknown') so we never re-check it. Safe to re-run.
-- ============================================================

ALTER TABLE messages ADD COLUMN IF NOT EXISTS content_lang       TEXT;   -- 'en', 'ne', 'unknown'…
ALTER TABLE messages ADD COLUMN IF NOT EXISTS translated_content TEXT;   -- English translation

NOTIFY pgrst, 'reload schema';
