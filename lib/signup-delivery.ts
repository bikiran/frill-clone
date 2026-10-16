// Sign-up mobile verification: the parts both the browser and the server use.
// Pure functions only (no server imports), so app/signup and the super admin
// Signups page can share them with the API routes.
//
//   • normaliseSignupMobile: what someone types → E.164, or a plain reason why not;
//   • SMS_ERRORS / explainDeliveryError: Twilio error codes in plain English;
//   • deliveryOf: from a sign-up attempt's timeline, what happened to the
//     latest code sent to their mobile (text or call).

// (Plain object rather than a union: the project doesn't run strict null checks, so unions don't narrow.)
export type MobileCheck = { ok: boolean; e164: string; error: string }

/**
 * Australian-first mobile normalisation for the sign-up code.
 *   "0466 077 557", "466077557", "61466077557", "+61 466 077 557",
 *   "+61 0466 077 557", "0061 466 077 557"  →  "+61466077557"
 * Other countries need the + and country code. Australian landlines and
 * 13/1300/1800 numbers can't receive texts, so they're refused with a reason.
 */
export function normaliseSignupMobile(raw: string | null | undefined): MobileCheck {
  let t = String(raw || '').trim().replace(/[\s().\- ]/g, '')
  if (!t) return { ok: false, e164: '', error: 'Enter your mobile number.' }
  if (t.startsWith('00')) t = '+' + t.slice(2)
  if (/[^+\d]/.test(t) || t.lastIndexOf('+') > 0) return { ok: false, e164: '', error: 'A mobile number should only have digits (and a + at the start).' }
  let d = t.replace(/\D/g, '')
  let intl = t.startsWith('+')
  if (!intl) {
    if (/^(1[38]00\d{6}|13\d{4})$/.test(d)) return { ok: false, e164: '', error: '13, 1300 and 1800 numbers can’t receive texts. Enter your mobile.' }
    if (/^05\d{8}$/.test(d)) return { ok: false, e164: '', error: 'Numbers starting 05 can’t receive texts. Enter your mobile (04xx xxx xxx).' }
    if (/^02\d{7,9}$/.test(d) && !/^0[2378]\d{8}$/.test(d)) return { ok: false, e164: '', error: 'If this is a New Zealand mobile, enter it with +64 (for example +64 21 123 4567).' }
    if (/^02\d{8}$/.test(d)) return { ok: false, e164: '', error: 'That looks like a Sydney landline (02). Enter your mobile (04xx xxx xxx), or for a New Zealand mobile start with +64.' }
    if (/^0\d{9}$/.test(d)) { d = '61' + d.slice(1); intl = true }            // 0466 077 557
    else if (/^4\d{8}$/.test(d)) { d = '61' + d; intl = true }                // 466 077 557
    else if (/^61[45]\d{8}$/.test(d) || /^610[45]\d{8}$/.test(d)) intl = true  // 61466077557
    else return { ok: false, e164: '', error: 'Enter an Australian mobile (04xx xxx xxx), or start with + and the country code.' }
  }
  // A trunk 0 kept after the country code ("+61 0466…", "+64 021…", "+44 07…") never connects.
  if (/^(61|64|44)0/.test(d)) d = d.slice(0, 2) + d.slice(3)
  if (d.length < 8 || d.length > 15) return { ok: false, e164: '', error: 'That number looks too short or too long. Check it and try again.' }
  if (d.startsWith('61')) {
    const n = d.slice(2)
    if (/^1[38]/.test(n)) return { ok: false, e164: '', error: '13, 1300 and 1800 numbers can’t receive texts. Enter your mobile.' }
    if (/^[2378]\d{8}$/.test(n)) return { ok: false, e164: '', error: 'That looks like a landline. Enter a mobile number (04xx xxx xxx) so we can text you.' }
    if (/^5\d{8}$/.test(n)) return { ok: false, e164: '', error: 'Numbers starting 05 can’t receive texts. Enter your mobile (04xx xxx xxx).' }
    if (!/^4\d{8}$/.test(n)) return { ok: false, e164: '', error: 'An Australian mobile has 10 digits and starts with 04. Check the number.' }
  }
  return { ok: true, e164: '+' + d, error: '' }
}

