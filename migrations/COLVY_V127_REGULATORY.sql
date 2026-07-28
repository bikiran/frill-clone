-- ============================================================
-- COLVY V127 — TELNYX REGULATORY REQUIREMENTS (AU)
-- Stores the end-user identity + address bundle required before
-- an AU number can be provisioned, plus Onfido ID-verification
-- state for mobile numbers. Single step, safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS number_regulatory_bundles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  number_type TEXT DEFAULT 'local',          -- local | mobile
  entity_type TEXT DEFAULT 'business',       -- individual | business

  -- End-user identity
  first_name TEXT,
  last_name TEXT,
  date_of_birth DATE,                         -- required for mobile activator
  business_name TEXT,
  contact_phone TEXT,
  contact_email TEXT,

  -- Australian address (required; proof < 3 months old)
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  state TEXT,
  postal_code TEXT,
  country TEXT DEFAULT 'AU',

  -- Uploaded proof documents (Supabase Storage paths)
  proof_of_address_url TEXT,                  -- utility bill / bank statement < 3 months
  id_document_url TEXT,                       -- passport / ID (business rep)

  -- Telnyx + Onfido linkage
  telnyx_requirement_group_id TEXT,
  onfido_verification_url TEXT,
  onfido_status TEXT DEFAULT 'not_started',   -- not_started | pending | approved | rejected
  requirements_met BOOLEAN DEFAULT false,

  status TEXT DEFAULT 'draft',                -- draft | submitted | validating | approved | rejected
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_reg_bundles_company ON number_regulatory_bundles(company_id);
ALTER TABLE number_regulatory_bundles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can manage reg bundles" ON number_regulatory_bundles;
CREATE POLICY "Anyone can manage reg bundles" ON number_regulatory_bundles FOR ALL USING (true);

-- Link a completed bundle onto the telnyx integration so provisioning can find it
ALTER TABLE telnyx_integrations ADD COLUMN IF NOT EXISTS regulatory_bundle_id UUID;

NOTIFY pgrst, 'reload schema';
