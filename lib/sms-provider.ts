// Which provider sends/receives SMS for a company — Twilio (default) or, for
// legacy rows, Telnyx.
//
// Both integrations can be configured at once; companies.sms_provider decides
// which is live. This resolver hands back a single uniform `send()` so callers
// (the composer, campaigns, auto-replies) never branch on the provider.
//
// Fail-safe: if Twilio is selected but not fully configured, we fall back to
// Telnyx rather than dropping the message — switching provider can never strand
// a company with no way to text.

import { TelnyxService, toE164 } from './telnyx-service'
import { TwilioService } from './twilio-service'
import { assertSmsAllowed, recordSmsSent, checkSmsAllowance, SmsQuotaError } from './sms-quota'
import { chargeSingleSend, refundSingleSend, costForParts } from './sms-credits'
import { fmtCents } from './sms-credits-core'
import { analyseSms } from './sms-segments'
import { getSmsPolicy, blockedText } from './sms-policy'

export type SmsProvider = 'telnyx' | 'twilio'

export interface SmsSendParams {
  to: string
  text: string
  /** Publicly reachable URLs sent as real MMS media (only when supportsMms). */
  mediaUrls?: string[]
  /** Provider status-callback URL, for delivery receipts. */
  statusCallback?: string
  /**
   * Send from this one of the business's own numbers instead of its usual
   * texting number — e.g. the line a customer just rang, so the text comes
   * from the number they know. Callers check it belongs to the business.
   */
  from?: string
}

export interface SmsSendResult {
  id: string | null
  provider: SmsProvider
}

export interface SmsSender {
  provider: SmsProvider
  from: string
  /** True when the provider can carry real MMS media (Twilio); Telnyx sends links. */
  supportsMms: boolean
  send(p: SmsSendParams): Promise<SmsSendResult>
}

/**
 * A carrier rejection, in words the person who pressed send can act on.
 *
 * Both providers hand back their own wording, which is accurate and useless at
 * the point of failure: forwarding an attachment to a landline reported only
 * that the provider refused it, so the send looked broken rather than
 * impossible. Working out that the number was a landline took a trip through
 * the web app.
 *
 * The provider's own text is always kept — it is the record of what actually
 * came back, and the patterns below are guesses at wording that can change.
 */
export function isLandlineRejection(raw: unknown): boolean {
  const msg = String((raw as any)?.message || raw || '')
  return /landline|fixed[ -]?line|not a valid mobile|non-?mobile|unsupported destination|cannot receive/i.test(msg)
}

export function explainSmsFailure(raw: unknown): string {
  const msg = String((raw as any)?.message || raw || 'Send failed')
  if (isLandlineRejection(msg)) {
    return `That number cannot receive text messages — it looks like a landline. (${msg})`
  }
  return msg
}

/** The company's SMS provider. Colvy runs on Twilio; Telnyx is legacy and only
 *  used when a company is still explicitly set to it (V338 moves them all). */
export async function getSmsProvider(db: any, companyId: string): Promise<SmsProvider> {
  try {
    const { data } = await db.from('companies').select('sms_provider').eq('id', companyId).maybeSingle()
    if (data?.sms_provider === 'telnyx') return 'telnyx'
  } catch { /* column missing → default */ }
  return 'twilio'
}

// The provider sender with E.164 normalisation only (see resolveSmsSender).
function unmetered(base: SmsSender): SmsSender {
  return { ...base, send: (p: SmsSendParams) => base.send({ ...p, to: toE164(p.to || '') || p.to }) }
}

/**
 * Pay for one text before it goes: free inside the month's allowance,
 * otherwise from prepaid SMS credit (lib/sms-credits, V395), as the company's
 * SMS billing policy says (lib/sms-policy). Throws SmsQuotaError when it
 * can't go — 'plan' (no SMS on the plan), 'sms_disabled' (texting switched
 * off by Colvy), 'credit' (not enough credit; with the shortfall), or 'limit'
 * (allowance used, and either the policy is allowance-only or there's no
 * wallet yet: today's rule). Returns what was charged, to refund if the
 * carrier then refuses the text.
 *
 * Compliance: Colvy sends no automatic reply to STOP or START (the carrier
 * confirms opt-outs), and recording an opt-out never sends anything, so a
 * blocked account still honours every STOP / START.
 */
export async function payForText(db: any, companyId: string, parts: number): Promise<{ chargedCents: number; billableParts: number }> {
  const c = await chargeSingleSend(db, { companyId, parts, note: 'Text sent' })
  if (c.ok) return { chargedCents: c.chargedCents, billableParts: c.billableParts }
  if (c.reason === 'plan' || c.reason === 'sms_disabled') {
    throw new SmsQuotaError(c.reason, blockedText(c.reason))
  }
  if (c.reason === 'limit') {
    const a = await checkSmsAllowance(db, companyId).catch(() => ({ limit: 0, used: 0 }) as any)
    throw new SmsQuotaError('limit', `Monthly SMS allowance reached (${Number(a.limit) || 0}). It resets at the start of next month.`, a.limit, a.used, { canTopUp: false })
  }
  if (c.reason === 'insufficient') {
    const [{ cents }, policy] = await Promise.all([
      costForParts(db, companyId, c.billableParts || parts).catch(() => ({ cents: 0 })),
      getSmsPolicy(db, companyId),
    ])
    const short = Math.max(0, cents - (c.balanceCents || 0))
    const a = await checkSmsAllowance(db, companyId).catch(() => ({ limit: 0, used: 0 }) as any)
    const head = policy.mode === 'credit_only' ? 'Not enough SMS credit: the balance is' : 'Not enough SMS credit: this month\u2019s allowance is used and the balance is'
    const tail = policy.canTopUp ? 'Top up SMS credit from Billing to keep texting.' : 'Top-ups are managed by Colvy for your account: contact us to add credit.'
    throw new SmsQuotaError('credit',
      `${head} ${fmtCents(c.balanceCents || 0)}${short ? ` (this text needs ${fmtCents(cents)})` : ''}. ${tail}`,
      a.limit, a.used, { shortfallCents: short, balanceCents: c.balanceCents || 0, canTopUp: policy.canTopUp })
  }
  // 'not_set_up' (no wallet yet) or the wallet couldn't be read: the allowance alone.
  await assertSmsAllowed(db, companyId)
  return { chargedCents: 0, billableParts: 0 }
}

