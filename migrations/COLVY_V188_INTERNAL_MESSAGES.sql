-- ============================================================
-- COLVY V188 — INTERNAL STAFF-ONLY MESSAGES + @MENTIONS
--
-- Lets staff post a message inside the conversation timeline that the customer
-- never receives (never sent over SMS / live chat / email). Rendered distinctly
-- in the thread so agents can read it in sequence with the real conversation.
-- Supports @mentioning team members, who get notified.
--
-- Run in the Supabase SQL editor. Safe to re-run.
-- ============================================================

-- Flag a message as internal (staff-only). Default false = normal customer
-- message, so every existing row keeps its current behaviour.
ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_internal BOOLEAN NOT NULL DEFAULT FALSE;

-- Team member user_ids mentioned in this message (for notifications/filtering).
ALTER TABLE messages ADD COLUMN IF NOT EXISTS mentions JSONB DEFAULT '[]'::jsonb;

-- Fast "internal notes in this conversation" lookups.
CREATE INDEX IF NOT EXISTS idx_messages_conversation_internal
  ON messages (conversation_id, is_internal);

-- ── Mention notifications ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mention_notifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL,
  conversation_id UUID NOT NULL,
  message_id      UUID,
  mentioned_user  UUID NOT NULL,        -- team_members.user_id
  mentioned_by    TEXT,                 -- display name of the author
  preview         TEXT,                 -- short excerpt of the note
  is_read         BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mention_notifications_user
  ON mention_notifications (mentioned_user, is_read, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_mention_notifications_company
  ON mention_notifications (company_id, created_at DESC);

ALTER TABLE mention_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mention_notifications_all ON mention_notifications;
CREATE POLICY mention_notifications_all ON mention_notifications
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

NOTIFY pgrst, 'reload schema';
