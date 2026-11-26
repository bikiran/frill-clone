// The number a texting conversation replies to: whichever of the customer's
// mobiles texted last.
//
// conversations.sms_number is where replies go (the inbox, AI replies,
// auto-replies and reminders all read it) and the number an incoming text is
// matched by. A send already records the number it texted; an incoming text
// now moves it to the number the text came from. So a customer writing from
// a second mobile (merged into their conversation, lib/same-customer) gets
// the answer on that phone, and on their usual one when they text from it
// again.
//
// No server imports: the inbox uses this too.

import { phoneKey } from '@/lib/phone'

/**
 * The number to set on a conversation for a text from `from`, or null to
 * leave it as it is. A STOP from another phone doesn't move replies onto the
 * phone that asked to stop (the conversation's own number stays).
 */
export function replyNumberFor(
  conv: { sms_number?: string | null } | null | undefined,
  from: string | null | undefined,
  opts: { optingOut?: boolean } = {},
): string | null {
  if (!from) return null
  if (!conv?.sms_number) return from
  if (opts.optingOut) return null
  return phoneKey(conv.sms_number) === phoneKey(from) ? null : from
}

/** A stored sender that is a phone number. An incoming text keeps its number as sender_name. */
export function phoneOf(s?: string | null): string | null {
  const t = String(s || '').trim()
  return /^\+?[\d\s().-]+$/.test(t) && phoneKey(t).length >= 9 ? t : null
}

/** The number of the latest text that came in on this conversation, or null. */
export async function lastTextedNumber(db: any, conversationId: string): Promise<string | null> {
  if (!conversationId) return null
  try {
    const { data } = await db.from('messages').select('sender_name')
      .eq('conversation_id', conversationId).eq('sender_type', 'visitor').eq('delivery_channel', 'sms')
      .order('created_at', { ascending: false }).limit(1).maybeSingle()
    return phoneOf(data?.sender_name)
  } catch { return null }
}

type CallRow = { direction?: string | null; from_number?: string | null; created_at?: string | null }
type MessageRow = { sender_type?: string | null; delivery_channel?: string | null; sender_name?: string | null; created_at?: string | null }

/**
 * The number to ring back: whichever of the customer's numbers last called
 * or texted in on this conversation, else the conversation's own number,
 * else their contact's. A call can go to a landline, so a call from one
 * counts here (a text reply still goes to the number that texted).
 */
export function callBackNumber(o: {
  calls?: CallRow[] | null
  messages?: MessageRow[] | null
  smsNumber?: string | null
  contactPhone?: string | null
}): string | null {
  let best: { n: string; at: string } | null = null
  const consider = (n: string | null, at?: string | null) => {
    if (!n) return
    const t = String(at || '')
    if (!best || t > best.at) best = { n, at: t }
  }
  for (const c of o.calls || []) if (c?.direction === 'inbound') consider(phoneOf(c.from_number), c.created_at)
  for (const m of o.messages || []) if (m?.sender_type === 'visitor' && m.delivery_channel === 'sms') consider(phoneOf(m.sender_name), m.created_at)
  return (best as { n: string } | null)?.n || o.smsNumber || o.contactPhone || null
}