// Wrap a sender so every send is paid for first (allowance, then credit) and
// counted against the month in parts. This is the single choke point for 1:1
// and automated texts: the composer, auto-replies and media requests all
// obtain their sender here. Campaigns don't: they're paid for as a whole
// (a hold, settled at the end), so their sender is unmetered.
function meteredSender(db: any, companyId: string, base: SmsSender): SmsSender {
  return {
    ...base,
    async send(p: SmsSendParams): Promise<SmsSendResult> {
      const parts = smsParts(p.text)
      const paid = await payForText(db, companyId, parts)  // throws SmsQuotaError if blocked
      // Always send to an E.164 number. Callers pass whatever they have — a
      // contact's phone saved as "0478 019 667" was rejected by the provider,
      // and routes that swallow send errors (media requests) showed the link
      // in the thread while the customer never got it.
      let result: SmsSendResult
      try {
        result = await base.send({ ...p, to: toE164(p.to || '') || p.to })
      } catch (e) {
        // The carrier refused it: give the credit back.
        if (paid.chargedCents > 0) {
          await refundSingleSend(db, { companyId, cents: paid.chargedCents, parts: paid.billableParts, note: 'Text not sent: credit returned' }).catch(() => null)
        }
        throw e
      }
      // Counted in parts, as the carrier bills: a 2-segment text uses 2.
      recordSmsSent(db, companyId, parts).catch(() => {})
      return result
    },
  }
}

/** Billable parts for one text (at least 1, so a bare picture message counts). */
export function smsParts(text: string | null | undefined): number {
  return Math.max(1, analyseSms(text || '').segments || 1)
}

/**
 * Build the active SMS sender for a company, or null if none is configured.
 *
 * `metered: false` hands back the provider sender without the allowance gate
 * and counter: only for a caller that meters every send itself (the campaign
 * sender reserves each text's parts against the allowance before sending it).
 */
export async function resolveSmsSender(db: any, companyId: string, opts: { metered?: boolean } = {}): Promise<SmsSender | null> {
  const meter = (base: SmsSender): SmsSender => opts.metered === false ? unmetered(base) : meteredSender(db, companyId, base)
  const provider = await getSmsProvider(db, companyId)

  if (provider === 'twilio') {
    let t: any = null
    try {
      const { data } = await db.from('twilio_integrations').select('*').eq('company_id', companyId).maybeSingle()
      t = data
    } catch { /* table missing → fall back to Telnyx */ }
    const usable = t?.account_sid && t?.auth_token && (t.phone_number || t.messaging_service_sid) && t.sms_enabled !== false
    if (usable) {
      const svc = new TwilioService(t.account_sid, t.auth_token)
      const from = t.phone_number || ''
      return meter({
        provider: 'twilio',
        from,
        supportsMms: true,
        async send(p: SmsSendParams): Promise<SmsSendResult> {
          // A different number of the business's goes out from that number
          // directly; otherwise the usual number or Messaging Service.
          const other = !!p.from && (toE164(p.from) || p.from) !== (toE164(t.phone_number || '') || t.phone_number)
          try {
            const r = await svc.sendMessage({
              to: p.to,
              text: p.text,
              from: other ? p.from : (t.phone_number || undefined),
              messagingServiceSid: other ? undefined : (t.messaging_service_sid || undefined),
              mediaUrls: p.mediaUrls,
              statusCallback: p.statusCallback,
            })
            return { id: r.sid, provider: 'twilio' }
          } catch (e) {
            throw new Error(explainSmsFailure(e))
          }
        },
      })
    }
    // Twilio selected but not usable — fall through to Telnyx.
  }

  // Telnyx (default).
  const { data: integ } = await db.from('telnyx_integrations').select('*').eq('company_id', companyId).maybeSingle()
  if (integ?.api_key && integ.phone_number) {
    const svc = new TelnyxService(integ.api_key)
    return meter({
      provider: 'telnyx',
      from: integ.phone_number,
      supportsMms: false,
      async send(p: SmsSendParams): Promise<SmsSendResult> {
        // Telnyx path keeps its established behaviour: media is delivered as
        // links appended to the body by the caller, so `send` is text-only.
        try {
          const r = await svc.sendSMS({
            from: p.from || integ.phone_number,
            to: p.to,
            text: p.text,
            messaging_profile_id: integ.messaging_profile_id || undefined,
          })
          return { id: r?.data?.id || null, provider: 'telnyx' }
        } catch (e) {
          throw new Error(explainSmsFailure(e))
        }
      },
    })
  }

  return null
}
