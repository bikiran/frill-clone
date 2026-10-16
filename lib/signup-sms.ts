// Sign-up mobile codes: sending the text, the "call me with the code" call,
// where Twilio reports back, and how codes are kept. Server only.
//
// Both go out from Colvy's own (master) Twilio account, since no company
// exists yet at sign-up. Texts go through TWILIO_MASTER_MESSAGING_SERVICE_SID
// when it's set, otherwise from the plain number TWILIO_MASTER_FROM_NUMBER;
// with neither, nothing is sent and the page says so at once. Calls come from
// TWILIO_MASTER_VOICE_FROM, else that same number (a Messaging Service can't
// call). An Australian Twilio mobile number texting Australian mobiles needs
// no sender registration; an alphanumeric sender ID would. Each
// carries a status callback (/api/auth/otp/status) so the attempt's timeline
// shows whether it actually arrived, not just that Twilio accepted it.

import crypto from 'crypto'
import { platformTwilio, platformTwilioConfigured, TWILIO_MASTER, colvyBaseUrl } from '@/lib/twilio-platform'
import { xmlEscape } from '@/lib/twilio-service'
import { explainDeliveryError } from '@/lib/signup-delivery'

export const CODE_TTL_MS = 10 * 60 * 1000      // each code is valid for 10 minutes
/** Codes per channel still accepted: the newest and the two before it. */
export const KEEP_CODES = 3

export const sha = (s: string) => crypto.createHash('sha256').update(s).digest('hex')
export const sixDigits = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')

// ── Keeping codes ───────────────────────────────────────────────────────────
// signup_verifications.email_code / sms_code hold the hashed codes still
// accepted, newest first, each with its own expiry: "<sha256>@<expires ms> …".
// A resend (or a call) used to replace the only code, so a text that arrived
// late carried a code that no longer worked: "That code isn't right". Now
// the last few codes keep working until each one's own 10 minutes are up.
// A row written before this (a bare hash) uses the row's expires_at.

/** The stored list with a new code in front (older ones dropped when they've expired, or when `fresh`). */
export function pushCode(prev: string | null | undefined, hash: string, expiresAtMs: number, o: { fresh?: boolean; now?: number } = {}): string {
  const now = o.now ?? Date.now()
  const kept = o.fresh ? [] : parseCodes(prev, null).filter(c => c.expiresAt == null || c.expiresAt > now)
  return [`${hash}@${expiresAtMs}`, ...kept.map(c => c.expiresAt == null ? c.hash : `${c.hash}@${c.expiresAt}`)].slice(0, KEEP_CODES).join(' ')
}

export function parseCodes(stored: string | null | undefined, rowExpiresAt: string | null): { hash: string; expiresAt: number | null }[] {
  const fallback = rowExpiresAt ? new Date(rowExpiresAt).getTime() : null
  return String(stored || '').split(/[\s,]+/).filter(Boolean).map(part => {
    const [hash, exp] = part.split('@')
    const n = Number(exp)
    return { hash, expiresAt: exp && Number.isFinite(n) ? n : (Number.isFinite(fallback as number) ? fallback : null) }
  }).filter(c => /^[0-9a-f]{64}$/.test(c.hash))
}

/** Is this code one of the stored ones, and still in date? */
export function checkCode(stored: string | null | undefined, code: string, rowExpiresAt: string | null, now = Date.now()): 'ok' | 'expired' | 'wrong' {
  const h = sha(code)
  const hit = parseCodes(stored, rowExpiresAt).find(c => c.hash === h)
  if (!hit) return 'wrong'
  return hit.expiresAt != null && hit.expiresAt < now ? 'expired' : 'ok'
}

// ── Sending ─────────────────────────────────────────────────────────────────

/** ok: Twilio accepted it (sid). Otherwise code: Twilio's error code, or 'not_configured' / 'unknown'. */
export type SendResult = { ok: boolean; sid?: string; code?: string; message?: string }

