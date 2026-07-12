-- ============================================================
-- COLVY V158 — ACTIVE CHANNEL, SNOOZE, WAITING TIME
-- Tracks which channel a conversation is currently being handled on
-- (so the timeline can say "Now chatting through SMS"), supports
-- snoozing a conversation, and lets us surface long waits.
-- Safe to re-run.
-- ============================================================

-- Which channel the agent is currently replying through.
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS active_channel TEXT;

-- Snooze: hide from the open list until this time.
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS snoozed_until TIMESTAMPTZ;

-- When the customer last sent a message, so we can show how long they've been
-- waiting for a reply. Maintained by the app on inbound messages.
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS last_customer_message_at TIMESTAMPTZ;

-- Backfill from existing messages so waiting times are accurate immediately.
UPDATE conversations c
SET last_customer_message_at = sub.last_at
FROM (
  SELECT conversation_id, MAX(created_at) AS last_at
  FROM messages
  WHERE sender_type = 'visitor'
  GROUP BY conversation_id
) sub
WHERE sub.conversation_id = c.id
  AND c.last_customer_message_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_conv_snoozed ON conversations(company_id, snoozed_until);

NOTIFY pgrst, 'reload schema';
