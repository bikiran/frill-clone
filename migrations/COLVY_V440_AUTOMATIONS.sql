-- ============================================================
-- COLVY V440 — AUTOMATIONS (visual builder)
--
-- Run after COLVY_V439_POWERS_MORE_WAYS.sql. Adds:
--   automations              a business's flows, drawn in Settings → Automations
--                            (graph JSON: one trigger, checks, actions, waits)
--   automation_runs          one row per time a flow ran for an event, with the
--                            path it took; a run that is waiting holds the step
--                            to carry on from and when
--   automation_start_run()   start a run in one locked step: switched on, not a
--                            repeat of the same event, outside the cool-down,
--                            under the daily limit
--   automation_claim_due()   hand waiting runs that are due to one worker each
--
-- Server only: RLS on with no policies, nothing granted to anon/authenticated,
-- functions for service_role only. Safe to re-run. Rollback at the bottom.
-- docs/plans/automations.md has the plan.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.automations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name          TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  enabled       BOOLEAN NOT NULL DEFAULT false,
  trigger_type  TEXT NOT NULL DEFAULT 'message' CHECK (trigger_type IN ('message', 'missed_call')),
  graph         JSONB NOT NULL DEFAULT '{"nodes":[],"edges":[]}'::jsonb,
  run_count     INT NOT NULL DEFAULT 0,
  last_run_at   TIMESTAMPTZ,
  created_by    UUID,
  updated_by    UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS automations_company_idx ON public.automations (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS automations_live_idx ON public.automations (company_id, trigger_type) WHERE enabled;

CREATE TABLE IF NOT EXISTS public.automation_runs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  automation_id    UUID NOT NULL REFERENCES public.automations(id) ON DELETE CASCADE,
  event_key        TEXT NOT NULL,                 -- msg:<message id> · call:<call id>
  conversation_id  UUID,                          -- no FK: a deleted conversation keeps its history
  status           TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'waiting', 'done', 'failed', 'skipped')),
  resume_at        TIMESTAMPTZ,
  resume_node      TEXT,
  context          JSONB NOT NULL DEFAULT '{}'::jsonb,
  steps            JSONB NOT NULL DEFAULT '[]'::jsonb,
  error            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (automation_id, event_key)
);
CREATE INDEX IF NOT EXISTS automation_runs_list_idx ON public.automation_runs (automation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS automation_runs_conv_idx ON public.automation_runs (automation_id, conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS automation_runs_due_idx ON public.automation_runs (resume_at) WHERE status = 'waiting';
CREATE INDEX IF NOT EXISTS automation_runs_running_idx ON public.automation_runs (updated_at) WHERE status = 'running';
CREATE INDEX IF NOT EXISTS automation_runs_age_idx ON public.automation_runs (created_at);

DO $$ DECLARE t TEXT; BEGIN
  FOREACH t IN ARRAY ARRAY['automations', 'automation_runs'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE format('REVOKE ALL ON public.%I FROM authenticated', t);
    END IF;
  END LOOP;
END $$;

-- Start a run, or say why not, in one step. The advisory lock is per flow and
-- conversation, so two webhooks for the same customer at the same moment can't
-- both pass the cool-down check. Returns {ok, run_id} or {ok:false, reason}:
--   off        the flow is switched off, deleted, or another business's
--   duplicate  this event already started a run of this flow
--   cooldown   it ran for this conversation less than p_cooldown_min ago
--   cap        it already ran p_daily_cap times in the last 24 hours
CREATE OR REPLACE FUNCTION public.automation_start_run(
  p_company UUID, p_automation UUID, p_event TEXT, p_conversation UUID,
  p_cooldown_min INT, p_daily_cap INT, p_context JSONB
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id UUID;
BEGIN
  IF p_event IS NULL OR p_event = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_event');
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('automation:' || p_automation::text || ':' || COALESCE(p_conversation::text, p_event)));

  PERFORM 1 FROM public.automations WHERE id = p_automation AND company_id = p_company AND enabled FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'off');
  END IF;

  IF EXISTS (SELECT 1 FROM public.automation_runs WHERE automation_id = p_automation AND event_key = p_event) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'duplicate');
  END IF;

  IF COALESCE(p_cooldown_min, 0) > 0 AND p_conversation IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.automation_runs
     WHERE automation_id = p_automation AND conversation_id = p_conversation
       AND status <> 'skipped'
       AND created_at > now() - make_interval(mins => p_cooldown_min)
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'cooldown');
  END IF;

  IF COALESCE(p_daily_cap, 0) > 0 AND (
    SELECT count(*) FROM public.automation_runs
     WHERE automation_id = p_automation AND created_at > now() - interval '24 hours'
  ) >= p_daily_cap THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'cap');
  END IF;

  INSERT INTO public.automation_runs (company_id, automation_id, event_key, conversation_id, status, context)
  VALUES (p_company, p_automation, p_event, p_conversation, 'running', COALESCE(p_context, '{}'::jsonb))
  ON CONFLICT (automation_id, event_key) DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'duplicate');
  END IF;

  UPDATE public.automations SET run_count = run_count + 1, last_run_at = now() WHERE id = p_automation;
  RETURN jsonb_build_object('ok', true, 'run_id', v_id);
END $$;

-- Waiting runs whose time has come, each handed to exactly one caller (it
-- flips them to running). Runs left "running" for 15 minutes (the worker
-- stopped part-way) are marked failed so they don't sit there forever.
CREATE OR REPLACE FUNCTION public.automation_claim_due(p_limit INT)
RETURNS SETOF public.automation_runs
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.automation_runs
     SET status = 'failed', error = COALESCE(error, 'Stopped part-way through (timed out).'), updated_at = now()
   WHERE status = 'running' AND updated_at < now() - interval '15 minutes';

  RETURN QUERY
  UPDATE public.automation_runs r
     SET status = 'running', updated_at = now()
   WHERE r.id IN (
     SELECT id FROM public.automation_runs
      WHERE status = 'waiting' AND resume_at <= now()
      ORDER BY resume_at
      LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 200))
      FOR UPDATE SKIP LOCKED
   )
  RETURNING r.*;
END $$;

DO $$ DECLARE f TEXT; BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.automation_start_run(uuid, uuid, text, uuid, int, int, jsonb)',
    'public.automation_claim_due(int)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', f); END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', f); END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f); END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

-- ── Rollback ─────────────────────────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS public.automation_claim_due(int);
-- DROP FUNCTION IF EXISTS public.automation_start_run(uuid, uuid, text, uuid, int, int, jsonb);
-- DROP TABLE IF EXISTS public.automation_runs, public.automations;