/** Where Twilio reports what happened to a sign-up text or call. `v` is the signup_verifications row id (not the token). */
export function signupStatusCallbackUrl(verificationId: string, kind: 'sms' | 'voice'): string {
  return `${colvyBaseUrl()}/api/auth/otp/status?v=${encodeURIComponent(verificationId)}&k=${kind}`
}

const e164 = (v: string) => /^\+\d{8,15}$/.test(v)

/** How sign-up codes are texted: the Messaging Service, else the plain From number, else nothing. */
export function smsSender(): { kind: 'service' | 'number'; value: string } | null {
  if (!platformTwilioConfigured()) return null
  if (TWILIO_MASTER.messagingServiceSid) return { kind: 'service', value: TWILIO_MASTER.messagingServiceSid }
  if (e164(TWILIO_MASTER.fromNumber)) return { kind: 'number', value: TWILIO_MASTER.fromNumber }
  return null
}
export const smsConfigured = () => !!smsSender()
/** Caller ID for "Call me with the code": TWILIO_MASTER_VOICE_FROM, else the From number. */
export const voiceCallerId = () => e164(TWILIO_MASTER.voiceFrom) ? TWILIO_MASTER.voiceFrom : e164(TWILIO_MASTER.fromNumber) ? TWILIO_MASTER.fromNumber : ''
/** "Call me with the code" needs the master account and a number to call from. */
export const voiceFallbackReady = () => platformTwilioConfigured() && !!voiceCallerId()

/** For super admin: what's missing, in one line (null when texting is set up). */
export function smsConfigProblem(): string | null {
  if (!platformTwilioConfigured()) return 'Colvy’s Twilio account isn’t connected: set TWILIO_MASTER_ACCOUNT_SID and TWILIO_MASTER_AUTH_TOKEN, then TWILIO_MASTER_FROM_NUMBER=+61485059215 (or a Messaging Service).'
  if (!smsSender()) return TWILIO_MASTER.fromNumber
    ? `TWILIO_MASTER_FROM_NUMBER (“${TWILIO_MASTER.fromNumber}”) isn’t a full international number. Use the +61… form, e.g. +61485059215.`
    : 'No Twilio sender configured for sign-up codes — set TWILIO_MASTER_FROM_NUMBER=+61485059215 or a Messaging Service (TWILIO_MASTER_MESSAGING_SERVICE_SID).'
  return null
}

const failure = (e: any): SendResult => ({ ok: false, code: String(e?.code || 'unknown'), message: String(e?.message || 'failed').replace(/^Twilio:\s*/, '').slice(0, 200) })

/**
 * Text the code through the master Messaging Service. ok means Twilio accepted
 * it, NOT that it arrived: the delivery report comes later to the callback.
 * Requested by the person for their own number, so no marketing consent
 * applies; Twilio itself refuses numbers that replied STOP (21610).
 */
export async function sendSignupSms(phone: string, code: string, statusCallback?: string): Promise<SendResult> {
  return sendFromMaster(phone, `${code} is your Colvy verification code. It expires in 10 minutes.`, statusCallback)
}

async function sendFromMaster(phone: string, text: string, statusCallback?: string): Promise<SendResult> {
  const tw = platformTwilio()
  const sender = smsSender()
  if (!tw || !sender) {
    console.error('[signup-sms] no Twilio sender configured for sign-up codes: set TWILIO_MASTER_FROM_NUMBER or TWILIO_MASTER_MESSAGING_SERVICE_SID')
    return { ok: false, code: 'not_configured', message: 'No Twilio sender configured' }
  }
  try {
    const { sid } = await tw.sendMessage({
      to: phone, text, statusCallback,
      ...(sender.kind === 'service' ? { messagingServiceSid: sender.value } : { from: sender.value }),
    })
    return sid ? { ok: true, sid } : { ok: false, code: 'unknown', message: 'Twilio returned no message SID' }
  } catch (e: any) {
    console.warn('[signup-sms] text refused:', e?.code || '', e?.message || e)
    return failure(e)
  }
}