// ── Where codes may go ──────────────────────────────────────────────────────
// Each text or call costs money, and some destinations cost a lot (premium,
// satellite and "international network" ranges are the classic toll-fraud
// targets). Codes only go to mobile ranges of the countries the server allows
// (SIGNUP_SMS_COUNTRIES, default AU,NZ; calls SIGNUP_VOICE_COUNTRIES, default AU).

const COUNTRY: Record<string, { code: string; name: string; mobile: RegExp }> = {
  AU: { code: '61', name: 'Australian', mobile: /^614\d{8}$/ },
  NZ: { code: '64', name: 'New Zealand', mobile: /^642\d{7,9}$/ },
  GB: { code: '44', name: 'UK', mobile: /^447[1-57-9]\d{8}$/ },          // not 070 (personal numbers)
  IE: { code: '353', name: 'Irish', mobile: /^3538[35-9]\d{7}$/ },
  US: { code: '1', name: 'US', mobile: /^1[2-9]\d{2}[2-9]\d{6}$/ },
  CA: { code: '1', name: 'Canadian', mobile: /^1[2-9]\d{2}[2-9]\d{6}$/ },
  SG: { code: '65', name: 'Singapore', mobile: /^65[89]\d{7}$/ },
  IN: { code: '91', name: 'Indian', mobile: /^91[6-9]\d{9}$/ },
  NP: { code: '977', name: 'Nepali', mobile: /^9779[78]\d{8}$/ },
}
// +1 numbers that aren't the US or Canada (Caribbean and Pacific islands bill
// like international calls), plus premium 900/976.
const NANP_NOT_US_CA = /^1(242|246|264|268|284|340|345|441|473|649|658|664|670|671|684|721|758|767|784|787|809|829|849|868|869|876|900|939|976)/

/** "AU,NZ" → ['AU', 'NZ'] (unknown codes dropped). */
export function countryList(raw: string | null | undefined, fallback: string): string[] {
  const list = String(raw ?? '').trim() ? String(raw) : fallback
  return Array.from(new Set(list.toUpperCase().split(/[\s,;]+/).filter(c => c in COUNTRY)))
}

const names = (list: string[]) => {
  const n = list.map(c => COUNTRY[c].name)
  return n.length <= 1 ? (n[0] || 'no') : `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}`
}

/** May a sign-up code be texted (or read out, for 'voice') to this E.164 number? */
export function destinationAllowed(e164: string, allowed: string[], channel: 'sms' | 'voice' = 'sms'): { ok: boolean; country: string | null; error: string } {
  const d = String(e164 || '').replace(/\D/g, '')
  const hit = allowed.find(c => COUNTRY[c] && COUNTRY[c].mobile.test(d) && !(COUNTRY[c].code === '1' && NANP_NOT_US_CA.test(d)))
  if (hit) return { ok: true, country: hit, error: '' }
  const error = channel === 'voice'
    ? `We can only call ${names(allowed)} mobiles with the code. Use the text instead, or email support@colvy.com.`
    : `Mobile verification is available for ${names(allowed)} numbers. Please contact us at support@colvy.com to sign up with another number.`
  return { ok: false, country: null, error }
}

// ── Twilio error codes, in plain English ────────────────────────────────────

export type ErrorInfo = { short: string; explain: string; who: 'person' | 'colvy' | 'carrier' }

