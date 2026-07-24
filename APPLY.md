# Call recording, transcription, summary, sentiment and action items

Two files:

    cp -R app ~/Desktop/frill-clone/

## Why nothing was recorded

`recordStart` was only ever called in one place: after `call.speak.ended`, when
the call status was `voicemail_greeting`. So **only voicemails were recorded**.

Answered calls — inbound and outbound — produced no audio, therefore no
transcript, no summary, no sentiment, no action items. The example that DID
show a summary was a voicemail ("reached a voicemail or automated message"),
which is why it looked like the feature worked.

## 1. app/api/telnyx/webhook/route.ts

**Records answered calls.** Right after the agent leg is bridged to the caller,
recording starts on the parent leg with `channels: 'dual'` so agent and caller
land on separate tracks and the transcript reads as a dialogue.

**Routes recordings correctly.** `call.recording.saved` now checks whether the
call is actually a voicemail before marking it as one — otherwise every
recorded conversation would be filed as a voicemail. For a real call it saves
`recording_url` and fires `/api/telnyx/transcribe`, which already chains into
`/api/telnyx/call-summary`.

Fire-and-forget: the recording is saved either way, and transcription is slow.

## 2. app/api/telnyx/call-summary/route.ts

Was writing `ai_summary` only, while returning todos that went nowhere. Now
also persists `ai_todos` and asks for a `sentiment` of positive/neutral/negative,
validated before being written.

Both columns are already read by the mobile call detail screen.

## Check your schema

If these don't exist, add them:

    alter table calls add column if not exists ai_todos jsonb;
    alter table calls add column if not exists sentiment text;

## Transcription needs a key

`/api/telnyx/transcribe` uses Deepgram or OpenAI Whisper. With neither key set,
recordings still save and play back — there's just no transcript or summary.
Check `DEEPGRAM_API_KEY` or `OPENAI_API_KEY` in your Vercel environment.

## Verify

1. Answer an inbound call, talk for ~20 seconds, hang up.
2. Vercel logs: `[telnyx record] started for answered call`, then
   `[telnyx record] saved for answered call`.
3. Open the call in Call Logs — recording, then transcript and summary once
   transcription finishes.
