-- ============================================================
-- COLVY V269 — FIX CROSS-TENANT INBOUND LEAK (stale integration numbers)
--
-- Inbound calls/SMS resolved the owning company from
-- <provider>_integrations.phone_number — a single "first number" column that
-- goes stale when a number is added or reassigned (nothing repoints the old
-- owner). A number now owned by company B, still sitting in company A's
-- integration row, routed B's inbound events into A's inbox.
--
-- The code fix now resolves the tenant from the authoritative phone_numbers
-- table first. This migration removes the stale mapping that fed the legacy
-- fallback, so it can never leak again: for any integration whose phone_number
-- is owned by a DIFFERENT company in phone_numbers, clear that column. Correct
-- rows (where phone_numbers agrees, or the number isn't in phone_numbers) are
-- left untouched. Safe to re-run.
-- ============================================================

-- 1) DIAGNOSTIC (read-only) — run first to see the mismatches this will fix:
--
-- SELECT 'telnyx' AS provider, ti.company_id AS integration_company,
--        ti.phone_number, pn.company_id AS phone_numbers_owner
--   FROM telnyx_integrations ti
--   JOIN phone_numbers pn ON pn.phone_number = ti.phone_number
--  WHERE pn.company_id <> ti.company_id
-- UNION ALL
-- SELECT 'twilio', ti.company_id, ti.phone_number, pn.company_id
--   FROM twilio_integrations ti
--   JOIN phone_numbers pn ON pn.phone_number = ti.phone_number
--  WHERE pn.company_id <> ti.company_id;

-- 2) Clear the stale, cross-owned integration numbers.
UPDATE telnyx_integrations ti
   SET phone_number = NULL
 WHERE ti.phone_number IS NOT NULL
   AND EXISTS (
     SELECT 1 FROM phone_numbers pn
      WHERE pn.phone_number = ti.phone_number
        AND pn.company_id <> ti.company_id
   );

UPDATE twilio_integrations ti
   SET phone_number = NULL
 WHERE ti.phone_number IS NOT NULL
   AND EXISTS (
     SELECT 1 FROM phone_numbers pn
      WHERE pn.phone_number = ti.phone_number
        AND pn.company_id <> ti.company_id
   );

-- NOTE — already-leaked rows: conversations/calls/messages that were WRITTEN with
-- the wrong company_id before this fix stay in the wrong inbox until moved. Do
-- NOT bulk-reassign blindly. Identify them per leaked number, e.g.:
--   SELECT id, company_id, sms_number, last_message, created_at
--     FROM conversations
--    WHERE sms_number = '<the number's counterpart>' ...
-- and reassign only after confirming the correct owner. Ask before running a
-- data move.

NOTIFY pgrst, 'reload schema';
