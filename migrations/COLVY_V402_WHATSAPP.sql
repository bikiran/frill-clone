-- ============================================================
-- COLVY V402 — WHATSAPP BUSINESS MESSAGING (THROUGH TWILIO)
--
-- Businesses can answer WhatsApp messages in the shared inbox, sent through
-- Colvy's own (master) Twilio account like every text: the Messages API with
-- whatsapp:+61… addresses, one WhatsApp Sender per business, and Twilio
-- Content Templates (ContentSid + ContentVariables) once the 24-hour customer
-- service window has closed. Code: lib/whatsapp-core.ts, lib/whatsapp.ts,
-- lib/inbound-whatsapp.ts, app/api/twilio/whatsapp (webhook),
-- app/api/whatsapp (business), app/api/platform-admin/whatsapp (super admin).
--
-- ── GOING LIVE FOR A BUSINESS (real-world steps) ────────────────────────────
-- Registration happens in Colvy's Twilio console and Meta Business Manager;
-- Colvy's database only records the result.
--   1. The business asks: Settings → Channels → WhatsApp → Request WhatsApp
--      (display name, which Colvy number to use or a new one, business details).
--      The request shows in super admin → WhatsApp, status "pending".
--   2. Pick the number. It must be on Colvy's Twilio account, able to receive
--      an SMS or a voice call (Meta sends a verification code), and NOT already
--      registered on the WhatsApp or WhatsApp Business app (delete that account
--      first, or use a new Colvy number).
--   3. Twilio console → Messaging → Senders → WhatsApp senders → Create new
--      sender (Twilio's self sign-up, i.e. Meta's embedded signup). Log in with
--      Facebook, then choose or create the Meta Business portfolio and WhatsApp
--      Business Account (WABA). Best practice is the BUSINESS's own Meta
--      Business portfolio (the business owner logs in during the signup, or
--      adds Colvy as a partner), with Twilio as the messaging provider; if
--      Colvy runs many businesses, enrol in Twilio's Tech Provider program so
--      the signup can be embedded later. Enter the display name (must follow
--      Meta's display name rules and match the business's branding), and verify
--      the number with the code.
--   4. On the sender, set "Webhook URL for incoming messages" AND "Status
--      callback URL" to https://<your-domain>/api/twilio/whatsapp (POST).
--   5. Meta reviews the display name (hours to a few days). Meta Business
--      verification of the portfolio raises the messaging limits.
--   6. Templates: Twilio console → Messaging → Content Template Builder →
--      create the template (body with {{1}}, {{2}}…, e.g. "Hi {{1}}, your
--      order {{2}} is ready to collect."), category Utility, submit for
--      WhatsApp approval, and copy its Content SID (HX…).
--   7. Super admin → WhatsApp → the business: set the number, display name,
--      Twilio sender SID (XE…), WABA id, status Approved; add each template
--      with its Content SID, body and status; send a test.
--   Until a sender is 'approved' here, nothing is sent and inbound WhatsApp
--   messages to the number are ignored.
--
-- Creates:
--   whatsapp_senders    one row per business that asked for WhatsApp.
--     company_id          the business (primary key)
--     phone_number        the WhatsApp-enabled number on Colvy's Twilio, E.164
--     display_name        the WhatsApp display name Meta approved
--     status              not_requested | pending | approved | rejected | disabled
--     twilio_sender_sid   Twilio's WhatsApp sender SID, when known
--     waba_id             Meta's WhatsApp Business Account id, when known
--     request             what the business sent with its request (JSON)
--     requested_by, requested_at
--     admin_note          Colvy's note the business sees (e.g. why it was
--                         rejected)
--     approved_at, updated_by (the super admin's email), created_at, updated_at
--     One APPROVED sender per number (unique index): an inbound message is
--     routed to a business by the number it was sent to.
--   whatsapp_templates  approved message templates per business.
--     name, language (en, en_AU…), category (utility | marketing |
--     authentication), body (with {{1}} variables), content_sid (HX…),
--     status (draft | pending | approved | rejected | paused | disabled),
--     variable_labels (hints for the composer), rejection_reason, updated_by.
--     Colvy only SENDS approved utility templates in this version.
--   whatsapp_messages   every WhatsApp message in or out, for usage reporting
--                       and (later) billing: direction, kind (session |
--                       template), template_category, twilio_sid, status
--                       (from Twilio's status callbacks), error_code, sent_by,
--                       is_test. WhatsApp is not SMS: nothing here touches SMS
--                       credits or the SMS allowance.
--   whatsapp_consent    WhatsApp opt-outs, one row per number per business
--                       (phone_norm = last 9 digits, as contacts.phone_norm):
--                       status opted_out | opted_in, the keyword, when. A STOP
--                       on WhatsApp stops WhatsApp only; SMS and email consent
--                       on the contact are unchanged.
-- Adds:
--   conversations.whatsapp_number   the customer's WhatsApp number (E.164) on a
--                                   WhatsApp thread, which replies go to.
-- Thread messages use the existing columns: delivery_channel 'whatsapp',
-- telnyx_message_id (Twilio's MessageSid, as for every Twilio message) and
-- metadata.whatsapp (delivery status, template).
--
-- Access (V375 / V382 / V398 / V399 style):
--   • SELECT — staff of the company (is_company_member, which leaves out board
--     visitors and removed members) and the platform admin.
--   • INSERT / UPDATE / DELETE — the server only (service role): the business
--     requests through /api/whatsapp (owner / admin), the super admin manages
--     senders and templates through /api/platform-admin/whatsapp (audited),
--     and the webhook writes messages and consent. No write policy and no
--     write privilege for anon or authenticated.
--   If is_company_member() is missing, or is still V209's first version, the
--   tables are created SERVER ONLY (no read policy) and a notice says so; the
--   app reads them with the service role either way. Run V337 and then this
--   file again to add the read policies.
--
-- ── WHEN TO RUN ─────────────────────────────────────────────────────────────
-- Any time, before or after the code from branch claude/whatsapp is deployed.
-- Until it runs, WhatsApp stays dormant: the channels page shows "Request
-- access" and says the request needs this update, the webhook ignores
-- everything, nothing is sent, and the super admin's WhatsApp page says to
-- run this file.
--
-- ── VERIFY AFTERWARDS ───────────────────────────────────────────────────────
--   1. The last query lists four policies (whatsapp_*_member_read).
--   2. Settings → Channels → WhatsApp: Request WhatsApp. Super admin →
--      WhatsApp lists the request as pending.
--   3. Signed in as staff (anon key + their token):
--        select * from whatsapp_senders;                               → their row only
--        insert into whatsapp_templates (company_id, ...) values (...); → permission denied
--   4. select whatsapp_number from conversations limit 1;  → runs
--
-- Run in the Supabase SQL editor. Safe to re-run. Rollback at the bottom.
-- ============================================================

-- ── STEP 0: what this builds on ─────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.companies') IS NULL THEN
    RAISE EXCEPTION 'public.companies does not exist';
  END IF;
END $$;

-- The platform admin check (same body as V351 / V364 / V375 / V395 / V398 / V399).
CREATE OR REPLACE FUNCTION is_platform_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT lower(COALESCE(auth.jwt() ->> 'email', '')) = 'bishalstha76@gmail.com'
$$;
REVOKE ALL ON FUNCTION is_platform_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION is_platform_admin() TO authenticated, service_role;

-- ── STEP 1: senders ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.whatsapp_senders (
  company_id         UUID PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  phone_number       TEXT,
  display_name       TEXT,
  status             TEXT NOT NULL DEFAULT 'not_requested',
  twilio_sender_sid  TEXT,
  waba_id            TEXT,
  request            JSONB NOT NULL DEFAULT '{}'::jsonb,
  requested_by       UUID,
  requested_at       TIMESTAMPTZ,
  admin_note         TEXT,
  approved_at        TIMESTAMPTZ,
  updated_by         TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.whatsapp_senders
  ADD COLUMN IF NOT EXISTS phone_number       TEXT,
  ADD COLUMN IF NOT EXISTS display_name       TEXT,
  ADD COLUMN IF NOT EXISTS status             TEXT NOT NULL DEFAULT 'not_requested',
  ADD COLUMN IF NOT EXISTS twilio_sender_sid  TEXT,
  ADD COLUMN IF NOT EXISTS waba_id            TEXT,
  ADD COLUMN IF NOT EXISTS request            JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS requested_by       UUID,
  ADD COLUMN IF NOT EXISTS requested_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS admin_note         TEXT,
  ADD COLUMN IF NOT EXISTS approved_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_by         TEXT,
  ADD COLUMN IF NOT EXISTS created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at         TIMESTAMPTZ NOT NULL DEFAULT now();

-- One approved sender per number: inbound messages are routed by it.
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_senders_approved_number_uniq
  ON public.whatsapp_senders (phone_number) WHERE status = 'approved';

-- ── STEP 2: templates ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.whatsapp_templates (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  language          TEXT NOT NULL DEFAULT 'en',
  category          TEXT NOT NULL DEFAULT 'utility',
  body              TEXT NOT NULL,
  content_sid       TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pending',
  variable_labels   JSONB NOT NULL DEFAULT '[]'::jsonb,
  rejection_reason  TEXT,
  updated_by        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.whatsapp_templates
  ADD COLUMN IF NOT EXISTS language          TEXT NOT NULL DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS category          TEXT NOT NULL DEFAULT 'utility',
  ADD COLUMN IF NOT EXISTS status            TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS variable_labels   JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS rejection_reason  TEXT,
  ADD COLUMN IF NOT EXISTS updated_by        TEXT,
  ADD COLUMN IF NOT EXISTS created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at        TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_templates_name_uniq ON public.whatsapp_templates (company_id, name, language);
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_templates_sid_uniq ON public.whatsapp_templates (company_id, content_sid);

-- ── STEP 3: the usage log ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.whatsapp_messages (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  conversation_id    UUID,
  message_id         UUID,
  direction          TEXT NOT NULL,
  kind               TEXT NOT NULL DEFAULT 'session',
  template_id        UUID,
  template_category  TEXT,
  twilio_sid         TEXT,
  to_number          TEXT,
  from_number        TEXT,
  status             TEXT,
  error_code         TEXT,
  sent_by            TEXT,
  is_test            BOOLEAN NOT NULL DEFAULT false,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivered_at       TIMESTAMPTZ,
  read_at            TIMESTAMPTZ
);
ALTER TABLE public.whatsapp_messages
  ADD COLUMN IF NOT EXISTS conversation_id    UUID,
  ADD COLUMN IF NOT EXISTS message_id         UUID,
  ADD COLUMN IF NOT EXISTS kind               TEXT NOT NULL DEFAULT 'session',
  ADD COLUMN IF NOT EXISTS template_id        UUID,
  ADD COLUMN IF NOT EXISTS template_category  TEXT,
  ADD COLUMN IF NOT EXISTS twilio_sid         TEXT,
  ADD COLUMN IF NOT EXISTS to_number          TEXT,
  ADD COLUMN IF NOT EXISTS from_number        TEXT,
  ADD COLUMN IF NOT EXISTS status             TEXT,
  ADD COLUMN IF NOT EXISTS error_code         TEXT,
  ADD COLUMN IF NOT EXISTS sent_by            TEXT,
  ADD COLUMN IF NOT EXISTS is_test            BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS delivered_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS read_at            TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_messages_sid_uniq ON public.whatsapp_messages (twilio_sid) WHERE twilio_sid IS NOT NULL;
CREATE INDEX IF NOT EXISTS whatsapp_messages_company_created ON public.whatsapp_messages (company_id, created_at DESC);

-- ── STEP 4: opt-outs ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.whatsapp_consent (
  company_id   UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  phone_norm   TEXT NOT NULL,
  phone        TEXT,
  status       TEXT NOT NULL,
  keyword      TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, phone_norm)
);
ALTER TABLE public.whatsapp_consent
  ADD COLUMN IF NOT EXISTS phone       TEXT,
  ADD COLUMN IF NOT EXISTS keyword     TEXT,
  ADD COLUMN IF NOT EXISTS created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at  TIMESTAMPTZ NOT NULL DEFAULT now();

-- ── STEP 5: constraints ─────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'whatsapp_senders_status_check') THEN
    ALTER TABLE public.whatsapp_senders ADD CONSTRAINT whatsapp_senders_status_check
      CHECK (status IN ('not_requested', 'pending', 'approved', 'rejected', 'disabled'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'whatsapp_senders_number_e164') THEN
    ALTER TABLE public.whatsapp_senders ADD CONSTRAINT whatsapp_senders_number_e164
      CHECK (phone_number IS NULL OR phone_number ~ '^\+[1-9][0-9]{7,14}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'whatsapp_senders_approved_complete') THEN
    ALTER TABLE public.whatsapp_senders ADD CONSTRAINT whatsapp_senders_approved_complete
      CHECK (status <> 'approved' OR (phone_number IS NOT NULL AND display_name IS NOT NULL));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'whatsapp_senders_request_object') THEN
    ALTER TABLE public.whatsapp_senders ADD CONSTRAINT whatsapp_senders_request_object
      CHECK (jsonb_typeof(request) = 'object' AND octet_length(request::text) <= 16384);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'whatsapp_senders_note_len') THEN
    ALTER TABLE public.whatsapp_senders ADD CONSTRAINT whatsapp_senders_note_len
      CHECK (admin_note IS NULL OR char_length(admin_note) <= 500);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'whatsapp_templates_category_check') THEN
    ALTER TABLE public.whatsapp_templates ADD CONSTRAINT whatsapp_templates_category_check
      CHECK (category IN ('utility', 'marketing', 'authentication'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'whatsapp_templates_status_check') THEN
    ALTER TABLE public.whatsapp_templates ADD CONSTRAINT whatsapp_templates_status_check
      CHECK (status IN ('draft', 'pending', 'approved', 'rejected', 'paused', 'disabled'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'whatsapp_templates_sid_format') THEN
    ALTER TABLE public.whatsapp_templates ADD CONSTRAINT whatsapp_templates_sid_format
      CHECK (content_sid ~ '^HX[0-9a-fA-F]{32}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'whatsapp_templates_body_len') THEN
    ALTER TABLE public.whatsapp_templates ADD CONSTRAINT whatsapp_templates_body_len
      CHECK (char_length(body) BETWEEN 1 AND 1024);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'whatsapp_templates_labels_array') THEN
    ALTER TABLE public.whatsapp_templates ADD CONSTRAINT whatsapp_templates_labels_array
      CHECK (jsonb_typeof(variable_labels) = 'array');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'whatsapp_messages_direction_check') THEN
    ALTER TABLE public.whatsapp_messages ADD CONSTRAINT whatsapp_messages_direction_check
      CHECK (direction IN ('inbound', 'outbound'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'whatsapp_messages_kind_check') THEN
    ALTER TABLE public.whatsapp_messages ADD CONSTRAINT whatsapp_messages_kind_check
      CHECK (kind IN ('session', 'template'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'whatsapp_messages_category_check') THEN
    ALTER TABLE public.whatsapp_messages ADD CONSTRAINT whatsapp_messages_category_check
      CHECK (template_category IS NULL OR template_category IN ('utility', 'marketing', 'authentication'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'whatsapp_consent_status_check') THEN
    ALTER TABLE public.whatsapp_consent ADD CONSTRAINT whatsapp_consent_status_check
      CHECK (status IN ('opted_out', 'opted_in'));
  END IF;
END $$;

-- ── STEP 6: the conversation's WhatsApp number ──────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.conversations') IS NULL THEN
    RAISE NOTICE 'public.conversations does not exist: skipping whatsapp_number. Run this file again once it does.';
  ELSE
    ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS whatsapp_number TEXT;
    CREATE INDEX IF NOT EXISTS conversations_company_whatsapp_number
      ON public.conversations (company_id, whatsapp_number) WHERE whatsapp_number IS NOT NULL;
  END IF;
END $$;

-- ── STEP 7: access ──────────────────────────────────────────────────────────
DO $$
DECLARE
  r RECORD;
  t TEXT;
  member_ok BOOLEAN := to_regprocedure('public.is_company_member(uuid)') IS NOT NULL
    AND pg_get_functiondef(to_regprocedure('public.is_company_member(uuid)')) ILIKE '%''viewer''%';
BEGIN
  FOREACH t IN ARRAY ARRAY['whatsapp_senders', 'whatsapp_templates', 'whatsapp_messages', 'whatsapp_consent'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    FOR r IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, t);
    END LOOP;
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    IF member_ok THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (is_company_member(company_id) OR is_platform_admin())', t || '_member_read', t);
      EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    END IF;
  END LOOP;
  IF NOT member_ok THEN
    RAISE NOTICE 'is_company_member() is missing or still counts board visitors: the WhatsApp tables are server only. Run COLVY_V337_MEMBERSHIP_EXCLUDES_VIEWERS.sql, then this file again.';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ── STEP 8: check ───────────────────────────────────────────────────────────
SELECT tablename, policyname, cmd, roles
  FROM pg_policies
 WHERE schemaname = 'public' AND tablename LIKE 'whatsapp\_%'
 ORDER BY tablename;

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- WhatsApp goes dormant again (the code treats the missing tables as "not
-- set up": nothing is sent, the webhook ignores everything). Dropping the
-- tables loses the senders, templates, usage history and WhatsApp opt-outs;
-- export whatsapp_consent first if you may run this file again later, or
-- opted-out numbers could be messaged once WhatsApp is back. Thread messages
-- stay in messages either way.
--
--   DROP TABLE IF EXISTS public.whatsapp_messages;
--   DROP TABLE IF EXISTS public.whatsapp_templates;
--   DROP TABLE IF EXISTS public.whatsapp_consent;
--   DROP TABLE IF EXISTS public.whatsapp_senders;
--   DROP INDEX IF EXISTS public.conversations_company_whatsapp_number;
--   ALTER TABLE public.conversations DROP COLUMN IF EXISTS whatsapp_number;
--   NOTIFY pgrst, 'reload schema';
