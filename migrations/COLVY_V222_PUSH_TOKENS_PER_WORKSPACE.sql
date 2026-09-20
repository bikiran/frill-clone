-- ============================================================
-- COLVY V222 — ONE PUSH REGISTRATION PER DEVICE *PER WORKSPACE*
--
-- push_tokens_uniq was UNIQUE on expo_token alone: one row per device, full
-- stop. A phone can only ever be registered to one workspace at a time, so on
-- a device with two accounts in the switcher the second one to register takes
-- the first one's notifications away — silently, with nothing in either app to
-- say so. That is exactly what happened: info@aquacircle.com.au was added on a
-- phone signed in to Roxy Aquarium, claimed the device token, and every Roxy
-- alert from then on was addressed to a row that said Aqua Circle.
--
-- V221 made the active account able to take the token back, which unstuck it
-- but kept the underlying either/or: every workspace switch would steal the
-- registration back again.
--
-- The app is already built for the alternative. A notification carries its
-- companyId, and a tap calls openInWorkspace(companyId, …) to switch workspace
-- before opening the thread. The only thing insisting a device belong to one
-- workspace was this index.
--
-- So key the registration on the device AND the workspace. A phone then holds
-- one row per workspace it is signed in to, and every one of them gets its own
-- notifications.
--
-- Nothing on the server needs changing: every reader already filters by
-- company_id (/api/push/send, the call handoff, the inbound-call fan-out) and
-- /api/push/send already de-dupes by token before sending, so a device never
-- receives the same message twice.
--
-- ⚠️ ORDER: safe to run before the app build that matches it. An older build
--    asks PostgREST to upsert ON CONFLICT (expo_token), which no longer
--    resolves, so it falls back to its delete-then-insert path — the same
--    single-workspace behaviour as today, no worse. The new build upserts on
--    (expo_token, company_id) and gets the per-workspace behaviour.
--
-- Run in the Supabase SQL editor, after V220 and V221. Safe to re-run.
-- ============================================================

-- Should be none: the old unique index made them impossible. Belt and braces
-- for a database where it was ever dropped by hand — keep the newest row per
-- (device, workspace).
DELETE FROM push_tokens a
 USING push_tokens b
 WHERE a.expo_token = b.expo_token
   AND a.company_id IS NOT DISTINCT FROM b.company_id
   AND (a.updated_at, a.id) < (b.updated_at, b.id);

DROP INDEX IF EXISTS push_tokens_uniq;

CREATE UNIQUE INDEX IF NOT EXISTS push_tokens_device_workspace_uniq
  ON push_tokens (expo_token, company_id);

-- Reclaiming a device token, now scoped to ONE workspace. V221's version
-- deleted every row carrying the token, which was right when a device could
-- only hold one registration and is precisely wrong now — it would wipe the
-- other workspaces signed in on the same phone. Only the row for the workspace
-- being claimed is replaced.
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

  INSERT INTO push_tokens (user_id, company_id, expo_token, platform, updated_at)
  VALUES (uid, p_company, p_token, COALESCE(p_platform, 'android'), now())
  ON CONFLICT (expo_token, company_id) DO UPDATE
    SET user_id = EXCLUDED.user_id,
        platform = EXCLUDED.platform,
        updated_at = EXCLUDED.updated_at;

  RETURN 'claimed';
END $$;

REVOKE ALL ON FUNCTION claim_push_token(TEXT, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION claim_push_token(TEXT, UUID, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- What this phone is registered for afterwards — one row per workspace.
--   SELECT p.company_id, c.name AS workspace, p.user_id, p.updated_at
--     FROM push_tokens p LEFT JOIN companies c ON c.id = p.company_id
--    WHERE p.expo_token LIKE '%pKCUQ1qnr]';
