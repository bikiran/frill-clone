-- COLVY V417 — conversation protection
--
-- Colvy now holds back inbound messages that look like spam or inappropriate
-- content (lib/conversation-protection): hidden behind "Review message" in the
-- inbox, no automatic replies, no message text in notifications, obvious spam
-- moved to Spam. When a team member says "Not spam", the customer is trusted
-- from then on so their messages are never held back again: that's this
-- column. Before it runs, "Not spam" still clears the message; the next one
-- from that customer is simply checked as usual.
--
-- The verdict itself lives on the message (messages.metadata.protection), so
-- nothing else is needed. Safe to run more than once.

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS trusted_at TIMESTAMPTZ;
