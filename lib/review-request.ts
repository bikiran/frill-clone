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
 * current send channel (the "Sending by …" label):
 *   - a blocked contact, or one who unsubscribed (other than by texting STOP),
 *     gets nothing — Send is disabled and the reason shown;
 *   - a channel the agent picked by hand (forced) is kept, or we say why not;
 *   - otherwise text needs a mobile and no STOP; someone who replied STOP gets
 *     it by email instead when we have their address.
 */
export function pickReviewChannel(i: {
  current: string | null | undefined      // sendChannel override, else the outbound channel
  forced?: boolean                        // the agent chose the channel (not "Automatic")
  mobile?: string | null
  email?: string | null
  smsOptedOut?: boolean                   // replied STOP (texts only)
  blocked?: boolean
  unsubscribed?: boolean                  // unsubscribed from messages, not by an SMS STOP
}): ReviewChannel {
  const cur = String(i.current || '').toLowerCase()
  const mobile = (i.mobile || '').trim() || null
  const email = (i.email || '').trim() || null
  const none = (note: string): ReviewChannel => ({ kind: 'none', label: 'no channel', note })
  const emailCh = (note?: string): ReviewChannel => ({ kind: 'email', label: 'email', to: email, ...(note ? { note } : {}) })
  const STOP_NOTE = 'They’ve opted out of texts'

  if (i.blocked) return none('This contact is blocked')
  if (i.unsubscribed) return none('They’ve unsubscribed from messages')

  if (cur === 'email') return email ? emailCh() : none('No email address for this customer')
  if (cur === 'instagram') return { kind: 'instagram', label: 'Instagram' }
  if (cur === 'facebook' || cur === 'messenger') return { kind: 'facebook', label: 'Messenger' }

  if (i.forced) {
    // The agent chose this channel: keep it, or say why it can't be used.
    if (cur === 'chat' || cur === 'widget') return { kind: 'chat', label: 'live chat' }
    if (cur === 'sms') {
      if (!mobile) return none('No mobile number for this customer')
      if (i.smsOptedOut) return none(`${STOP_NOTE}. Choose Email under Send via to email it`)
      return { kind: 'sms', label: 'SMS', to: mobile }
    }
  }

  // Automatic — SMS, phone calls, live chat, WhatsApp and anything else: text
  // them if we may, else email, else (live chat only) the chat itself.
  if (mobile && !i.smsOptedOut) return { kind: 'sms', label: 'SMS', to: mobile }
  const optedNote = mobile && i.smsOptedOut ? STOP_NOTE : undefined
  if (email) return emailCh(optedNote)
  if (cur === 'chat' || cur === 'widget') return { kind: 'chat', label: 'live chat' }
  return none(optedNote || 'No mobile or email for this customer')
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
 * (returns 'needs-confirm'); a second click with allowNoLink goes ahead. When
 * the link couldn't be made ('link-error') nothing is sent; try again.
 */
export async function runReviewAction(action: ReviewAction, o: {
  message: string
  getLink: () => Promise<string | null>
  send: (text: string) => Promise<void>
  insert: (text: string) => void
  allowNoLink?: boolean
}): Promise<'done' | 'needs-confirm' | 'link-error' | 'empty'> {
  if (!String(o.message || '').trim()) return 'empty'
  let link: string | null = null
  // getLink returns null when no review link is set up, and throws when the
  // link couldn't be made just now (network / server) — that's a retry, not
  // a reason to send without one.
  try { link = await o.getLink() } catch { return 'link-error' }
  if (!link && !o.allowNoLink) return 'needs-confirm'
  const text = composeReviewText(o.message, link)
  if (action === 'send') await o.send(text)
  else o.insert(text)
  return 'done'
}
