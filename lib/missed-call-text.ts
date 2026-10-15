// Missed-call text back.
//
// When nobody answers a call (it rang out, went to voicemail, or the caller hung
// up while it rang) Colvy can text the caller once from the business's number:
// "Sorry we missed your call! This is Roxy Aquarium. Reply here and we'll get
// back to you shortly." A shop that's too busy to pick up keeps the customer,
// and their reply lands in the same conversation as the call.
//
// Off unless switched on (Settings → Calls & SMS). Stored in
// companies.inbox_settings.missed_call_text. Never sent:
//   • when someone actually answered the call;
//   • to a hidden number, a short code, a landline or an overseas number;
//   • to the business's own numbers or its team;
//   • to a customer who opted out (replied STOP) or is blocked, or a
//     conversation marked as spam;
//   • while the business is open, if it only wants it when closed;
//   • more than once per caller every 12 hours (missed_call_texts, V362).
// The text is stored in the caller's conversation like any outgoing text,
// marked metadata.auto + metadata.missed_call_text, so reports can count it and
// the "has the team replied yet?" checks ignore it.

import { after } from 'next/server'
import { callOutcome } from '@/lib/dashboard-time'
import { phoneKey, toE164 } from '@/lib/phone'
import { businessNumbers } from '@/lib/business-numbers'
import { resolveSmsSender, isLandlineRejection } from '@/lib/sms-provider'
import { isExternalSendBlocked } from '@/lib/demo-guard'
import { loadBusinessHours, hoursOutlook } from '@/lib/business-hours'
import { log } from '@/lib/log'
import {
  missedCallTextSettings, renderMissedCallText, textableCaller, canTextFrom,
  MISSED_CALL_TEXT_HOURS, type CallerSkip,
} from '@/lib/missed-call-text-settings'

export * from '@/lib/missed-call-text-settings'

export type MissedCallTextResult =
  | 'sent' | 'off' | 'not_found' | 'answered' | CallerSkip | 'own_number' | 'opted_out'
  | 'no_conversation' | 'spam' | 'blocked' | 'open_now' | 'recent' | 'no_sms' | 'failed'

// Statuses that mean nobody took the call, whatever its duration says: a
// Telnyx caller leg answered only to play the voicemail greeting has talk time.
const UNANSWERED = ['missed', 'no_answer', 'no-answer', 'busy', 'failed', 'canceled', 'cancelled']

/** Did a person (or the AI phone agent) pick this call up? */
export function wasAnswered(c: any): boolean {
  if (c?.answered_by_user_id || c?.answered_at) return true
  const s = String(c?.status || '').toLowerCase()
  if (c?.is_voicemail || s.startsWith('voicemail') || s === 'recording_voicemail' || UNANSWERED.includes(s)) return false
  return callOutcome(c) === 'answered'
}

const isMissingTable = (e: any) =>
  /^(42P01|PGRST205)$/.test(String(e?.code || '')) || /does not exist|could not find the table|schema cache/i.test(String(e?.message || ''))

/**
 * Claim the one text this caller may get in 12 hours. Atomic: the insert — or,
 * once the last text is 12 hours old, the conditional update — succeeds for a
 * single webhook only. 'unavailable' means V362 hasn't been run, and the caller
 * relies on the conversation check alone.
 */
export async function claimMissedCallText(db: any, companyId: string, phone: string, callId: string, now: Date = new Date()): Promise<'claimed' | 'recent' | 'unavailable' | 'error'> {
  const sentAt = now.toISOString()
  const cutoff = new Date(now.getTime() - MISSED_CALL_TEXT_HOURS * 3600_000).toISOString()
  try {
    const { error } = await db.from('missed_call_texts').insert({ company_id: companyId, phone, sent_at: sentAt, call_id: callId })
    if (!error) return 'claimed'
    if (isMissingTable(error)) return 'unavailable'
    if (String(error.code) !== '23505') return 'error'   // anything but "already there"
    const { data, error: upErr } = await db.from('missed_call_texts')
      .update({ sent_at: sentAt, call_id: callId })
      .eq('company_id', companyId).eq('phone', phone).lt('sent_at', cutoff)
      .select('phone')
    if (upErr) return 'error'
    return data && data.length ? 'claimed' : 'recent'
  } catch { return 'error' }
}

// The provider refused the line the text went from (not set up for texting,
// not on this account), not the customer: worth one more try from the usual
// number. Never after a carrier opt-out (Twilio 21610 "unsubscribed recipient",
// Telnyx 40300 "block rule"): the usual number would get round their STOP.
const CARRIER_OPT_OUT = /unsubscribed recipient|stop message|block rule|blacklist rule/i
const FROM_REJECTED = /\bfrom\b.{0,12}\b(number|address)\b|not a twilio phone number|(sms|message)[- ]capable|messaging profile/i

const errText = (e: unknown) => String((e as any)?.message || e || '')

