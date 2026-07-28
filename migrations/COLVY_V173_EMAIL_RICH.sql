-- ============================================================
-- COLVY V173 — RICH EMAIL (Coax-style display + composer)
--
-- Emails were flattened to a single stripped-text `content` field,
-- so the inbox couldn't show a proper email card (From/To/Cc,
-- subject, full HTML, quoted history). These columns keep the full
-- email alongside the readable preview.
--
-- Run in the Supabase SQL editor. Safe to re-run.
-- ============================================================

ALTER TABLE messages ADD COLUMN IF NOT EXISTS email_from TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS email_to TEXT;      -- comma-separated
ALTER TABLE messages ADD COLUMN IF NOT EXISTS email_cc TEXT;      -- comma-separated
ALTER TABLE messages ADD COLUMN IF NOT EXISTS email_subject TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS email_html TEXT;    -- sanitised full body
ALTER TABLE messages ADD COLUMN IF NOT EXISTS email_quoted TEXT;  -- the trimmed quoted history
ALTER TABLE messages ADD COLUMN IF NOT EXISTS email_attachments JSONB DEFAULT '[]'::jsonb;

-- Per-mailbox signature, appended to outgoing email.
ALTER TABLE email_channels ADD COLUMN IF NOT EXISTS signature TEXT;

NOTIFY pgrst, 'reload schema';
