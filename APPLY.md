# Fix: phone registered on a credential nothing dials

Replaces colvy-web-ring-all-devices.zip. Run the migration, then deploy.

## What broke

The token route created a per-user credential on Telnyx and used it EVEN IF
storing it in `telnyx_user_credentials` failed:

    if (credErr) console.error('could not store user credential')
    effectiveCredentialId = newId    // used regardless

If the migration hadn't been applied, the table didn't exist, the insert
failed — and the phone then registered on a credential the webhook can't find,
because the fan-out only dials credentials listed in that table.

The device looked perfectly registered and simply never rang. Two-way audio had
been working right before, on the shared credential.

## The change

**token/route.ts** — the per-user credential is only used if it was stored
successfully AND Telnyx returned a sip_username. Otherwise it stays on the
shared credential, which is always dialled. Fail safe rather than fail silent.

**webhook/route.ts** — a missing/erroring `telnyx_user_credentials` table is now
logged explicitly instead of quietly reducing to a single target.

## Order

1. Run MIGRATION_V190.sql in Supabase — without it there are no per-user
   credentials and only the shared one rings.
2. Deploy.
3. Restart the mobile app so it fetches a fresh token.

## Verify

    select user_id, sip_username from telnyx_user_credentials;

A row per signed-in user. If it's empty after restarting the app, check the
Vercel log for "could not store per-user credential" — calling still works via
the shared credential, so this degrades rather than breaks.
