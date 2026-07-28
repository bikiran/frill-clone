-- ============================================================
-- COLVY V197 — CONTACTS FROM WOOCOMMERCE CUSTOMERS
--
-- Campaign audiences resolve from `contacts`. A WooCommerce customer who bought
-- from the store but never messaged us has no contact row, so they were
-- invisible to every audience filter — a store with 12,000 customers was
-- offering a few hundred recipients.
--
-- Beyond the count, this matters for compliance: an unsubscribe has to be
-- RECORDED somewhere. With no contact row there is nowhere to store
-- unsubscribed_at, so a STOP reply from that customer could not be honoured.
-- Every marketable person needs a contact record.
--
-- Customers are matched to existing contacts by email, then by normalised phone
-- (last 9 digits), so this does not create duplicates of people already known.
--
-- Run in the Supabase SQL editor. Safe to re-run — only inserts what's missing.
-- ============================================================

-- Helper column for phone matching, if V186 hasn't been applied.
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS phone_norm TEXT;
UPDATE contacts
SET phone_norm = RIGHT(REGEXP_REPLACE(phone, '\D', '', 'g'), 9)
WHERE phone IS NOT NULL
  AND (phone_norm IS NULL OR phone_norm = '');

CREATE INDEX IF NOT EXISTS idx_contacts_phone_norm
  ON contacts (company_id, phone_norm);

ALTER TABLE woocommerce_customers ADD COLUMN IF NOT EXISTS phone_norm TEXT;
UPDATE woocommerce_customers
SET phone_norm = RIGHT(REGEXP_REPLACE(phone, '\D', '', 'g'), 9)
WHERE phone IS NOT NULL
  AND (phone_norm IS NULL OR phone_norm = '');

-- ── Insert contacts for customers we don't already have ────────────────────
-- Consent basis is 'inferred': they have purchased, which is the strongest
-- inferred-consent position under the Spam Act. Recorded explicitly so it can
-- be demonstrated later.
INSERT INTO contacts (
  company_id, name, email, phone, phone_norm, source,
  subscribed_to_marketing, consent_basis, consent_source, consent_recorded_at,
  created_at
)
SELECT DISTINCT ON (wc.company_id, COALESCE(LOWER(wc.email), wc.phone_norm))
  wc.company_id,
  NULLIF(TRIM(COALESCE(wc.first_name, '') || ' ' || COALESCE(wc.last_name, '')), ''),
  LOWER(NULLIF(TRIM(wc.email), '')),
  NULLIF(TRIM(wc.phone), ''),
  wc.phone_norm,
  'woocommerce',
  TRUE,
  'inferred',
  'existing customer (has placed an order)',
  NOW(),
  NOW()
FROM woocommerce_customers wc
WHERE
  -- Must be contactable by something.
  (NULLIF(TRIM(wc.email), '') IS NOT NULL OR wc.phone_norm IS NOT NULL)
  -- Not already a contact, by email…
  AND NOT EXISTS (
    SELECT 1 FROM contacts c
    WHERE c.company_id = wc.company_id
      AND c.email IS NOT NULL
      AND LOWER(c.email) = LOWER(TRIM(wc.email))
  )
  -- …or by phone.
  AND NOT EXISTS (
    SELECT 1 FROM contacts c
    WHERE c.company_id = wc.company_id
      AND c.phone_norm IS NOT NULL
      AND wc.phone_norm IS NOT NULL
      AND c.phone_norm = wc.phone_norm
  )
ORDER BY wc.company_id, COALESCE(LOWER(wc.email), wc.phone_norm), wc.id;

-- Log the consent basis for everyone just created.
INSERT INTO consent_events (company_id, contact_id, action, basis, source, actor, note)
SELECT c.company_id, c.id, 'subscribed', 'inferred', c.consent_source, 'system',
       'Contact created from WooCommerce customer record'
FROM contacts c
WHERE c.source = 'woocommerce'
  AND NOT EXISTS (SELECT 1 FROM consent_events e WHERE e.contact_id = c.id);

-- Existing contacts that match a customer but were never given a consent basis.
UPDATE contacts c
SET subscribed_to_marketing = TRUE,
    consent_basis = 'inferred',
    consent_source = 'existing customer (has placed an order)',
    consent_recorded_at = NOW()
WHERE c.consent_basis IS NULL
  AND COALESCE(c.is_blocked, FALSE) = FALSE
  AND c.unsubscribed_at IS NULL
  AND EXISTS (
    SELECT 1 FROM woocommerce_customers wc
    WHERE wc.company_id = c.company_id
      AND (
        (c.email IS NOT NULL AND LOWER(wc.email) = LOWER(c.email))
        OR (c.phone_norm IS NOT NULL AND wc.phone_norm = c.phone_norm)
      )
  );

NOTIFY pgrst, 'reload schema';
