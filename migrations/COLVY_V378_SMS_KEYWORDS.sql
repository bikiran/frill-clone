-- ============================================================
-- COLVY V378 — SMS KEYWORDS (STOP / START) BY NUMBER
--
-- Every STOP or START word a customer texts the business, by company and
-- number (last 9 digits, like contacts.phone_norm), with the keyword already
-- normalised ("S T O P", "Stop.", "please stop" are all STOP). Before any
-- automated text Colvy reads the newest STOP and START for the number from
-- here (one row each through the index), so a STOP that never reached a
-- contact still stops texts. lib/sms-consent writes a row as each keyword
-- text arrives.
--
-- The backfill copies keyword texts already in the message history (inbound
-- SMS whose whole text is a keyword). Until this runs, Colvy reads the
-- number's own conversations instead, which is slower.
--
-- Server only (service role): RLS on, no policies. Run in the Supabase SQL
-- editor. Safe to re-run: the table and index are created only if missing,
-- and the backfill skips texts it already copied.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS sms_keywords (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  phone_norm TEXT NOT NULL,                  -- last 9 digits of the sender
  keyword TEXT NOT NULL,                     -- STOP, START, YES, … (normalised)
  message_id UUID,                           -- the text it came from (backfilled rows)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sms_keywords_company_phone_created
  ON sms_keywords (company_id, phone_norm, created_at DESC);

-- One row per backfilled text (rows written as texts arrive have no message_id;
-- NULLs never clash in a unique index).
CREATE UNIQUE INDEX IF NOT EXISTS idx_sms_keywords_message
  ON sms_keywords (message_id);

ALTER TABLE sms_keywords ENABLE ROW LEVEL SECURITY;

-- Backfill. Texts newer than the first row written on arrival are already
-- recorded, so a re-run only looks at older history.
INSERT INTO sms_keywords (company_id, phone_norm, keyword, message_id, created_at)
SELECT m.company_id,
       RIGHT(REGEXP_REPLACE(m.sender_name, '\D', '', 'g'), 9),
       CASE WHEN k.letters IN ('PLEASESTOP', 'STOPPLEASE', 'STOPTEXTING', 'STOPTEXTINGME', 'PLEASESTOPTEXTINGME',
                               'STOPMESSAGING', 'STOPMESSAGINGME', 'PLEASESTOPMESSAGINGME', 'STOPSENDINGMETEXTS',
                               'UNSUBSCRIBEME', 'OPTMEOUT')
            THEN 'STOP' ELSE k.letters END,
       m.id,
       m.created_at
FROM messages m
CROSS JOIN LATERAL (
  SELECT UPPER(REGEXP_REPLACE(NORMALIZE(m.content, NFKC), '[^A-Za-z]', '', 'g')) AS letters
) k
WHERE m.sender_type = 'visitor'
  AND m.delivery_channel = 'sms'
  AND m.company_id IS NOT NULL
  AND LENGTH(m.content) <= 60
  AND LENGTH(REGEXP_REPLACE(COALESCE(m.sender_name, ''), '\D', '', 'g')) >= 8
  AND k.letters IN ('STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT', 'OPTOUT', 'REVOKE',
                    'START', 'SUBSCRIBE', 'YES', 'OPTIN', 'UNSTOP',
                    'PLEASESTOP', 'STOPPLEASE', 'STOPTEXTING', 'STOPTEXTINGME', 'PLEASESTOPTEXTINGME',
                    'STOPMESSAGING', 'STOPMESSAGINGME', 'PLEASESTOPMESSAGINGME', 'STOPSENDINGMETEXTS',
                    'UNSUBSCRIBEME', 'OPTMEOUT')
  AND m.created_at < COALESCE((SELECT MIN(s.created_at) FROM sms_keywords s WHERE s.message_id IS NULL), 'infinity'::timestamptz)
ON CONFLICT (message_id) DO NOTHING;

COMMIT;

NOTIFY pgrst, 'reload schema';
