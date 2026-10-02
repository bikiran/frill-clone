-- ============================================================
-- COLVY V221 — LET A PHONE CLAIM ITS OWN DEVICE TOKEN
--
-- V220 let a user manage their OWN push_tokens rows, which fixed the rows
-- orphaned with a null company. It did not fix this, still in the diagnostics
-- after V220 was applied:
--
--   push register · could not store the token: another row already holds this
--   device token and this account is not allowed to change it
--
-- A row holds this device's token, and it belongs to neither this user nor a
-- company this user is in — typically an account that was signed in on this
-- phone earlier. V220's policy quite correctly refuses to let one user touch
-- another's row, so the device can never take its token back.
--
-- That is not only a registration failure, it is a delivery fault with a
-- privacy edge: /api/push/send looks phones up by that row, so while it stands,
-- the PREVIOUS account's order and message alerts are still being delivered to
-- a phone that is now signed in as someone else.
--
-- ── WHY A FUNCTION AND NOT A POLICY ─────────────────────────────────────────
-- The rule we want is "you may replace a row if you can produce its device
-- token", and RLS cannot express that: a policy sees the row, never the value
-- the client filtered on. Opening DELETE to authenticated users instead would
-- be far worse than it sounds — PostgREST accepts a filter that matches
-- everything, so any signed-in user could empty the table and silence every
-- phone in the system.
--
-- A SECURITY DEFINER function takes the token as an argument, so holding the
-- token IS the proof, and it can only ever delete rows matching the one passed
-- in. Membership is still checked, so a token cannot be planted in a workspace
-- the caller does not belong to.
--
-- Run in the Supabase SQL editor, after V220. Safe to re-run.
-- ============================================================

CREATE OR REPLACE FUNCTION claim_push_token(
  p_token    TEXT,
  p_company  UUID,
  p_platform TEXT DEFAULT 'android'
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'claim_push_token: not signed in';
  END IF;

  -- Guard against a caller passing something broad enough to be a wildcard.
  IF p_token IS NULL OR length(p_token) < 20 THEN
    RAISE EXCEPTION 'claim_push_token: a full device token is required';
  END IF;

  IF p_company IS NULL OR NOT is_company_member(p_company) THEN
    RAISE EXCEPTION 'claim_push_token: not a member of that workspace';
  END IF;

  -- The token identifies a DEVICE, and whoever holds the device owns its
  -- notifications. Anything a previous account left against this token has to
  -- go, or that account's alerts keep arriving on this phone.
  DELETE FROM push_tokens WHERE expo_token = p_token;

  INSERT INTO push_tokens (user_id, company_id, expo_token, platform, updated_at)
  VALUES (uid, p_company, p_token, COALESCE(p_platform, 'android'), now());

  RETURN 'claimed';
END $$;

REVOKE ALL ON FUNCTION claim_push_token(TEXT, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION claim_push_token(TEXT, UUID, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