/** The carrier says the customer replied STOP to the number it was sent from. */
export function isCarrierOptOut(e: unknown): boolean {
  return CARRIER_OPT_OUT.test(errText(e))
}

/**
 * The provider blamed the From number, so the usual number may get through.
 * Anything else (an opt-out, a landline, a timeout after which the first text
 * may have gone anyway) isn't retried.
 */
export function isFromNumberRejection(e: unknown): boolean {
  const msg = errText(e)
  return !CARRIER_OPT_OUT.test(msg) && !isLandlineRejection(msg) && FROM_REJECTED.test(msg)
}

/** Hand the claim back when the text didn't go out, so the next missed call can try. */
async function releaseClaim(db: any, companyId: string, phone: string, callId: string) {
  try {
    await db.from('missed_call_texts').update({ sent_at: new Date(0).toISOString() })
      .eq('company_id', companyId).eq('phone', phone).eq('call_id', callId)
  } catch {}
}

/**
 * Has anyone with this number opted out, been blocked, or been found to be a
 * landline? Rows are read whole so a column an older database lacks can't hide
 * an opt-out; if they can't be read at all the answer is 'unknown' (don't send).
 */
async function contactState(db: any, companyId: string, key: string, contactId: string | null): Promise<'ok' | 'opted_out' | 'not_mobile' | 'unknown'> {
  const found: any[] = []
  try {
    if (contactId) {
      const { data, error } = await db.from('contacts').select('*').eq('id', contactId).eq('company_id', companyId).maybeSingle()
      if (error) return 'unknown'
      if (data) found.push(data)
    }
    const { data, error } = await db.from('contacts').select('*').eq('company_id', companyId).ilike('phone', `%${key}%`).limit(20)
    if (error) return 'unknown'
    found.push(...(data || []).filter((c: any) => phoneKey(c.phone) === key))
    // phone_norm also finds numbers saved with spaces ("0412 345 678"). The
    // column comes from V359, so it may not be there yet.
    try {
      const r = await db.from('contacts').select('*').eq('company_id', companyId).eq('phone_norm', key).limit(20)
      if (!r.error) found.push(...(r.data || []))
    } catch {}
  } catch { return 'unknown' }
  if (found.some(c => c.is_blocked || c.unsubscribed_at)) return 'opted_out'
  if (found.some(c => /landline|fixed/i.test(String(c.line_type || '')))) return 'not_mobile'
  return 'ok'
}

/** Record an opt-out the carrier reported, the way a STOP reply is recorded. */
async function recordCarrierOptOut(db: any, companyId: string, contactId: string, now: Date) {
  try {
    const { data } = await db.from('contacts').update({
      subscribed_to_marketing: false, consent_basis: 'none', consent_source: 'replied STOP (reported by the carrier)',
      unsubscribed_at: now.toISOString(), unsubscribe_method: 'sms_keyword',
    }).eq('id', contactId).eq('company_id', companyId).is('unsubscribed_at', null).select('id')
    if (data?.length) {
      await db.from('consent_events').insert({
        company_id: companyId, contact_id: contactId, action: 'unsubscribed', basis: 'none',
        source: 'Carrier opt-out (missed-call text)', actor: 'customer',
      })
    }
  } catch {}
}

/** Is any of the business's stores open right now? Unknown hours count as closed. */
async function openNow(db: any, companyId: string, at: Date): Promise<boolean> {
  try {
    const hours = await loadBusinessHours(db, companyId)
    return hoursOutlook(hours, { at, days: 1 }).places.some(p => p.openNow === true)
  } catch { return false }
}

/**
 * Text the caller of a missed call, if the business wants it and every rule
 * above allows. Returns what happened, for logs and tests. Never throws.
 */
