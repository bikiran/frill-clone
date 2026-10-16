import { createClient } from '@supabase/supabase-js'
import { internalHeaders } from '@/lib/internal-call'
import { isLiveOnPage } from '@/lib/channel-choice'

/**
 * Deciding HOW to deliver an automated message.
 *
 * Writing to the conversation thread is not delivery. If the customer isn't
 * sitting on the site with the chat widget open, a thread message is something
 * they may never see — order confirmations were effectively vanishing for
 * anyone who had closed the tab.
 *
 * So: always record the message in the thread (it's the history), then check
 * whether they're actually watching. If they're not, push it out over a channel
 * that reaches them — SMS first, then email.
 */

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// How recently the widget must have checked in for the customer to count as
// "watching": LIVE_ON_PAGE_MS (2 minutes), the same window the inbox and the
// channel rule use. The widget heartbeats every 60s while the page is open,
// so one missed beat doesn't make them look gone.

/**
 * Is the customer live on the chat widget right now?
 *
 * Uses conversations.page_seen_at, which ONLY the widget writes. last_message_at
 * is not usable here — agents update it, so an agent replying would make the
 * customer look present and suppress the SMS that should have been sent.
 */
export async function isCustomerOnLiveChat(conversationId: string, db?: any): Promise<boolean> {
  const client = db || admin()
  try {
    const { data } = await client.from('conversations')
      .select('page_seen_at').eq('id', conversationId).maybeSingle()
    return isLiveOnPage(data?.page_seen_at)
  } catch {
    // If presence can't be determined, assume they're NOT watching. Sending a
    // duplicate SMS is a far smaller failure than an order confirmation nobody
    // ever receives.
    return false
  }
}

export interface FallbackResult {
  onLiveChat: boolean
  channel: 'live_chat' | 'sms' | 'email' | 'none'
  sent: boolean
  error?: string
  /** Why this channel was tried first, in plain English (the 'auto' rule). */
  reason?: string
  /** The text was queued for the start of sending hours. */
  deferredUntil?: string
  /** The text was refused because the customer opted out (lib/sms-consent). */
  optedOut?: boolean
}

/**
 * Send an automated message over whatever channel will actually reach them.
 *
 * @param force  Send by SMS/email even if they are on live chat (the old
 *               "also send SMS" behaviour, kept for confirmations a customer
 *               should have a copy of regardless).
 */
