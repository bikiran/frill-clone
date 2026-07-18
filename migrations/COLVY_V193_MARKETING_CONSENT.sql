-- ============================================================
-- COLVY V193 — MARKETING CONSENT + OPT-OUT
--
-- Records not just WHETHER a contact is subscribed but WHY, because that's what
-- has to be demonstrable if an opt-out complaint is ever made (Spam Act 2003).
--
-- consent_basis values:
--   express  — the contact explicitly opted in (form tick, keyword, checkout box)
--   inferred — an existing business relationship makes it reasonable to send
--              related marketing (e.g. they've purchased from the store)
--   none     — no basis on record; excluded from marketing campaigns
--
-- Transactional messages (order updates, delivery notices, support replies) are
-- NOT marketing and are unaffected by any of this.
--
-- Run in the Supabase SQL editor. Safe to re-run.
-- ============================================================

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS consent_basis        TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS consent_source       TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS consent_recorded_at  TIMESTAMPTZ;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS unsubscribed_at      TIMESTAMPTZ;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS unsubscribe_method   TEXT;

CREATE INDEX IF NOT EXISTS idx_contacts_marketing
  ON contacts (company_id, subscribed_to_marketing, consent_basis);

-- ── Audit trail ────────────────────────────────────────────────────────────
-- Every consent change is logged. This is the record you'd rely on if a
-- recipient ever disputes having been messaged.
CREATE TABLE IF NOT EXISTS consent_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID,
  contact_id  UUID NOT NULL,
  action      TEXT NOT NULL,      -- subscribed / unsubscribed
  basis       TEXT,               -- express / inferred / none
  source      TEXT,               -- where it came from
  actor       TEXT,               -- staff member, 'customer', or 'system'
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_consent_events_contact
  ON consent_events (contact_id, created_at DESC);

ALTER TABLE consent_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS consent_events_all ON consent_events;
CREATE POLICY consent_events_all ON consent_events
  FOR ALL USING (true) WITH CHECK (true);

-- ── Backfill: existing customers get INFERRED consent ──────────────────────
-- A contact who has bought from the store has a business relationship, which is
-- a recognised basis for related marketing. Blocked contacts and anyone already
-- flagged as spam are deliberately excluded.
UPDATE contacts c
SET subscribed_to_marketing = TRUE,
    consent_basis      = 'inferred',
    consent_source     = 'existing customer (has placed an order)',
    consent_recorded_at = NOW()
WHERE COALESCE(c.is_blocked, FALSE) = FALSE
  AND c.unsubscribed_at IS NULL
  AND c.consent_basis IS NULL
  AND EXISTS (
    SELECT 1 FROM woocommerce_orders o
    WHERE o.company_id = c.company_id
      AND (
        (c.email IS NOT NULL AND LOWER(o.customer_email) = LOWER(c.email))
        OR (c.phone IS NOT NULL AND o.billing_phone_norm IS NOT NULL
            AND o.billing_phone_norm = RIGHT(REGEXP_REPLACE(c.phone, '\D', '', 'g'), 9))
      )
  );

-- Everyone else who has contacted the business: also inferred, but recorded
-- separately so the two groups can be told apart (and campaigns can target the
-- stronger basis first if you'd rather be conservative).
UPDATE contacts c
SET subscribed_to_marketing = TRUE,
    consent_basis      = 'inferred',
    consent_source     = 'existing contact (has an open business relationship)',
    consent_recorded_at = NOW()
WHERE COALESCE(c.is_blocked, FALSE) = FALSE
  AND c.unsubscribed_at IS NULL
  AND c.consent_basis IS NULL;

-- Log the backfill so the audit trail explains where this consent came from.
INSERT INTO consent_events (company_id, contact_id, action, basis, source, actor, note)
SELECT c.company_id, c.id, 'subscribed', c.consent_basis, c.consent_source, 'system',
       'Backfilled when marketing consent tracking was introduced'
FROM contacts c
WHERE c.consent_recorded_at IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM consent_events e WHERE e.contact_id = c.id);

-- Blocked contacts are never marketable.
UPDATE contacts
SET subscribed_to_marketing = FALSE,
    consent_basis = 'none',
    consent_source = 'blocked contact'
WHERE COALESCE(is_blocked, FALSE) = TRUE;

NOTIFY pgrst, 'reload schema';
