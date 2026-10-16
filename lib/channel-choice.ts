// Which channel to reach a customer on: one rule for automated messages
// (order updates, abandoned carts, follow-ups), the inbox composer's default,
// and the Contacts "Message" button. Pure: the facts are gathered elsewhere
// (lib/channel-choice-server.ts on the server, the inbox from its thread).
//
// The rule, in order:
//   1. The channel the customer last used to contact us.
//   2. Automated ORDER messages to a customer who has never messaged us: email
//      when we have it (what customers expect for receipts; see #122).
//   3. Otherwise SMS, when they have a mobile, haven't opted out of texts, and
//      the business has an SMS number.
//   4. Otherwise email, when we have their email address.
// A per-automation setting ('sms' / 'email') goes first when it can be used.
// Automated texts also keep to sending hours (lib/channel-fallback).

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
  /**
   * For a customer who has never messaged the business: which channel an
   * automated message tries first. Order and website-order messages use
   * 'email' (customers expect receipts and order updates by email); others 'sms'.
   */
  newCustomerDefault?: 'sms' | 'email' | null
}

export type ChannelChoice = {
  channel: string            // 'sms' | 'email' | 'chat' | other messaging channel | 'none'
  reason: string             // plain English, shown as a hint
  canSms: boolean
  canEmail: boolean
}

import { toE164 } from '@/lib/phone'

const MESSAGING = ['sms', 'email', 'whatsapp', 'instagram', 'facebook', 'messenger']
const WIDGET = ['chat', 'widget', 'live_chat']

/**
 * Can this number take a text? Read as E.164 (lib/phone, national numbers in
 * the business's country, Australia by default) with per-country mobile
 * ranges: AU mobiles are +61 4…, NZ +64 2…, UK +44 7…. AU landlines and
 * 13 / 1300 / 1800 numbers can't. Other countries' numbers are given the
 * benefit of the doubt when they're a plausible length.
 */
export function isMobileNumber(phone: string | null | undefined, country: 'AU' = 'AU'): boolean {
  const raw = String(phone || '').trim()
  const d = raw.replace(/\D/g, '')
  if (d.length < 8 || d.length > 15) return false
  // Australian service numbers written nationally (13 xx xx, 1300…, 1800…).
  if (country === 'AU' && !raw.startsWith('+') && /^1[38]/.test(d) && d.length <= 10) return false
  const e = toE164(raw, country).replace(/^\+/, '')
  if (e.startsWith('61')) return /^614\d{8}$/.test(e)
  if (e.startsWith('64')) return /^642\d{7,9}$/.test(e)
  if (e.startsWith('44')) return /^447\d{9}$/.test(e)
  return e.length >= 10 && e.length <= 15
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

  // 2. A customer who hasn't messaged yet: an order update goes by email when we have it.
  if (opts.reachOnly && f.newCustomerDefault === 'email' && canEmail && !last) return out('email', 'They haven’t messaged you yet, so order messages go by email.')
  // 3. SMS when we may text them.
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
export function contactMessageHref(c: { id: string; phone?: string | null; email?: string | null; unsubscribed_at?: string | null; is_blocked?: boolean | null }, want?: 'sms' | 'email' | null, conversationId?: string | null): string {
  const mayText = isMobileNumber(c.phone) && !c.unsubscribed_at && !c.is_blocked
  const ch = want === 'email' && c.email ? 'email'
    : want === 'sms' && mayText ? 'sms'
    : mayText ? 'sms'
    : c.email ? 'email'
    : 'auto'
  // A specific conversation (the profile's) opens itself, on that channel.
  if (conversationId) return `/admin/inbox?conversation=${encodeURIComponent(conversationId)}&channel=${ch}`
  return `/admin/inbox?contact=${encodeURIComponent(c.id)}&channel=${ch}`
}
