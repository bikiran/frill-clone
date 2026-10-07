-- ============================================================
-- COLVY V338 — TWILIO IS THE DEFAULT CARRIER
--
-- Colvy moved off Telnyx onto Twilio, but V249/V250 created
-- companies.sms_provider, voice_provider and number_provider with
-- DEFAULT 'telnyx'. Every business that signed up since then started as a
-- Telnyx business until a Twilio number was bought or assigned for it, so:
--   • "Get a business number" sent them to the Telnyx checkout;
--   • texts tried Telnyx and found nothing to send with;
--   • the browser phone registered with Telnyx.
-- The code now treats Twilio as the default too (only an explicit 'telnyx'
-- picks Telnyx); this makes the data agree.
--
-- Run in the Supabase SQL editor. Safe to re-run. Rollback at the bottom.
-- ============================================================

-- ── STEP 1: who is still set to Telnyx, and do they have anything on it ─────
SELECT c.name,
       c.sms_provider, c.voice_provider, c.number_provider,
       (t.company_id IS NOT NULL AND t.phone_number IS NOT NULL) AS has_telnyx_number,
       (w.company_id IS NOT NULL AND w.phone_number IS NOT NULL) AS has_twilio_number
  FROM companies c
  LEFT JOIN telnyx_integrations t ON t.company_id = c.id
  LEFT JOIN twilio_integrations w ON w.company_id = c.id
 WHERE c.sms_provider = 'telnyx' OR c.voice_provider = 'telnyx' OR c.number_provider = 'telnyx'
 ORDER BY has_telnyx_number DESC, c.name;

-- ── STEP 2: new businesses start on Twilio ─────────────────────────────────
ALTER TABLE companies ALTER COLUMN sms_provider    SET DEFAULT 'twilio';
ALTER TABLE companies ALTER COLUMN voice_provider  SET DEFAULT 'twilio';
ALTER TABLE companies ALTER COLUMN number_provider SET DEFAULT 'twilio';

-- ── STEP 3: and so does everyone else ──────────────────────────────────────
UPDATE companies SET sms_provider    = 'twilio' WHERE sms_provider    IS DISTINCT FROM 'twilio';
UPDATE companies SET voice_provider  = 'twilio' WHERE voice_provider  IS DISTINCT FROM 'twilio';
UPDATE companies SET number_provider = 'twilio' WHERE number_provider IS DISTINCT FROM 'twilio';

NOTIFY pgrst, 'reload schema';

-- ── STEP 4: confirm — every row should say twilio ──────────────────────────
SELECT sms_provider, voice_provider, number_provider, count(*)
  FROM companies GROUP BY 1, 2, 3 ORDER BY 4 DESC;

-- ── ROLLBACK (defaults only — Step 3 can't know who was on what) ───────────
--   ALTER TABLE companies ALTER COLUMN sms_provider    SET DEFAULT 'telnyx';
--   ALTER TABLE companies ALTER COLUMN voice_provider  SET DEFAULT 'telnyx';
--   ALTER TABLE companies ALTER COLUMN number_provider SET DEFAULT 'telnyx';
