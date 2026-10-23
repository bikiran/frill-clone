-- COLVY V413 — one row per Instagram / Messenger message
--
-- Meta delivers webhooks at least once, and an Instagram account connected two
-- ways (Instagram login and a linked Facebook Page) can receive each message
-- twice, sometimes at the same moment. The webhook checked for the message id
-- before inserting, but two copies arriving together both passed the check, so
-- the inbox showed the customer's message twice.
--
-- 1. Remove the copies already saved, keeping the first one of each.
-- 2. A unique index on meta_message_id, so a racing second copy is refused
--    (app/api/meta/webhook skips it quietly).
--
-- Safe to run more than once.

-- 1. Duplicates: same Meta message id, keep the earliest row.
WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY meta_message_id ORDER BY created_at ASC, id ASC) AS n
  FROM messages
  WHERE meta_message_id IS NOT NULL
)
DELETE FROM messages m
USING ranked r
WHERE m.id = r.id AND r.n > 1;

-- 2. One row per Meta message id from now on.
CREATE UNIQUE INDEX IF NOT EXISTS messages_meta_message_id_key
  ON messages (meta_message_id)
  WHERE meta_message_id IS NOT NULL;

-- Check: should return no rows.
-- SELECT meta_message_id, count(*) FROM messages WHERE meta_message_id IS NOT NULL GROUP BY 1 HAVING count(*) > 1;
