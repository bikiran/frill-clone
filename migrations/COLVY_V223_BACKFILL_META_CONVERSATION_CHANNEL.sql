-- ============================================================
-- COLVY V223 — RELABEL THREADS THE SMS WEBHOOK TOOK OVER
--
-- Until the Meta webhook fix, an inbound text set conversations.channel to
-- 'sms' and an inbound DM never set it back. Threads that have been on
-- Messenger or Instagram ever since still carry 'sms', which is what the inbox
-- list badge reads — it does not load messages, so it cannot derive anything
-- better than the stored field.
--
-- The webhook fix stops this happening again, but only relabels a thread when
-- the NEXT DM arrives. This relabels the ones already wrong.
--
-- Only conversations whose newest INBOUND message came over Meta are touched.
-- A thread whose newest inbound is a text is genuinely an SMS thread and is
-- left alone. Outbound messages are ignored: our own past sends are exactly
-- what was wrong.
--
-- Run in the Supabase SQL editor. Safe to re-run — it is idempotent, and a
-- second run touches nothing.
-- ============================================================

-- PREVIEW FIRST. Check this looks right before running the UPDATE below.
WITH newest_inbound AS (
  SELECT DISTINCT ON (conversation_id)
         conversation_id, lower(delivery_channel) AS dc
    FROM messages
   WHERE sender_type = 'visitor' AND delivery_channel IS NOT NULL
   ORDER BY conversation_id, created_at DESC
)
SELECT c.id, c.channel AS current_label, n.dc AS should_be, c.last_message_at
  FROM conversations c
  JOIN newest_inbound n ON n.conversation_id = c.id
 WHERE n.dc IN ('facebook', 'instagram')
   AND c.channel IS DISTINCT FROM n.dc
 ORDER BY c.last_message_at DESC;

-- THE FIX.
WITH newest_inbound AS (
  SELECT DISTINCT ON (conversation_id)
         conversation_id, lower(delivery_channel) AS dc
    FROM messages
   WHERE sender_type = 'visitor' AND delivery_channel IS NOT NULL
   ORDER BY conversation_id, created_at DESC
)
UPDATE conversations c
   SET channel = n.dc
  FROM newest_inbound n
 WHERE n.conversation_id = c.id
   AND n.dc IN ('facebook', 'instagram')
   AND c.channel IS DISTINCT FROM n.dc;
