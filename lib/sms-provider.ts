// Which provider sends/receives SMS for a company — Telnyx (default) or Twilio.
//
// Both integrations can be configured at once; companies.sms_provider decides
// which is live. This resolver hands back a single uniform `send()` so callers
// (the composer, campaigns, auto-replies) never branch on the provider.
//
// Fail-safe: if Twilio is selected but not fully configured, we fall back to
// Telnyx rather than dropping the message — switching provider can never strand
// a company with no way to text.

import { TelnyxService } from './telnyx-service'
import { TwilioService } from './twilio-service'

export type SmsProvider = 'telnyx' | 'twilio'

export interface SmsSendParams {
  to: string
  text: string
  /** Publicly reachable URLs sent as real MMS media (only when supportsMms). */
  mediaUrls?: string[]
  /** Provider status-callback URL, for delivery receipts. */
  statusCallback?: string
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

/** The company's chosen SMS provider, defaulting to Telnyx (and tolerant of the
 *  sms_provider column not existing yet on an un-migrated database). */
export async function getSmsProvider(db: any, companyId: string): Promise<SmsProvider> {
  try {
    const { data } = await db.from('companies').select('sms_provider').eq('id', companyId).maybeSingle()
    if (data?.sms_provider === 'twilio') return 'twilio'
  } catch { /* column missing → default */ }
  return 'telnyx'
}

/** Build the active SMS sender for a company, or null if none is configured. */
export async function resolveSmsSender(db: any, companyId: string): Promise<SmsSender | null> {
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
      return {
        provider: 'twilio',
        from,
        supportsMms: true,
        async send(p: SmsSendParams): Promise<SmsSendResult> {
          const r = await svc.sendMessage({
            to: p.to,
            text: p.text,
            from: t.phone_number || undefined,
            messagingServiceSid: t.messaging_service_sid || undefined,
            mediaUrls: p.mediaUrls,
            statusCallback: p.statusCallback,
          })
          return { id: r.sid, provider: 'twilio' }
        },
      }
    }
    // Twilio selected but not usable — fall through to Telnyx.
  }

  // Telnyx (default).
  const { data: integ } = await db.from('telnyx_integrations').select('*').eq('company_id', companyId).maybeSingle()
  if (integ?.api_key && integ.phone_number) {
    const svc = new TelnyxService(integ.api_key)
    return {
      provider: 'telnyx',
      from: integ.phone_number,
      supportsMms: false,
      async send(p: SmsSendParams): Promise<SmsSendResult> {
        // Telnyx path keeps its established behaviour: media is delivered as
        // links appended to the body by the caller, so `send` is text-only.
        const r = await svc.sendSMS({
          from: integ.phone_number,
          to: p.to,
          text: p.text,
          messaging_profile_id: integ.messaging_profile_id || undefined,
        })
        return { id: r?.data?.id || null, provider: 'telnyx' }
      },
    }
  }

  return null
}
