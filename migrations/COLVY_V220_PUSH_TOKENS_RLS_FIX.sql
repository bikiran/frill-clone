-- ============================================================
-- COLVY V220 — PUSH TOKENS: MAKE THE DEVICE ROW WRITABLE AGAIN
--
-- SYMPTOM
-- Phones stopped receiving new-order and new-SMS alerts. Calls kept working
-- (they arrive over Twilio, not Expo push), so the app looked healthy. The
-- on-device diagnostics show the real failure on every launch:
--
--   push register · token ends <...>
--   push register · could not store the token:
--       duplicate key value violates unique constraint "push_tokens_uniq"
--
-- CAUSE
-- V209 locked push_tokens with:
--
--   USING (is_company_member(company_id)) WITH CHECK (is_company_member(company_id))
--
-- is_company_member(NULL) is false, so ANY row whose company_id is NULL became
-- invisible and unmodifiable to every signed-in user. The app had stored such
-- rows before V209 (it registers at launch, before a workspace is selected).
-- From then on, per launch:
--
--   1. upsert(onConflict: expo_token) — the conflicting row is found through
--      the unique index (index lookups are not RLS-filtered), but the implied
--      UPDATE is refused by the USING clause, so the upsert errors.
--   2. the app falls back to delete-then-insert; the DELETE matches zero rows
--      because RLS hides the orphan — deleting nothing is not an error.
--   3. the INSERT then collides with push_tokens_uniq on expo_token.
--
-- So the device can never write its token, and the orphan row that squats on
-- the token has company_id = NULL — which /api/push/send filters on
-- (.eq('company_id', companyId)). The phone is unreachable either way.
--
-- FIX
-- Let a user manage their OWN device rows regardless of company_id, while
-- still refusing to let anyone write a token into a company they don't belong
-- to. That restores V209's actual security goal (no cross-tenant reads of
-- device tokens with the anon key) without making a row unreclaimable.
--
-- Run in the Supabase SQL editor. Safe to re-run.
-- ============================================================

ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS company_members_push_tokens ON push_tokens;
DROP POLICY IF EXISTS push_tokens_own_or_member ON push_tokens;

-- USING  — what you may see, update and delete:
--          your own device rows (whatever company_id they carry, including
--          NULL, so a stale row can always be reclaimed), plus the rows of
--          companies you belong to.
-- CHECK  — what you may write: only rows for yourself, and only into a
--          company you are a member of. A NULL company_id is allowed so that
--          launch-time registration still works before a workspace is picked,
--          but see the note below — the app now avoids writing those.
CREATE POLICY push_tokens_own_or_member ON push_tokens
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid() OR is_company_member(company_id))
  WITH CHECK (user_id = auth.uid() AND (company_id IS NULL OR is_company_member(company_id)));

-- Clear the rows that are undeliverable by construction. /api/push/send only
-- ever selects by company_id, so a NULL-company row can never be sent to; it
-- exists only to squat on the unique token. Every affected phone re-registers
-- on its next launch and writes a correct row.
DELETE FROM push_tokens WHERE company_id IS NULL;

-- What each signed-in user can now reach, for verification.
SELECT company_id, platform, count(*) AS rows
  FROM push_tokens
 GROUP BY company_id, platform
 ORDER BY rows DESC;
