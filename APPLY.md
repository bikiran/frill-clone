# Web patch — call routing to phones, and push for mentions

Three files changed. Copy them over:

    cp -R app ~/Desktop/frill-clone/

## 1. app/api/telnyx/webhook/route.ts — THE FIX FOR CALLS

Inbound calls only dialled the SIP client when `agent_presence` had a heartbeat
from the last 2 minutes. That heartbeat only exists while a browser tab or the
mobile app is OPEN, so with everything closed the webhook never dialled at all —
it went straight to voicemail without ringing. That's why the SIP trace showed
no INVITE reaching the device.

Now it also dials when the company has at least one registered mobile device:

    const { data: mobileDevices } = await db.from('push_tokens')
      .select('id').eq('company_id', companyId).limit(1)
    const anyMobile = (mobileDevices || []).length > 0

    const anyOnline = (onlineCount > 0 || anyMobile) && !!sipUser

Telnyx then sends its own VoIP push (the `X-Telnyx-Internal-PN-Android` header
seen in the trace), which wakes the app. The ring timeout already in place
(`integ.ring_seconds`, default 25s) gives the phone time to attach before
voicemail takes over.

## 2. app/api/push/send/route.ts

- `userIds: string[]` — target specific people instead of the whole company.
  Needed for mentions and task assignments.
- `route` — deep link for notifications that aren't about a conversation.
- `categoryId` — enables the inline Reply / Mark read actions on Android.
- Body truncation raised from 160 to 500 characters, so Android's expandable
  notification actually has something to expand.

## 3. app/api/mentions/notify/route.ts

Sends a push to the mentioned users alongside the existing email.
Fire-and-forget, matching how the email is handled: the in-app notification is
already written, so a push failure must never fail the action.

## Verify

Calls: close every browser tab AND force-close the mobile app, then call the
Telnyx number. The phone should ring. Check the server log line
`[telnyx inbound] routing decision` — it now includes `mobileDevices`.

Mentions: @mention a colleague in an internal note; their phone should get
"<you> mentioned you".
