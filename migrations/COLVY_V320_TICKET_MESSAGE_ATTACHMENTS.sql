-- COLVY_V320_TICKET_MESSAGE_ATTACHMENTS
-- Let ticket replies carry file attachments — so when a customer emails a file
-- (photo, PDF, receipt) in reply to a ticket, it's captured on the ticket
-- thread, not just dropped. Stored as a JSONB array of { url, name, type }.
-- Idempotent.

ALTER TABLE ticket_messages ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'::jsonb;

NOTIFY pgrst, 'reload schema';
