-- ============================================================
-- COLVY V204 — CONTACT RELATIONSHIP TYPE
--
-- Contacts can now be added by hand (source = 'manual') and classified by
-- relationship — customer / supplier / wholesaler / business — so the CRM holds
-- more than just shoppers. Non-customers are excluded from marketing by default.
--
-- The `source` column already exists (V197); manual contacts just set it to
-- 'manual'. This adds the relationship type.
--
-- Run in the Supabase SQL editor. Safe to re-run.
-- ============================================================

-- customer | supplier | wholesaler | business
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS relationship_type TEXT DEFAULT 'customer';

-- Make sure the columns manual entry relies on exist (older schemas).
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS source                 TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS subscribed_to_marketing BOOLEAN DEFAULT TRUE;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS notes                  TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS company_name           TEXT;

CREATE INDEX IF NOT EXISTS idx_contacts_relationship
  ON contacts (company_id, relationship_type);

-- Non-customers shouldn't be marketed to by default. Only flip contacts that
-- haven't already made an explicit choice (no consent recorded, not
-- unsubscribed) so we never override a real opt-in/opt-out.
UPDATE contacts
   SET subscribed_to_marketing = FALSE
 WHERE relationship_type IN ('supplier', 'wholesaler', 'business')
   AND unsubscribed_at IS NULL
   AND consent_recorded_at IS NULL;

NOTIFY pgrst, 'reload schema';
