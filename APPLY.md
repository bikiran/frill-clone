# Auto-assign on first reply — web

One file changed: `app/admin/inbox/page.tsx`

Copy it over your copy:

    cp -R app ~/Desktop/frill-clone/

## What changed

Two edits, both inside the inbox page.

**1. New helper `claimIfUnassigned()`**, added directly above `sendReply`.

Claims an unassigned conversation for whoever replies:

- returns immediately if `assigned_to` or `assigned_name` is already set, so an
  existing owner is never overwritten
- updates optimistically so the header changes straight away
- the write is guarded with `.is('assigned_to', null)`, so if a colleague
  claimed it moments earlier the update matches no rows and we reload to show
  *their* name instead of stealing it
- logs an `assigned` timeline event and shows a toast

**2. One line inside `sendReply`**, just after `setSending(true)`:

    if (!internalMode) claimIfUnassigned()

Placed before the per-channel branches so it applies to chat, SMS, email and
Meta replies alike, without touching each one.

## Behaviour notes

- Internal notes do NOT claim the conversation. Leaving a private note for a
  colleague isn't the same as taking the customer on.
- This matches Colvy Mobile v1.35.0, so a reply from either client behaves the
  same way.

## Verify

1. Open an unassigned conversation, send a reply.
2. The header should switch from "Unassigned" to your name, and the timeline
   should show "Auto-assigned to <you> on first reply".
3. Open a conversation already assigned to a colleague and reply — their name
   must stay.
