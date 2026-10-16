// Which channel to reach a customer on: one rule for automated messages
// (order updates, abandoned carts, follow-ups), the inbox composer's default,
// and the Contacts "Message" button. Pure: the facts are gathered elsewhere
// (lib/channel-choice-server.ts on the server, the inbox from its thread).
//
// The rule, in order:
//   1. The channel the customer last used to contact us.
//   2. Otherwise SMS, when they have a mobile, haven't opted out of texts, and
//      the business has an SMS number.
//   3. Otherwise email, when we have their email address.
// A per-automation setting ('sms' / 'email') goes first when it can be used.

export type ChannelSetting = 'auto' | 'sms' | 'email'

export type ChannelFacts = {
  /** Channel of the customer's latest message to us ('sms', 'email', 'chat', 'whatsapp'…), if any. */
  lastCustomerChannel?: string | null
  /** conversations.channel of the thread, if there is one. */
  threadChannel?: string | null
  /** Their phone number (any format). */
  phone?: string | null
  /** 'ok' may text; 'opted_out' / 'unknown' may not (lib/sms-consent). */
  smsConsent?: 'ok' | 'opted_out' | 'unknown' | null
  businessHasSms?: boolean
  email?: string | null
  /** An automation's own channel setting. */
  setting?: ChannelSetting | null
}

export type ChannelChoice = {
  channel: string            // 'sms' | 'email' | 'chat' | other messaging channel | 'none'
  reason: string             // plain English, shown as a hint
  canSms: boolean
  canEmail: boolean
}

const MESSAGING = ['sms', 'email', 'whatsapp', 'instagram', 'facebook', 'messenger']
const WIDGET = ['chat', 'widget', 'live_chat']

/**
 * Can this number take a text? Australian landlines (02/03/07/08, 13/1300/1800)
 * can't; AU mobiles are 04… / +614…. Numbers from elsewhere are given the
 * benefit of the doubt.
 */
export function isMobileNumber(phone: string | null | undefined): boolean {
  const d = String(phone || '').replace(/\D/g, '')
  if (d.length < 8) return false
  if (d.startsWith('614')) return d.length === 11
  if (d.startsWith('04')) return d.length === 10
  if (d.startsWith('61') || d.startsWith('0') || d.startsWith('1300') || d.startsWith('1800') || d.startsWith('13')) return false
  return true
}

export function normaliseChannel(ch: string | null | undefined): string {
  const c = String(ch || '').toLowerCase().trim()
  if (c === 'call' || c === 'phone' || c === 'voice') return 'phone'
  if (WIDGET.includes(c)) return 'chat'
  return c
}

/**
 * The rule. `reachOnly` (automated sends) only ever answers 'sms', 'email' or
 * 'none'; the inbox may also answer live chat or another messaging channel the
 * customer is using.
 */
export function chooseChannel(f: ChannelFacts, opts: { reachOnly?: boolean } = {}): ChannelChoice {
  const canSms = isMobileNumber(f.phone) && f.smsConsent === 'ok' && !!f.businessHasSms
  const canEmail = !!String(f.email || '').includes('@')
  const out = (channel: string, reason: string): ChannelChoice => ({ channel, reason, canSms, canEmail })
  const smsWhyNot = !f.phone ? 'no mobile on file'
    : !isMobileNumber(f.phone) ? 'their number isn’t a mobile'
    : f.smsConsent === 'opted_out' ? 'they opted out of texts'
    : f.smsConsent !== 'ok' ? 'their text consent couldn’t be checked'
    : !f.businessHasSms ? 'texting isn’t set up for your business' : ''

  // 0. The automation's own setting, when it can be used.
  if (f.setting === 'sms' && canSms) return out('sms', 'This automation is set to send by SMS.')
  if (f.setting === 'email' && canEmail) return out('email', 'This automation is set to send by email.')

  // 1. The channel the customer last used.
  const last = normaliseChannel(f.lastCustomerChannel)
  if (last === 'sms' && canSms) return out('sms', 'They last messaged you by SMS.')
  if (last === 'email' && canEmail) return out('email', 'They last emailed you.')
  if (!opts.reachOnly) {
    if (last && MESSAGING.includes(last) && last !== 'sms' && last !== 'email') return out(last, `They last messaged you on ${last === 'facebook' ? 'Messenger' : last.charAt(0).toUpperCase() + last.slice(1)}.`)
    if (last === 'chat') return out('chat', 'They last messaged you on live chat.')
    // A thread that is itself an SMS / email / social conversation stays on it.
    const thread = normaliseChannel(f.threadChannel)
    if (!last && MESSAGING.includes(thread)) {
      if (thread === 'sms' && !canSms && canEmail && f.smsConsent === 'opted_out') return out('email', 'They opted out of texts, so this goes by email.')
      return out(thread, 'This is an existing ' + (thread === 'sms' ? 'SMS' : thread) + ' conversation.')
    }
  }

  // 2. SMS when we may text them.
  if (canSms) return out('sms', 'They have a mobile and haven’t opted out of texts.')
  // 3. Email.
  if (canEmail) return out('email', smsWhyNot ? `Email, because ${smsWhyNot}.` : 'Sent by email.')
  if (!opts.reachOnly) return out('chat', 'No mobile or email on file.')
  return out('none', 'No way to reach them: ' + (smsWhyNot || 'no mobile or email on file') + '.')
}

/**
 * Where the Contacts / customer profile "Message" button goes. With a mobile
 * they may be texted on, it opens their conversation ready to send an SMS;
 * otherwise by email; the inbox then follows the same rule for anything else.
 */
export function contactMessageHref(c: { id: string; phone?: string | null; email?: string | null; unsubscribed_at?: string | null; is_blocked?: boolean | null }, want?: 'sms' | 'email' | null): string {
  const mayText = isMobileNumber(c.phone) && !c.unsubscribed_at && !c.is_blocked
  const ch = want === 'email' && c.email ? 'email'
    : want === 'sms' && mayText ? 'sms'
    : mayText ? 'sms'
    : c.email ? 'email'
    : 'auto'
  return `/admin/inbox?contact=${encodeURIComponent(c.id)}&channel=${ch}`
}