/** The codes sign-up texts and calls actually hit. Anything else falls back to Twilio's own text. */
export const SMS_ERRORS: Record<string, ErrorInfo> = {
  // Delivery (arrive by status callback)
  '30003': { short: 'phone unreachable', who: 'person', explain: 'The phone was switched off, out of coverage or not accepting texts. A call may still get through, or they can try again later.' },
  '30004': { short: 'blocked by the recipient', who: 'person', explain: 'The phone or its plan refused the text (a blocked sender, or a plan that doesn’t take texts from short codes or international senders).' },
  '30005': { short: 'number doesn’t exist', who: 'person', explain: 'The phone company says this number isn’t in service. It was probably mistyped.' },
  '30006': { short: 'landline or can’t take texts', who: 'person', explain: 'The number is a landline or a service that can’t receive texts. Ask for a mobile.' },
  '30007': { short: 'carrier blocked', who: 'carrier', explain: 'The phone company filtered the text as spam. In Australia this usually means the sender isn’t trusted: an unregistered alphanumeric sender ID, or an overseas number texting an Australian mobile. Check the Messaging Service’s senders for Australia in Twilio.' },
  '30008': { short: 'unknown carrier error', who: 'carrier', explain: 'The phone company didn’t say why it wasn’t delivered. Often the same filtering as 30007. If it repeats for Australian numbers, check the Messaging Service’s Australian sender.' },
  '30032': { short: 'toll-free sender not verified', who: 'colvy', explain: 'The Messaging Service sent from a US toll-free number that isn’t verified. Use an Australian sender for Australian mobiles.' },
  '30034': { short: 'US sender not registered (A2P 10DLC)', who: 'colvy', explain: 'The Messaging Service picked a US long code that isn’t registered for A2P 10DLC. Add an Australian sender to the Messaging Service for Australian mobiles.' },
  '30044': { short: 'trial account', who: 'colvy', explain: 'Twilio trial accounts can only text numbers verified on the account. Upgrade the Twilio account.' },
  '30410': { short: 'provider timed out', who: 'carrier', explain: 'The phone company didn’t answer in time. Usually temporary: a resend or a call should work.' },
  // Refused when sending (the API call itself fails)
  '21211': { short: 'invalid number', who: 'person', explain: 'Twilio says this isn’t a valid phone number. It was probably mistyped.' },
  '21408': { short: 'country not enabled', who: 'colvy', explain: 'Texting this country isn’t switched on for the Twilio account. Turn it on in Twilio → Messaging → Settings → Geo permissions.' },
  '21606': { short: 'sender can’t text this number', who: 'colvy', explain: 'The sending number can’t text this destination. Add an Australian sender to the Messaging Service.' },
  '21608': { short: 'trial account', who: 'colvy', explain: 'Twilio trial accounts can only text numbers verified on the account. Upgrade the Twilio account.' },
  '21610': { short: 'replied STOP earlier', who: 'person', explain: 'This number replied STOP to Colvy’s sender before, so Twilio won’t text it. They can text START to the sender, or get a call instead.' },
  '21612': { short: 'no route from this sender', who: 'colvy', explain: 'Twilio can’t reach this number from the sender the Messaging Service picked (for example a US number to an Australian mobile, or an alphanumeric sender not allowed for this country). Add an Australian number or a registered sender ID to the Messaging Service.' },
  '21614': { short: 'not a mobile', who: 'person', explain: 'The number isn’t a mobile, so it can’t receive texts.' },
  '21703': { short: 'Messaging Service has no sender', who: 'colvy', explain: 'The Messaging Service has no sender that can be used. Add an Australian number or a registered alphanumeric sender ID to its sender pool.' },
  '21704': { short: 'Messaging Service has no sender', who: 'colvy', explain: 'The Messaging Service’s sender pool is empty. Add an Australian number or a registered alphanumeric sender ID.' },
  '20003': { short: 'Twilio login failed', who: 'colvy', explain: 'Twilio rejected the account credentials. Check TWILIO_MASTER_ACCOUNT_SID and TWILIO_MASTER_AUTH_TOKEN.' },
  // Calls
  '13224': { short: 'invalid number', who: 'person', explain: 'Twilio couldn’t call this number. It was probably mistyped.' },
  '13227': { short: 'calling this country not enabled', who: 'colvy', explain: 'Calling this country isn’t switched on. Turn it on in Twilio → Voice → Settings → Geo permissions.' },
  '21210': { short: 'caller number not on the account', who: 'colvy', explain: 'TWILIO_MASTER_VOICE_FROM isn’t a number on Colvy’s Twilio account. Use a voice-capable number the account owns.' },
  '21215': { short: 'calling this country not enabled', who: 'colvy', explain: 'Calling this country isn’t switched on. Turn it on in Twilio → Voice → Settings → Geo permissions.' },
  '21219': { short: 'trial account', who: 'colvy', explain: 'Twilio trial accounts can only call verified numbers. Upgrade the Twilio account.' },
  // Our own reasons (no Twilio code)
  not_configured: { short: 'no sender configured', who: 'colvy', explain: 'No Twilio sender is set up for sign-up codes, so no text was sent. Set TWILIO_MASTER_FROM_NUMBER (an SMS-capable number on Colvy’s Twilio account, e.g. +61485059215) or TWILIO_MASTER_MESSAGING_SERVICE_SID, along with TWILIO_MASTER_ACCOUNT_SID and TWILIO_MASTER_AUTH_TOKEN.' },
}

