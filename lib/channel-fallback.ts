import { createClient } from '@supabase/supabase-js'

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

/**
 * How recently the widget must have checked in for the customer to count as
 * "watching". The widget heartbeats while the page is open; 90 seconds allows
 * for a missed beat without treating a closed tab as present.
 */
const PRESENCE_WINDOW_MS = 90 * 1000

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
    if (!data?.page_seen_at) return false
    const seen = new Date(String(data.page_seen_at).replace(' ', 'T')).getTime()
    if (isNaN(seen)) return false
    return Date.now() - seen < PRESENCE_WINDOW_MS
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
  db?: any
}): Promise<FallbackResult> {
  const { companyId, conversationId, text, phone, email, senderName, subject, origin, force, db } = params

  const onLiveChat = await isCustomerOnLiveChat(conversationId, db)

  // They're watching the widget and this isn't a forced copy — the thread
  // message they can already see is enough.
  if (onLiveChat && !force) {
    return { onLiveChat: true, channel: 'live_chat', sent: true }
  }

  // SMS first: highest chance of being read.
  if (phone) {
    try {
      const res = await fetch(`${origin}/api/telnyx/sms/send`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId, conversationId, to: phone, text,
          senderName: senderName || null,
          // The message is already in the thread; without this the SMS route
          // writes it a second time and the customer sees it twice.
          skipChatMessage: true,
        }),
      })
      if (res.ok) return { onLiveChat, channel: 'sms', sent: true }
    } catch { /* fall through to email */ }
  }

  if (email) {
    try {
      const res = await fetch(`${origin}/api/email/send`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId, conversationId, to: email,
          subject: subject || 'Update on your order',
          text, skipChatMessage: true,
        }),
      })
      if (res.ok) return { onLiveChat, channel: 'email', sent: true }
    } catch { /* nothing left to try */ }
  }

  return {
    onLiveChat,
    channel: 'none',
    sent: false,
    error: 'No reachable channel — the contact has no mobile or email on file',
  }
}