export async function deliverAutomatedMessage(params: {
  companyId: string
  conversationId: string
  text: string
  phone?: string | null
  email?: string | null
  senderName?: string | null
  subject?: string
  origin: string
  force?: boolean
  // Which channel to try first when the customer isn't on live chat. Defaults to
  // SMS (highest read rate). Set 'email' for a conversation that isn't an SMS
  // thread — e.g. an order/website/email enquiry — so an order confirmation goes
  // out on the channel the customer is actually known on, not to a billing phone
  // that was never captured on their contact.
  //
  // 'auto' applies the shared rule (lib/channel-choice): the channel the
  // customer last used to contact the business; else SMS when they have a
  // mobile, haven't opted out and the business can text; else email.
  // `channelSetting` is an automation's own choice ('auto' | 'sms' | 'email').
  preferChannel?: 'sms' | 'email' | 'auto'
  channelSetting?: 'auto' | 'sms' | 'email' | null
  // The thread row the caller already wrote for this message. An email send
  // stamps it with its subject and Message-ID (so a reply threads back to it).
  threadMessageId?: string | null
  // 'auto' only: the first channel for a customer who has never messaged us.
  // Order messages pass 'email'.
  newCustomerDefault?: 'sms' | 'email'
  // Keep automated texts to sending hours (9am–8pm in the business's time zone).
  // Outside them the message goes by email when there's an address, otherwise
  // the text is queued for the morning (scheduled_messages, channel 'sms_auto').
  sendingHours?: boolean
  db?: any
}): Promise<FallbackResult> {
  const { companyId, conversationId, text, phone, email, senderName, subject, origin, force, channelSetting, threadMessageId, newCustomerDefault, sendingHours, db } = params
  let preferChannel = params.preferChannel
  let reason: string | undefined
  // false when the shared rule says this customer can't be texted (landline,
  // opted out, no SMS number) — then no text is attempted at all.
  let smsAllowed = true
  // An explicit channel was asked for, but they didn't opt in to texts.
  let noOptIn = false

  const onLiveChat = await isCustomerOnLiveChat(conversationId, db)

  // They're watching the widget and this isn't a forced copy — the thread
  // message they can already see is enough.
  if (onLiveChat && !force) {
    return { onLiveChat: true, channel: 'live_chat', sent: true }
  }

  if (preferChannel === 'auto' || (channelSetting && channelSetting !== 'auto')) {
    try {
      const { resolveChannel } = await import('@/lib/channel-choice-server')
      const pick = await resolveChannel(db || admin(), { companyId, conversationId, phone, email, setting: channelSetting || null, newCustomerDefault: newCustomerDefault || null }, { reachOnly: true })
      reason = pick.reason
      smsAllowed = pick.canSms
      preferChannel = pick.channel === 'email' ? 'email' : 'sms'
    } catch { preferChannel = phone ? 'sms' : 'email' }
  } else if (phone) {
    // An explicit channel ('sms', 'email' with SMS as the backup, or the SMS
    // default) still needs the SMS opt-in where the business records one: a
    // website chat visitor who didn't tick "Continue this conversation by
    // text" isn't texted (lib/channel-choice-server readSmsOptIn).
    try {
      const { readSmsOptIn } = await import('@/lib/channel-choice-server')
      if ((await readSmsOptIn(db || admin(), { companyId, conversationId, phone })) === false) {
        smsAllowed = false
        noOptIn = true
        reason = 'They didn’t opt in to texts on your website chat, so it wasn’t texted.'
        if (email) { preferChannel = 'email'; reason = 'They didn’t opt in to texts on your website chat, so it went by email.' }
      }
    } catch { /* opt-in unknown: the STOP check in the SMS route still applies */ }
  }

  // Sending hours: no automated text at night.
  let outsideHours = false
  if (sendingHours && phone && smsAllowed) {
    try {
      const { isWithinSendingHours } = await import('@/lib/campaign-sender')
      const { businessTimezone } = await import('@/lib/agent/ops-actions')
      const tz = await businessTimezone(db || admin(), companyId)
      outsideHours = !isWithinSendingHours(new Date(), tz)
      if (outsideHours) {
        if (email) { preferChannel = 'email'; reason = 'Outside sending hours (9am–8pm), so it went by email.' }
        else {
          const at = nextSendingTime(new Date(), tz, isWithinSendingHours)
          const { error } = await (db || admin()).from('scheduled_messages').insert({
            company_id: companyId, conversation_id: conversationId, message: text,
            scheduled_for: at.toISOString(), channel: 'sms_auto', status: 'pending', type: 'message',
          })
          if (!error) return { onLiveChat, channel: 'sms', sent: false, reason: `Outside sending hours: the text is queued for ${at.toISOString()}.`, deferredUntil: at.toISOString() }
          return { onLiveChat, channel: 'none', sent: false, error: 'Outside sending hours (9am–8pm) and the text couldn’t be queued.' }
        }
      }
    } catch { /* hours unknown: carry on */ }
  }

  const sendEmail = async (): Promise<FallbackResult | null> => {
    if (!email) return null
    try {
      // /api/email/reply sends from the company's connected mailbox (Gmail or
      // its domain). There is no /api/email/send — calling it failed silently.
      const res = await fetch(`${origin}/api/email/reply`, {
        method: 'POST', headers: internalHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          conversationId, to: email, agentName: senderName || undefined,
          subject: subject || 'Update on your order',
          content: text, skipChatMessage: true,
          ...(threadMessageId ? { threadMessageId } : {}),
        }),
      })
      if (res.ok) return { onLiveChat, channel: 'email', sent: true, ...(reason ? { reason } : {}) }
    } catch { /* fall through */ }
    return null
  }

  // Email-first when the conversation isn't an SMS thread — reach the customer on
  // the channel we actually know them on.
  if (preferChannel === 'email') {
    const viaEmail = await sendEmail()
    if (viaEmail) return viaEmail
    // fall through to SMS as a backup
  }

  // SMS first: highest chance of being read. When it's refused, the reason
  // (an opt-out, a carrier error) is kept for the caller if email can't stand in.
  let smsError: string | null = null
  let optedOut = false
  if (phone && smsAllowed && !outsideHours) {
    try {
      const res = await fetch(`${origin}/api/telnyx/sms/send`, {
        method: 'POST', headers: internalHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          companyId, conversationId, to: phone, text,
          senderName: senderName || null,
          // The message is already in the thread; without this the SMS route
          // writes it a second time and the customer sees it twice.
          skipChatMessage: true,
        }),
      })
      if (res.ok) return { onLiveChat, channel: 'sms', sent: true, ...(reason ? { reason } : {}) }
      const d = await res.json().catch(() => ({}))
      optedOut = !!d?.optedOut
      smsError = d?.error || `The text didn’t send (${res.status}).`
    } catch (e: any) { smsError = e?.message || 'The text didn’t send.' }
  }

  const viaEmail = await sendEmail()
  if (viaEmail) return viaEmail

  return {
    onLiveChat,
    channel: 'none',
    sent: false,
    error: smsError
      || (noOptIn ? `They didn’t opt in to texts on your website chat, so it wasn’t texted, and ${email ? 'the email didn’t send either' : 'there’s no email on file'}.` : null)
      || 'No reachable channel — the contact has no mobile or email on file',
    ...(noOptIn && reason ? { reason } : {}),
    ...(optedOut ? { optedOut: true } : {}),
  }
}

/** The next moment inside sending hours (checked in 10-minute steps, up to a day ahead). */
export function nextSendingTime(from: Date, tz: string, within: (d: Date, tz: string) => boolean): Date {
  const t = new Date(Math.ceil(from.getTime() / 600_000) * 600_000)
  for (let i = 0; i < 24 * 6 + 1; i++) {
    if (within(t, tz)) return t
    t.setTime(t.getTime() + 600_000)
  }
  return new Date(from.getTime() + 12 * 3600_000)
}
