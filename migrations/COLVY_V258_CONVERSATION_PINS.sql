-- ============================================================
-- COLVY V258 — PER-USER CONVERSATION PINS
-- Lets each agent pin conversations to the top of their inbox. Pins are
-- per-user (keyed on user_id + conversation_id), so two agents on the same
-- company can pin different chats without affecting each other.
-- Additive and safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS conversation_pins (
  user_id         text NOT NULL,
  conversation_id text NOT NULL,
  company_id      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, conversation_id)
);

CREATE INDEX IF NOT EXISTS conversation_pins_user_idx ON conversation_pins (user_id, company_id);

NOTIFY pgrst, 'reload schema';
