-- ============================================================
-- COLVY V381 — WAITLIST ENTRIES ADDED BY AI
--
-- The AI agents (Support, Sales) can now add a customer who asks "let me know
-- when it's back" to the back-in-stock waitlist themselves, and staff can ask
-- Colvy AI to do it ("add Thi to the waitlist for the bristlenose"). The
-- Waitlists page marks those entries "Added by AI", says who added them and
-- links to the run that did it ("Why?").
--
-- stock_waitlist.source gains two values (it is plain text, nothing to alter):
--   ai_agent  — an AI agent added them from a conversation
--   colvy_ai  — Colvy AI added them when a team member asked
--
-- New nullable columns:
--   stock_waitlist.agent_run_id  uuid  the agent run that added them (agent_runs.id)
--   stock_waitlist.added_by      text  who, in words: "Colvy AI (Support Agent)",
--                                      "Colvy AI (requested by Sam)"
--
-- plus an index for the "Added by AI" filter. Existing rows keep NULL and their
-- source. Until this runs, AI-added entries are still saved (without the two
-- columns) and still show as added by AI from their source.
--
-- Run in the Supabase SQL editor. Safe to re-run.
-- ============================================================

ALTER TABLE stock_waitlist ADD COLUMN IF NOT EXISTS agent_run_id UUID;
ALTER TABLE stock_waitlist ADD COLUMN IF NOT EXISTS added_by TEXT;
CREATE INDEX IF NOT EXISTS idx_waitlist_company_source ON stock_waitlist(company_id, source);

NOTIFY pgrst, 'reload schema';
