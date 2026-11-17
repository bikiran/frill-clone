# Colvy Automations: the visual builder

> Draw what should happen when a customer writes or a call is missed. Colvy does it, every time.

Owners and admins open **Settings → Automations**, pick a starting point (or start from scratch) and get a canvas: a trigger, then checks and actions joined by lines. Drag steps from the palette (or tap to add), drag from a step's dot to another step to join them, tap a line to remove it, tap a step to edit it. **Try it** walks a made-up message through the flow and lights up the path it takes. Switching it **Live** needs a flow with nothing left to fix.

Phase 1 (this): triggers *a customer sends a message* (any channel, or the ones picked; optionally the first message only) and *a call is missed*. Phase 2: *an order's status changes* (Woo / Shopify / Prexty order paths are several and need one event first).

## Steps

| Group | Steps |
|---|---|
| Checks (yes / no) | Message mentions… (whole words, plurals, accents ignored) · Came in on… · Open or closed (Business hours; unknown counts as closed) · Customer has tag · New customer · Still waiting for a reply |
| Actions | Send a reply ({first_name}, {name}, {business_name}) · Assign to · Tag the customer · Create a task (deduped against open tasks) · Add a note · Notify the team · Hand to Colvy AI · Pause Colvy AI here · Close the conversation |
| Timing | Wait (1 minute to 7 days; at most 5 on one path) |

A flow is one trigger and a tree: every port leads to at most one next step and there are no loops, so a run is always one path. `lib/automations/graph.ts` keeps posted flows in those bounds (`cleanGraph`), lists what must be fixed before going live (`problems`), and does the dry run (`simulate`). Six templates: after-hours reply, refunds to a person (the rest to Colvy AI), nobody replied in 15 minutes, welcome new customers, missed-call follow-up, blank.

## Architecture

| Piece | Where |
|---|---|
| Schema + run functions | `migrations/COLVY_V440_AUTOMATIONS.sql` (`automations`, `automation_runs`, `automation_start_run`, `automation_claim_due`) |
| Flow model, checks, dry run, templates | `lib/automations/graph.ts` (pure) |
| Running flows, waits | `lib/automations/engine.ts` |
| Hooks | `app/api/ai/reply` (SMS + website chat), Meta webhook, WhatsApp, email webhook, Gmail sync, `queueMissedCallText` |
| Waits | `app/api/cron/automations`, every minute (`vercel.json`) |
| API | `app/api/automations` (list, create from template), `app/api/automations/[id]` (get with runs/team/tags, save, live on/off, delete). Owners and admins only. |
| UI | `app/admin/crm-settings/automations` (list), `app/admin/automations/[id]` (builder), `components/automations/*` |

### Running safely

- **Once per event.** `automation_start_run` takes an advisory lock per flow and conversation, refuses a second run for the same message or call (unique `(automation_id, event_key)`), honours the trigger's cool-down per conversation (default 12 hours) and a daily limit of 500 runs per flow. Tested with parallel webhooks.
- **No double answers.** At most one automated reply per customer message across all flows. Replies are saved as Colvy's (`is_ai`, `metadata.automation_id`), so the Support Agent stands down, and `/api/ai/reply` skips the older auto-reply when a flow replied or paused Colvy AI, unless the flow said *Hand to Colvy AI*.
- **Waits** save the flow as it was (a mid-wait edit can't send the run somewhere odd) and the step to carry on from. The cron claims due runs with `FOR UPDATE SKIP LOCKED`; a run left "running" for 15 minutes is marked failed. Switching a flow off, deleting it, its conversation becoming spam or the plan changing stops waiting runs.
- **Never for** spam, blocked senders, a customer who opted out of texts (replies), or businesses without Automations on their plan (Inbox / Everything, `planAllows(..., 'aiAutomation')`).
- **Editing a live flow** into something incomplete switches it off and says why; it never runs half-finished.
- **Run history**: the last 40 runs per flow with each step's result, kept 90 days.

## Tests

- `npx tsx scripts/automations.test.mjs`: cleaning, problems, checks, triggers, filling names, dry run, templates.
- `node scripts/automations-sql.test.mjs`: V440 against real Postgres (re-runnable, RLS and grants, start rules, races, claiming waits, stuck runs, cascades).
- End to end against the local mock: create from a template, edit, go live, a real message through `/api/ai/reply`, once per message, cool-down, a wait resumed by the cron, switched off, spam skipped.

## Later

- Order status trigger (phase 2), then booking created / cancelled.
- "Send an email / text to the team", "Add to a campaign list", "Create a job".
- Versions (draft and live side by side) if editing live flows turns out to be common.
