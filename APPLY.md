# Bridge fix + call recording (supersedes colvy-web-call-recording.zip)

Two files. This includes the earlier recording patch, so apply this one only.

    cp -R app ~/Desktop/frill-clone/

## 1. The caller hears nothing — bridge never happened

You answer on the phone, but the person who dialled stays connected to silence.

The webhook found the caller's leg like this:

    const { data: parent } = await db.from('calls')
      .select('*').eq('status', 'ringing_agents')
      .order('created_at', { ascending: false }).limit(1)

The most recent `ringing_agents` row across EVERY company, with no time bound.
It found nothing whenever the status had already moved on — timeout, voicemail,
a second call — producing the log you saw:

    [telnyx bridge] could not bridge — missing parent or api_key
    { hasParent: false, hasKey: false }

(`hasKey: false` was a consequence: the api_key is only looked up if a parent
was found.)

**Now** it matches on `agent_call_control_id` — when the child leg was created,
its id was stored on the parent row, so this is an exact link rather than a
guess. A recency fallback remains, scoped to the last 2 minutes and to ringing
statuses, and the failure log now includes the agent leg id and parent status.

## 2. Recording, transcription, summary, sentiment, action items

`recordStart` previously ran ONLY for voicemail greetings, so answered calls
produced no audio and therefore no transcript or AI output.

- Recording now starts as soon as the agent leg is bridged, `channels: 'dual'`
  so agent and caller are on separate tracks.
- `call.recording.saved` distinguishes a voicemail from a real call before
  filing it, saves `recording_url`, and fires `/api/telnyx/transcribe`, which
  already chains into `call-summary`.
- `call-summary` now persists `ai_todos` and a validated `sentiment`
  (positive / neutral / negative), not just `ai_summary`.

## Schema

    alter table calls add column if not exists ai_todos jsonb;
    alter table calls add column if not exists sentiment text;

## Transcription key

`/api/telnyx/transcribe` needs `DEEPGRAM_API_KEY` or `OPENAI_API_KEY` in Vercel.
Without one, recordings save and play back but there's no transcript or summary.

## Verify

1. Call the Telnyx number, answer on the phone, and check the CALLER can hear
   you — that's the bridge.
2. Vercel logs: `[telnyx record] started for answered call`.
3. Hang up, wait a moment, open the call in Call Logs: recording, then
   transcript, summary, sentiment and action items.
