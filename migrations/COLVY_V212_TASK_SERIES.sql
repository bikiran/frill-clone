-- V212 — Task series id.
--
-- Recurring tasks pre-generate a set of dated occurrences (see V211). This adds a
-- shared series_id to every occurrence in a series, so editing/deleting can be
-- scoped to "this card", "this and following cards", or "all cards".
--
-- Nullable and safe to re-run. Non-recurring tasks leave it NULL (a series of one).

ALTER TABLE conversation_tasks ADD COLUMN IF NOT EXISTS series_id UUID;

CREATE INDEX IF NOT EXISTS idx_conversation_tasks_series ON conversation_tasks(series_id);
