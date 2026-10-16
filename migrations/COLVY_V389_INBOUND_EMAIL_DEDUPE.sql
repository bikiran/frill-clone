-- ============================================================
-- COLVY V389 — INBOUND EMAIL: one row per received email
--
-- The inbound email webhook (app/api/webhooks/email) records the Resend id of
-- every received email on its message:
--   messages.metadata -> 'inbound_email' ->> 'resend_email_id'
-- and answers a repeated delivery before doing anything (lib code). This
-- partial unique index is the backstop for two deliveries arriving at the same
-- moment: the second insert fails with 23505 and the webhook treats it as a
-- duplicate. Only rows that carry the id are indexed, so the index is tiny and
-- every other message is untouched.
--
-- No new table, no change to access (messages keeps its RLS as is).
--
-- Timing: any time, before or after deploying the code. Before it runs the
-- code still dedupes; it just has no database backstop for a simultaneous
-- double delivery.
--
-- How to run: on its own (CONCURRENTLY can't run inside a transaction block),
-- e.g. paste just this file into the Supabase SQL editor. It doesn't lock
-- messages against writes while it builds.
--
-- Idempotent: IF NOT EXISTS, safe to run more than once. If it ever fails
-- because two rows share an id, list them with
--   SELECT metadata->'inbound_email'->>'resend_email_id' AS id, count(*)
--     FROM messages WHERE metadata->'inbound_email'->>'resend_email_id' IS NOT NULL
--    GROUP BY 1 HAVING count(*) > 1;
-- delete the extra copies, DROP INDEX IF EXISTS messages_resend_email_id_uniq
-- (a failed concurrent build leaves an invalid index) and run this again.
--
-- Rollback:
--   DROP INDEX IF EXISTS messages_resend_email_id_uniq;
-- ============================================================

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS messages_resend_email_id_uniq
  ON messages ((metadata -> 'inbound_email' ->> 'resend_email_id'))
  WHERE (metadata -> 'inbound_email' ->> 'resend_email_id') IS NOT NULL;