/** "carrier blocked (30007)" and the longer explanation, for a code or Twilio's message. */
export function explainDeliveryError(code?: string | number | null, message?: string | null): ErrorInfo & { code: string | null; label: string } {
  const c = code == null || code === '' ? null : String(code)
  const known = c ? SMS_ERRORS[c] : undefined
  const info: ErrorInfo = known || { short: 'not delivered', who: 'carrier', explain: message ? `Twilio said: ${String(message).slice(0, 200)}` : 'Twilio didn’t give a reason.' }
  const label = c && /^\d+$/.test(c) ? `${info.short} (${c})` : info.short
  return { ...info, code: c, label }
}

// ── What happened to the latest mobile code ─────────────────────────────────

export type DeliveryState = 'none' | 'sending' | 'delivered' | 'answered' | 'not_delivered' | 'send_failed' | 'no_report'

export type MobileDelivery = {
  state: DeliveryState
  channel: 'sms' | 'voice' | null
  at: string | null
  code: string | null
  /** One line for the table, e.g. "SMS not delivered — carrier blocked (30007)". */
  label: string
  explain: string
  who: ErrorInfo['who'] | null
  /** Every mobile send, newest first, with its own outcome (for the drawer). */
  sends: { at: string; channel: 'sms' | 'voice'; sid: string | null; state: DeliveryState; code: string | null; label: string; explain: string }[]
}

const SMS_DONE: Record<string, DeliveryState> = { delivered: 'delivered', undelivered: 'not_delivered', failed: 'not_delivered' }
const CALL_DONE: Record<string, DeliveryState> = { completed: 'answered', busy: 'not_delivered', 'no-answer': 'not_delivered', failed: 'not_delivered', canceled: 'not_delivered' }
/** Statuses the status callback records (the rest are in-between steps). */
export const TERMINAL_STATUSES = { sms: Object.keys(SMS_DONE), voice: Object.keys(CALL_DONE) }
/** A text with no delivery report after this long reads "no report". */
export const NO_REPORT_AFTER_MS = 15 * 60_000

const tms = (v: any) => { const t = v ? new Date(v).getTime() : NaN; return Number.isFinite(t) ? t : 0 }
const CALL_WORD: Record<string, string> = { busy: 'line busy', 'no-answer': 'not answered', failed: 'call failed', canceled: 'call cancelled' }

