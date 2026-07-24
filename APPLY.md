# THE missing piece: inbound calls never had a database row

Supersedes every earlier web patch — apply this one.

    cp -R app ~/Desktop/frill-clone/

## What the log showed

    [telnyx bridge] could not bridge — missing parent or api_key
    { hasParent: false, hasKey: false,
      agentLeg: 'v3:pDf-wIr2wj_...', parentId: null, parentStatus: null }

`parentId: null` — no `calls` row was found by agent leg id OR by recency.

Because there wasn't one. **The webhook only ever UPDATEs `calls`. There is no
INSERT anywhere in the file.** Inbound calls never had a row created.

That one gap explains all of it:

- the bridge had no parent, so the caller stayed connected to silence
- inbound calls never appeared in the call logs
- recordings had nothing to attach to
- `update({ status: 'ringing_agents', agent_call_control_id })` matched zero rows

## The change

On `call.initiated` for an inbound call, after the contact is matched, insert
the row — with `company_id`, direction, numbers, caller name, contact,
conversation, `telnyx_call_control_id` and `telnyx_call_session_id`. Guarded by
an existence check so a retried webhook can't duplicate it.

`conversation_id` is set too, so the call also shows inside the chat thread.

Also included from earlier patches:
- bridge matches on `agent_call_control_id` (exact) with a 2-minute recency fallback
- recording starts on answered calls, not only voicemail
- `call-summary` persists `ai_todos` and `sentiment`

## Verify

Vercel logs, in order, for one inbound call:

    [telnyx inbound] call row created
    [telnyx inbound] child call created
    [telnyx inbound] stored agent leg   ← updData should now contain a row
    [telnyx bridge] bridged agent leg to caller
    [telnyx record] started for answered call

Then answer on the phone: the caller should hear you.

## Schema

    alter table calls add column if not exists ai_todos jsonb;
    alter table calls add column if not exists sentiment text;
