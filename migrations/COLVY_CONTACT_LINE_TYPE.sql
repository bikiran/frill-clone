-- Remember whether a contact's number can receive a text.
--
-- Forwarding an attachment to a landline failed at the carrier, after a full
-- round trip, with wording that never said the number was a landline. The
-- provider can answer that question directly, but it is a paid lookup per
-- number, so the answer is cached here and re-used.
--
-- line_type is the carrier's own classification, stored verbatim: usually
-- 'mobile', 'landline' or 'voip', and null when it has never been looked up.
-- Only 'landline' is treated as "cannot receive a text"; an unknown or missing
-- value always falls through to trying the send, so a lookup that fails or a
-- classification we have not seen before can never stop a message going out.
--
-- Run once in the Supabase SQL editor. Idempotent.

alter table contacts add column if not exists line_type text;
alter table contacts add column if not exists line_type_checked_at timestamptz;

-- Only rows that have been checked are ever read back, and always by contact id.
create index if not exists contacts_line_type_checked
  on contacts (id) where line_type is not null;

notify pgrst, 'reload schema';
