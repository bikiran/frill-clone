-- ============================================================
-- COLVY V126 — CALL DIAGNOSTICS
-- Adds a 'cause' column so we can see WHY a call ended
-- (e.g. CALL_REJECTED, USER_BUSY, outbound routing errors).
-- Single step, safe to re-run.
-- ============================================================

ALTER TABLE calls ADD COLUMN IF NOT EXISTS cause TEXT;

NOTIFY pgrst, 'reload schema';
