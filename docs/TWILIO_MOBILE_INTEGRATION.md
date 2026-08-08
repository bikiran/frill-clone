# Twilio voice & SMS — mobile integration reference

How `colvy-mobile` should talk to this backend for calling and texting. The
server hides all carrier detail: the app never sees Twilio (or Telnyx)
credentials, only the endpoints below. This mirrors what the web components
`components/CallBar.tsx` and `components/IncomingCallListener.tsx` do.

## 1. Which carrier is this company on?

Read the company row (Supabase): `companies.voice_provider`, `companies.sms_provider`,
`companies.number_provider` (each `'telnyx' | 'twilio'`, default `'telnyx'`).
For a Twilio company, use the Twilio Voice React Native SDK; the flow below is
the Twilio path. (Telnyx uses its own WebRTC SDK — out of scope here.)

## 2. Voice access token

`POST /api/twilio/token`
```json
{ "companyId": "<uuid>", "userId": "<auth user id>" }
```
→ `200 { "token": "<JWT>", "identity": "u_<userId>", "from": "+61..." }`
or `4xx { "error": "..." }`.

- The token is a Twilio Voice Access Token (TTL 3600s) — **re-mint before it
  expires** and re-register.
- The server self-provisions/repairs the API key + TwiML App; the app does
  nothing for setup.
- `identity` is `twilioIdentity(userId, companyId)` = `u_<userId with non
  [a-zA-Z0-9_] stripped>`. Inbound calls are dialled to this identity, so the
  Device **must** register with this token to receive calls.

## 3. Outbound call

Register/accept with the token, then place the call with these params (the
server's TwiML app routes them to `/api/twilio/voice/outbound`):
```
connect(params = {
  To: "<E.164 destination>",     // normalise: 04xx → +614xx, etc.
  From: "<from from step 2>",     // caller ID = the company's Twilio number
  callRowId: "<optional calls row id>",
  companyId: "<uuid>",
  conversationId: "<optional>"
})
```
Recording, transcription and the thread call-card are handled server-side via
callbacks — the app doesn't upload anything.

## 4. Inbound call

Entirely server-driven. When someone rings the company number, the server rings
every **online** agent's `<Client><Identity>u_<userId></Identity>`. The app just
needs a **registered Device** (step 2) and to surface the incoming-call event.
No webhook handling on the device.

## 5. Presence heartbeat — REQUIRED for inbound

`POST /api/telnyx/presence` (provider-agnostic despite the path)
```
Headers: Authorization: Bearer <supabase access token>
Body:    { "companyId": "<uuid>" }
```
Call this every ~45s while the app is foregrounded. The inbound webhook only
rings agents seen in the last 2 minutes — **without this heartbeat, inbound
calls go straight to voicemail.** (Web does this from `app/admin/layout.tsx`.)

## 6. Send SMS / MMS

`POST /api/telnyx/sms/send` (provider-agnostic — routes via `resolveSmsSender`)
```json
{ "companyId": "<uuid>", "conversationId": "<uuid?>", "to": "<E.164?>",
  "text": "<message>", "senderName": "<optional>", "attachments": [ ... ] }
```
Provide `conversationId` (destination resolved from the thread) or an explicit
`to`. On Twilio, image attachments send as real MMS; otherwise they go as short
links. The message is logged into the thread automatically.

## 7. Inbound SMS

Delivered server-side into `conversations` / `messages` (Supabase). The app
reads/subscribes to those tables — no device webhook.

## 8. Diagnostics (super-admin)

`GET /api/twilio/voice-check?companyId=<uuid>` with a super-admin Bearer token
returns a per-dependency pass/fail (account creds, API key validity, TwiML App
+ Voice URL, the number's inbound webhooks, agents online). Use it to explain a
"phone won't connect" report.

## Notes

- Numbers are provisioned/assigned from the web Super Admin panel; the app never
  buys or assigns numbers.
- All Twilio credentials live only in server env (`TWILIO_MASTER_*`). The app
  only ever holds the short-lived access token from step 2.