/** The call: the six digits, read slowly, twice. */
export function codeCallTwiml(code: string): string {
  const spoken = xmlEscape(code.replace(/\D/g, '').split('').join('. ') + '.')
  const say = (t: string) => `<Say voice="Polly.Nicole" language="en-AU">${t}</Say>`
  return '<?xml version="1.0" encoding="UTF-8"?><Response>'
    + '<Pause length="1"/>'
    + say('Hello. This is Colvy with your verification code.')
    + '<Pause length="1"/>'
    + say(`Your code is: ${spoken}`)
    + '<Pause length="1"/>'
    + say(`Again, your code is: ${spoken}`)
    + '<Pause length="1"/>'
    + say('Enter it on the sign-up page. Goodbye.')
    + '</Response>'
}

/** Call the mobile and read the code out (inline TwiML, so nothing else has to answer Twilio). */
export async function callSignupCode(phone: string, code: string, statusCallback?: string): Promise<SendResult> {
  const tw = platformTwilio()
  if (!tw || !voiceFallbackReady()) return { ok: false, code: 'not_configured', message: 'No caller ID configured (TWILIO_MASTER_VOICE_FROM / TWILIO_MASTER_FROM_NUMBER)' }
  try {
    const { sid } = await tw.createCall({
      to: phone, from: voiceCallerId(), twiml: codeCallTwiml(code), timeout: 30,
      statusCallback, statusEvents: statusCallback ? ['completed'] : undefined,
    })
    return sid ? { ok: true, sid } : { ok: false, code: 'unknown', message: 'Twilio returned no call SID' }
  } catch (e: any) {
    console.warn('[signup-sms] call refused:', e?.code || '', e?.message || e)
    return failure(e)
  }
}

// ── What to tell the person ─────────────────────────────────────────────────

const THEIR_NUMBER = new Set(['21211', '21614', '30005', '30006', '13224'])

/** A plain message for the sign-up page when a text didn't go or didn't arrive. Never shows Twilio's own wording. */
export function smsProblemMessage(code: string | null | undefined, voice: boolean): string {
  const c = String(code || '')
  const call = voice ? ', or get a call with the code instead' : ''
  if (THEIR_NUMBER.has(c)) return `We couldn’t text that number. Check it’s your mobile${call}.`
  if (c === '21610') return voice ? 'This number has opted out of texts from Colvy. Get a call with the code instead.' : 'This number has opted out of texts from Colvy. Text START to our number, or email support@colvy.com.'
  if (c === 'not_configured') return voice
    ? 'We can’t send text messages right now. Get a call with the code instead.'
    : 'We can’t send text messages right now, so we can’t check your mobile. Please email support@colvy.com and we’ll help you finish signing up.'
  if (c === '30003') return `Your phone didn’t pick up our text (it may be off or out of range)${voice ? '. Try again, or get a call with the code' : '. Try again in a minute'}.`
  return voice ? 'We couldn’t text that number. Check it, or get a call with the code.' : 'We couldn’t text that number right now. Check it and try again, or email support@colvy.com.'
}

/** For the admin: "carrier blocked (30007)". */
export const smsErrorLabel = (code: string | null | undefined) => explainDeliveryError(code).label

/**
 * Super admin → "Send test SMS to me": one plain text from the same sender
 * sign-up codes use, to the admin's own mobile. The caller rate-limits it.
 */
export async function sendTestSms(phone: string): Promise<SendResult & { sender?: string }> {
  const sender = smsSender()
  const r = await sendFromMaster(phone, 'Colvy test: sign-up codes can be texted from this sender. No action needed.')
  return { ...r, sender: sender ? (sender.kind === 'service' ? `Messaging Service ${sender.value}` : sender.value) : undefined }
}

/** Twilio's current status for a text (for the test SMS's "Check delivery"). */
export async function messageStatus(sid: string) {
  const tw = platformTwilio()
  if (!tw) return null
  try { return await tw.getMessage(sid) } catch { return null }
}