export async function sendMissedCallText(p: { db: any; companyId: string; callId: string; now?: Date }): Promise<MissedCallTextResult> {
  const { db, companyId, callId } = p
  const now = p.now || new Date()
  try {
    if (!companyId || !callId) return 'not_found'
    const { data: co } = await db.from('companies').select('name, inbox_settings').eq('id', companyId).maybeSingle()
    const settings = missedCallTextSettings(co?.inbox_settings)
    if (!settings.enabled) return 'off'

    // The row as it stands now, after the webhook that queued this finished.
    const { data: call } = await db.from('calls').select('*').eq('id', callId).eq('company_id', companyId).maybeSingle()
    if (!call || String(call.direction || '').toLowerCase() !== 'inbound') return 'not_found'
    if (wasAnswered(call)) return 'answered'

    const caller = textableCaller(call.from_number, call.to_number)
    if ('reason' in caller) return caller.reason
    const to = caller.e164, key = phoneKey(to)

    const own = await businessNumbers(db, companyId)
    if (own.all.has(key)) return 'own_number'

    const state = await contactState(db, companyId, key, call.contact_id || null)
    if (state === 'unknown') return 'failed'
    if (state !== 'ok') return state

    // The call's conversation (both providers create one for every caller).
    if (!call.conversation_id) return 'no_conversation'
    const { data: conv } = await db.from('conversations').select('*').eq('id', call.conversation_id).eq('company_id', companyId).maybeSingle()
    if (!conv) return 'no_conversation'
    if (conv.is_spam === true) return 'spam'

    if (await isExternalSendBlocked(companyId, db)) return 'blocked'
    if (settings.when === 'after_hours' && await openNow(db, companyId, now)) return 'open_now'

    // Already texted in this conversation lately. Cheap, and the only guard
    // until V362 adds the claim table below.
    const cutoff = new Date(now.getTime() - MISSED_CALL_TEXT_HOURS * 3600_000).toISOString()
    const { data: recent } = await db.from('messages').select('metadata')
      .eq('conversation_id', conv.id).eq('sender_type', 'agent').gte('created_at', cutoff).limit(200)
    if ((recent || []).some((m: any) => m?.metadata?.missed_call_text)) return 'recent'

    const claim = await claimMissedCallText(db, companyId, to, callId, now)
    if (claim === 'recent') return 'recent'
    if (claim === 'error') return 'failed'
    const claimed = claim === 'claimed'

    const sender = await resolveSmsSender(db, companyId)
    if (!sender) { if (claimed) await releaseClaim(db, companyId, to, callId); return 'no_sms' }

    const text = renderMissedCallText(settings.message, co?.name || '')
    // From the line they rang, when it's one of the business's numbers that can
    // text (an Australian landline can't); otherwise the usual texting number.
    const called = toE164(call.to_number || '')
    const from = called && own.lines.has(phoneKey(called)) && phoneKey(called) !== phoneKey(sender.from) && canTextFrom(called) ? called : undefined
    const statusCallback = sender.provider === 'twilio'
      ? `${(process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com').replace(/\/$/, '')}/api/twilio/webhook`
      : undefined

    let sent: { id: string | null } | null = null
    let err: any = null
    try {
      sent = await sender.send({ to, text, from, statusCallback })
    } catch (e) {
      err = e
      // That line isn't set up for texting — try the usual number once.
      if (from && isFromNumberRejection(e)) {
        try { sent = await sender.send({ to, text, statusCallback }); err = null } catch (e2) { err = e2 }
      }
    }
    if (!sent) {
      if (claimed) await releaseClaim(db, companyId, to, callId)
      // The carrier says it's a landline: remember, so it isn't tried again.
      if (isLandlineRejection(err) && call.contact_id) {
        try { await db.from('contacts').update({ line_type: 'landline', line_type_checked_at: now.toISOString() }).eq('id', call.contact_id).eq('company_id', companyId) } catch {}
      }
      // The carrier says they replied STOP: record it as Colvy would a STOP it
      // received itself (lib/inbound-sms), so none of the business's numbers
      // texts them again.
      else if (isCarrierOptOut(err) && call.contact_id) await recordCarrierOptOut(db, companyId, call.contact_id, now)
      log.warn('[missed call text] not sent', err?.message || err)
      return 'failed'
    }

    const nowIso = new Date().toISOString()
    try {
      await db.from('messages').insert({
        conversation_id: conv.id, company_id: companyId,
        sender_type: 'agent', sender_name: co?.name || 'Auto-reply',
        content: text, message_type: 'text', delivery_channel: 'sms', is_read: true,
        telnyx_message_id: sent.id,
        metadata: { auto: true, missed_call_text: true, call_id: callId },
      })
      // The customer's reply matches back to this thread by number. A call-only
      // thread now continues by text; an email, web chat or Facebook thread the
      // call happened to land in keeps its channel and its SMS setting (a chat
      // visitor who didn't tick "continue by text" keeps their choice).
      const callOnly = ['', 'phone', 'call', 'voice', 'sms'].includes(String(conv.channel || '').toLowerCase())
      await db.from('conversations').update({
        last_message: text.slice(0, 200), last_message_at: nowIso, updated_at: nowIso,
        ...(callOnly ? { channel: 'sms', sms_enabled: true } : {}), sms_number: conv.sms_number || to,
        ...(conv.channel_number ? {} : { channel_number: from || sender.from || null }),
      }).eq('id', conv.id)
    } catch (e: any) { log.warn('[missed call text] sent, but not saved to the conversation', e?.message || e) }
    return 'sent'
  } catch (e: any) {
    log.error('[missed call text]', e?.message || e)
    return 'failed'
  }
}

/** Same, after the webhook has answered (the provider isn't kept waiting). */
export function queueMissedCallText(p: { db: any; companyId: string | null | undefined; callId: string | null | undefined }) {
  const { db, companyId, callId } = p
  if (!companyId || !callId) return
  const work = async () => {
    const r = await sendMissedCallText({ db, companyId, callId })
    log.info('[missed call text]', callId, r)
  }
  try { after(work) } catch { void work() }
}
