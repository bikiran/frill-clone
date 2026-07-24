# Ring every teammate's device

Run the migration FIRST, then deploy.

    # 1. Supabase SQL editor
    #    paste MIGRATION_V190.sql

    # 2. code
    cp -R app ~/Desktop/frill-clone/

Mobile: colvy-mobile v1.54.0 (sends userId when fetching a token).

## The problem

Every client logged in with the SAME telephony credential (`credential_id` on
telnyx_integrations). Telnyx routes an inbound call to the most recent
registration, so the last device to sign in took the call and every other one
stayed silent. Nothing about that is fixable while the credential is shared.

## The change

**token/route.ts** — accepts `userId`. Each user gets their own telephony
credential on the same WebRTC connection, created once and stored in
`telnyx_user_credentials`, reused afterwards. Telnyx generates the
`sip_username`, which is read back and stored — that's the address Call Control
dials to reach that client. Callers that don't send a userId still work on the
shared credential, so the web keeps working until it's updated too.

**webhook/route.ts** —

- After dialling the first agent, creates an extra child leg for every OTHER
  registered user's sip_username, all linked to the same parent. Every
  registered device rings at once.
- The extra leg ids are stored in `calls.ringing_leg_ids`.
- On answer, the parent is found by agent leg id, by fan-out leg id, or by
  recency — then the winning leg is bridged and **all other legs are hung up**,
  so colleagues' phones stop ringing immediately.

## Verify

With two devices signed in as different users:

    select user_id, sip_username from telnyx_user_credentials
    where company_id = 'f468f5ed-d5c7-4e4e-af64-136d36ccc74f';

Two rows with different sip_usernames. Then call the number: both should ring,
and answering on one should stop the other within a second or two.

Vercel logs:

    [telnyx inbound] ringing additional devices { count: 1 }
    [telnyx bridge] bridged agent leg to caller
    [telnyx bridge] cancelled other ringing devices { count: 1 }

## Note on the web app

The web still sends no userId, so it uses the shared credential. That's fine —
it registers as one more device. Adding `userId` to its token request gives it
its own credential too, which is worth doing once this is proven.
