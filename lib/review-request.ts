// "Ask for a review" from the reply composer. Nothing here sends: the composer
// shows the message first, and only an explicit Send (or Insert into reply)
// does anything. Plain text, no emoji.

export const REVIEW_REQUEST_MESSAGE = "We'd love your feedback! Could you take a moment to leave us a review?"
export const REVIEW_REQUEST_SUBJECT = "We'd love your feedback"

export type ReviewChannelKind = 'sms' | 'email' | 'instagram' | 'facebook' | 'chat' | 'none'

export interface ReviewChannel {
  kind: ReviewChannelKind
  label: string        // "SMS", "email", "Instagram"…
  to?: string | null   // the number or address, when we know it
  note?: string        // why it isn't the usual channel (e.g. opted out of texts)
}

/**
 * Which channel a review request goes by. It follows the conversation's
 * current send channel (the "Sending by …" label). Text channels need a mobile
 * and consent: someone who replied STOP is never texted, and gets it by email
 * instead when we have their address.
 */
export function pickReviewChannel(i: {
  current: string | null | undefined      // sendChannel override, else the outbound channel
  mobile?: string | null
  email?: string | null
  smsOptedOut?: boolean
}): ReviewChannel {
  const cur = String(i.current || '').toLowerCase()
  const mobile = (i.mobile || '').trim() || null
  const email = (i.email || '').trim() || null
  const emailCh = (note?: string): ReviewChannel => ({ kind: 'email', label: 'email', to: email, ...(note ? { note } : {}) })

  if (cur === 'email') return email ? emailCh() : { kind: 'email', label: 'email', to: null }
  if (cur === 'instagram') return { kind: 'instagram', label: 'Instagram' }
  if (cur === 'facebook' || cur === 'messenger') return { kind: 'facebook', label: 'Messenger' }

  // SMS, phone calls, live chat, WhatsApp and anything else: text them if we
  // may, else email, else (live chat only) the chat itself.
  if (mobile && !i.smsOptedOut) return { kind: 'sms', label: 'SMS', to: mobile }
  const optedNote = mobile && i.smsOptedOut ? 'They’ve opted out of texts' : undefined
  if (email) return emailCh(optedNote)
  if (cur === 'chat' || cur === 'widget') return { kind: 'chat', label: 'live chat' }
  return { kind: 'none', label: 'no channel', note: optedNote || 'No mobile or email for this customer' }
}

/** The message plus the review link on its own line. */
export function composeReviewText(message: string, link: string | null | undefined): string {
  const m = String(message || '').trim()
  const l = String(link || '').trim()
  if (!l) return m
  if (m.includes(l)) return m
  return m ? `${m}\n${l}` : l
}

export type ReviewAction = 'send' | 'insert'

/**
 * What the popover's buttons do. The review link is only created here, on an
 * explicit Send / Insert click — opening, reading or editing the preview makes
 * no request. When no review link is set up the first click stops and says so
 * (returns 'needs-confirm'); a second click with allowNoLink goes ahead.
 */
export async function runReviewAction(action: ReviewAction, o: {
  message: string
  getLink: () => Promise<string | null>
  send: (text: string) => Promise<void>
  insert: (text: string) => void
  allowNoLink?: boolean
}): Promise<'done' | 'needs-confirm' | 'empty'> {
  if (!String(o.message || '').trim()) return 'empty'
  let link: string | null = null
  try { link = await o.getLink() } catch { link = null }
  if (!link && !o.allowNoLink) return 'needs-confirm'
  const text = composeReviewText(o.message, link)
  if (action === 'send') await o.send(text)
  else o.insert(text)
  return 'done'
}