function describe(channel: 'sms' | 'voice', state: DeliveryState, status: string | null, code: string | null, message: string | null): { label: string; explain: string; who: ErrorInfo['who'] | null } {
  const what = channel === 'voice' ? 'Call' : 'SMS'
  if (state === 'delivered') return { label: 'SMS delivered', explain: 'The phone company confirmed the text reached the phone.', who: null }
  if (state === 'answered') return { label: 'Call answered', explain: 'The call connected and the code was read out (it may have gone to voicemail).', who: null }
  if (state === 'sending') return { label: `${what} sent, waiting for a delivery report`, explain: 'Twilio accepted it; the phone company hasn’t reported back yet.', who: null }
  if (state === 'no_report') return { label: `${what} sent, no delivery report`, explain: 'Twilio accepted it but no delivery report came back (sent before delivery tracking, or the status callback didn’t reach Colvy).', who: null }
  if (channel === 'voice' && !code && status && CALL_WORD[status]) return { label: `Call not connected — ${CALL_WORD[status]}`, explain: status === 'no-answer' || status === 'busy' ? 'The phone rang out or was busy. They can try again.' : 'The call didn’t connect.', who: 'person' }
  if (state === 'send_failed' && !code) return { label: `${what} not sent — reason not recorded`, explain: 'Colvy didn’t get it out to Twilio, before reasons were recorded. Usually no sender was configured (TWILIO_MASTER_MESSAGING_SERVICE_SID empty and no From number), or Twilio refused the number.', who: 'colvy' }
  const e = explainDeliveryError(code, message)
  const verb = state === 'send_failed' ? 'not sent' : channel === 'voice' ? 'not connected' : 'not delivered'
  return { label: `${what} ${verb} — ${e.label}`, explain: e.explain, who: e.who }
}

/**
 * From a sign-up attempt's timeline (lib/signup-attempts events): the outcome
 * of each code sent to their mobile, newest first, and the latest one as a
 * one-line summary. Events:
 *   code_sent  { channel: 'both' | 'sms' | 'voice', sms_sid?, call_sid?, sms_error?, sms_error_message? }
 *   send_failed{ channel, sms_error? }
 *   delivery   { channel: 'sms' | 'voice', sid, status, error_code? }
 */
export function deliveryOf(row: any, now = Date.now()): MobileDelivery {
  const events: any[] = Array.isArray(row?.events) ? row.events : []
  const reports = new Map<string, any>()
  for (const e of events) if (e?.type === 'delivery' && e.sid) reports.set(String(e.sid), e)   // later wins
  const sends: MobileDelivery['sends'] = []
  for (const e of events) {
    if (!(e?.type === 'code_sent' || e?.type === 'send_failed')) continue
    const ch = e.channel === 'voice' ? 'voice' : (e.channel === 'sms' || e.channel === 'both') ? 'sms' : null
    if (!ch) continue
    const sid = (ch === 'voice' ? e.call_sid : e.sms_sid) || null
    let state: DeliveryState, status: string | null = null, code: string | null = null, message: string | null = null
    if (e.sms_error || (e.type === 'send_failed' && !sid) || (!sid && /SMS not delivered/i.test(String(e.detail || '')))) {
      state = 'send_failed'; code = e.sms_error ? String(e.sms_error) : null; message = e.sms_error_message || null
    } else if (sid && reports.has(sid)) {
      const r = reports.get(sid)
      status = String(r.status || '')
      state = (ch === 'voice' ? CALL_DONE : SMS_DONE)[status] || 'sending'
      code = r.error_code ? String(r.error_code) : null
    } else {
      state = now - tms(e.at) > NO_REPORT_AFTER_MS ? 'no_report' : 'sending'
    }
    const d = describe(ch, state, status, code, message)
    sends.push({ at: e.at, channel: ch, sid, state, code, label: d.label, explain: d.explain })
  }
  sends.sort((a, b) => tms(b.at) - tms(a.at))
  const last = sends[0]
  if (!last) return { state: 'none', channel: null, at: null, code: null, label: 'No code sent to the mobile', explain: '', who: null, sends }
  const d = describe(last.channel, last.state, null, last.code, null)
  return { state: last.state, channel: last.channel, at: last.at, code: last.code, label: last.label, explain: last.explain, who: d.who, sends }
}

/** Is this outcome a problem the admin should see in the table? */
export const deliveryProblem = (s: DeliveryState) => s === 'not_delivered' || s === 'send_failed'
