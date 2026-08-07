-- Twilio, side by side with Telnyx.
--
-- Colvy already runs a deep Telnyx integration (SMS + WebRTC voice). This adds
-- Twilio as a SECOND, per-company selectable provider — chiefly because Twilio
-- carries MMS on number types Telnyx doesn't, so customers can actually send and
-- receive photos. Voice is supported too (Twilio Voice SDK / TwiML).
--
-- Nothing here changes existing behaviour: every company keeps sms_provider and
-- voice_provider = 'telnyx' until an owner explicitly switches in settings.
-- Telnyx stays the default; Twilio is opt-in and Bring-Your-Own-Account.

-- ── Per-company provider selection ──────────────────────────────────────────
-- Which provider actually sends/receives for this company. Split SMS from Voice
-- so a company can, say, text via Twilio (for MMS) while still calling via
-- Telnyx — or the reverse.
ALTER TABLE companies ADD COLUMN IF NOT EXISTS sms_provider   text NOT NULL DEFAULT 'telnyx';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS voice_provider text NOT NULL DEFAULT 'telnyx';

-- ── Twilio account config (Bring-Your-Own-Account) ──────────────────────────
-- One row per company. Mirrors telnyx_integrations in spirit. Credentials are
-- the company's own Twilio account — never exposed to the browser (the setup
-- endpoint masks them, the token endpoint only ever returns short-lived JWTs).
CREATE TABLE IF NOT EXISTS twilio_integrations (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  -- SMS/MMS + REST auth.
  account_sid           text,                 -- ACxxxx…
  auth_token            text,                 -- account auth token (Basic auth)
  phone_number          text,                 -- E.164 sender/receiver, e.g. +61…
  messaging_service_sid text,                 -- MGxxxx… optional sender pool

  -- Voice (Twilio Voice SDK). API Key pair mints browser Access Tokens; the
  -- TwiML App routes the SDK's calls to our /voice endpoints.
  api_key_sid           text,                 -- SKxxxx…
  api_key_secret        text,
  twiml_app_sid         text,                 -- APxxxx…

  -- Feature toggles + voicemail behaviour (parity with telnyx_integrations).
  sms_enabled           boolean DEFAULT true,
  voice_enabled         boolean DEFAULT true,
  voicemail_enabled     boolean DEFAULT true,
  voicemail_greeting    text,
  ring_seconds          integer DEFAULT 25,

  is_active             boolean DEFAULT true,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);

-- One integration per company; inbound routing looks the company up by the
-- receiving phone number, so index that too.
CREATE UNIQUE INDEX IF NOT EXISTS idx_twilio_integrations_company ON twilio_integrations (company_id);
CREATE INDEX        IF NOT EXISTS idx_twilio_integrations_number  ON twilio_integrations (phone_number);

-- The calls table already carries Telnyx call-control ids. Add the Twilio
-- equivalents (Call SID) so the same table serves both providers. Resilient
-- webhooks strip these if the column is missing, but adding them lets inbound
-- routing, bridging and recordings work for Twilio calls too.
ALTER TABLE calls ADD COLUMN IF NOT EXISTS twilio_call_sid       text;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS twilio_child_call_sid text;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS provider              text;   -- 'telnyx' | 'twilio'
CREATE INDEX IF NOT EXISTS idx_calls_twilio_sid ON calls (twilio_call_sid);

-- Outbound Twilio messages are matched back to campaign recipients on the Twilio
-- status callback the same way Telnyx uses provider_id — no new column needed
-- (campaign_recipients.provider_id already holds the provider message id).

NOTIFY pgrst, 'reload schema';
