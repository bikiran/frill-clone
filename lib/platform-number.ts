// What makes a number on Colvy's platform Twilio account a working Colvy
// number for a business, shared by a purchase (app/api/twilio/number-finalize)
// and a completed port (lib/number-porting-server attachPortedNumber):
//
//   1. its Voice + Messaging webhooks point at Colvy (numberWebhooks), set at
//      purchase time by buyNumber, or afterwards by configureNumberWebhooks for
//      a number that arrived on the account another way (a port);
//   2. recordPlatformNumber: the company's twilio_integrations row carries the
//      platform credentials, the company routes SMS + calls through Twilio, and
//      the number is in phone_numbers (and on its location, when one is given).

import { TWILIO_MASTER, colvyBaseUrl, numberStatusCallbackUrl } from '@/lib/twilio-platform'
import { numberKindOf } from '@/lib/number-types'

/** The webhooks every Colvy number on the platform account uses. */
export function numberWebhooks(base: string = colvyBaseUrl()): { smsUrl: string; voiceUrl: string; statusCallback: string } {
  return {
    smsUrl: `${base}/api/twilio/webhook`,
    voiceUrl: `${base}/api/twilio/voice/inbound`,
    statusCallback: numberStatusCallbackUrl(),
  }
}

/** phone_numbers.number_type for an E.164 number. */
export function phoneNumberType(e164: string): string {
  const k = numberKindOf(e164)
  return k === 'localrate' ? 'local' : k
}

export type RecordNumber = {
  companyId: string
  phoneNumber: string
  numberSid: string | null
  monthly: number
  isFree?: boolean
  subscriptionId?: string | null
  locationId?: string | null
  /** Extra phone_numbers columns (e.g. label). Unknown columns are the caller's risk. */
  extra?: Record<string, any>
}

/**
 * The database side of a new platform number (exactly what number-finalize has
 * always written). Returns whether it became the company's first number and the
 * phone_numbers insert error, if any.
 */
export async function recordPlatformNumber(db: any, o: RecordNumber): Promise<{ isFirst: boolean; error: any }> {
  const now = new Date().toISOString()
  const { data: integ } = await db.from('twilio_integrations').select('id, phone_number').eq('company_id', o.companyId).maybeSingle()
  const isFirst = !integ?.phone_number
  const payload: any = {
    company_id: o.companyId,
    account_sid: TWILIO_MASTER.accountSid, auth_token: TWILIO_MASTER.authToken,
    api_key_sid: TWILIO_MASTER.apiKeySid || null, api_key_secret: TWILIO_MASTER.apiKeySecret || null,
    twiml_app_sid: TWILIO_MASTER.twimlAppSid || null, messaging_service_sid: TWILIO_MASTER.messagingServiceSid || null,
    number_sid: o.numberSid || null, provisioned_by_colvy: true, monthly_cost: o.monthly,
    provisioned_at: now, is_active: true, updated_at: now,
  }
  if (isFirst) payload.phone_number = o.phoneNumber
  if (o.subscriptionId) payload.stripe_subscription_id = o.subscriptionId
  if (integ) await db.from('twilio_integrations').update(payload).eq('company_id', o.companyId)
  else await db.from('twilio_integrations').insert(payload)

  // Route the company's SMS + calls through Twilio.
  try { await db.from('companies').update({ sms_provider: 'twilio', voice_provider: 'twilio', number_provider: 'twilio' }).eq('id', o.companyId) } catch {}

  // Multi-number table.
  const { error } = await db.from('phone_numbers').insert({
    company_id: o.companyId, phone_number: o.phoneNumber, provider: 'twilio', twilio_sid: o.numberSid || null,
    number_type: phoneNumberType(o.phoneNumber),
    location_id: o.locationId || null, is_primary: isFirst, status: 'active',
    provisioned_by_colvy: true, monthly_cost: o.monthly, is_free: !!o.isFree,
    ...(o.extra || {}),
  })

  if (o.locationId) {
    try {
      const { data: pn } = await db.from('phone_numbers').select('id').eq('phone_number', o.phoneNumber).maybeSingle()
      if (pn) await db.from('company_locations').update({ phone_number_id: pn.id }).eq('id', o.locationId)
    } catch {}
  }
  return { isFirst, error: error || null }
}
