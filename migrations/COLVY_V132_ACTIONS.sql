-- ============================================================
-- COLVY V132 — CONVERSATION ACTIONS
-- Which inbox "+ Action" items a company has enabled. Also links
-- an action to a form (for form-based actions like DOA intake).
-- Safe to re-run.
-- ============================================================

-- Per-company enabled actions + config, e.g.
-- { "doa": {"enabled": true, "form_id": "..."}, "create_order": {"enabled": true}, ... }
ALTER TABLE companies ADD COLUMN IF NOT EXISTS conversation_actions JSONB;

NOTIFY pgrst, 'reload schema';
