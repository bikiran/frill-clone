-- Platform-managed Twilio number provisioning (transparent to the customer).
--
-- Twilio numbers are now bought and configured through COLVY'S OWN Twilio
-- account (env: TWILIO_MASTER_*), exactly like the Telnyx flow — the customer
-- picks a number, submits the ACMA details, and gets a number, never seeing or
-- entering any Twilio credentials. This runs side by side with Telnyx: a
-- company's number_provider decides which backend the "Get a business number"
-- flow uses, defaulting to Telnyx so nothing changes for anyone.

-- Which provider backs THIS company's number purchasing/telephony. Kept separate
-- from sms_provider/voice_provider (which route messaging/calls) so a company can
-- be provisioned on Twilio and have both channels follow automatically.
ALTER TABLE companies ADD COLUMN IF NOT EXISTS number_provider text NOT NULL DEFAULT 'telnyx';

-- twilio_integrations gains the platform-provisioning fields telnyx_integrations
-- already has, so a Colvy-bought Twilio number is recorded the same way.
ALTER TABLE twilio_integrations ADD COLUMN IF NOT EXISTS provisioned_by_colvy  boolean DEFAULT false;
ALTER TABLE twilio_integrations ADD COLUMN IF NOT EXISTS number_sid            text;      -- PNxxxx (IncomingPhoneNumber SID)
ALTER TABLE twilio_integrations ADD COLUMN IF NOT EXISTS monthly_cost          numeric;
ALTER TABLE twilio_integrations ADD COLUMN IF NOT EXISTS provisioned_at        timestamptz;
ALTER TABLE twilio_integrations ADD COLUMN IF NOT EXISTS stripe_subscription_id text;
ALTER TABLE twilio_integrations ADD COLUMN IF NOT EXISTS regulatory_bundle_id  uuid;

-- The multi-number table is provider-aware. Existing rows are Telnyx.
ALTER TABLE phone_numbers ADD COLUMN IF NOT EXISTS provider   text NOT NULL DEFAULT 'telnyx';
ALTER TABLE phone_numbers ADD COLUMN IF NOT EXISTS twilio_sid text;   -- PNxxxx

-- The regulatory bundle can be submitted to either provider.
ALTER TABLE number_regulatory_bundles ADD COLUMN IF NOT EXISTS twilio_bundle_id text;   -- BUxxxx

NOTIFY pgrst, 'reload schema';
