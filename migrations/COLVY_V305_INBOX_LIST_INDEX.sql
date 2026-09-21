-- ============================================================
-- COLVY V305 — INBOX LIST INDEX
--
-- The inbox conversation list reads:
--   from conversations where company_id = ? [and status filter]
--   order by last_message_at desc limit 50
--
-- conversations was indexed on (company_id, updated_at) and (company_id, status)
-- but NOT on (company_id, last_message_at) — the column the list actually sorts
-- by — so the query sorted the whole per-company set on every load. This adds
-- the matching index so the list is served straight from it.
--
-- (messages(conversation_id, created_at) and contacts(company_id, phone) indexes
-- already exist, so the per-thread message load and phone lookups are covered.)
--
-- Run in the Supabase SQL editor. Safe to re-run.
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_conversations_company_last_msg
  ON conversations (company_id, last_message_at DESC);

NOTIFY pgrst, 'reload schema';
