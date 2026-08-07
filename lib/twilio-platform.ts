import { TwilioService } from './twilio-service'

// Colvy's OWN (platform) Twilio account. Companies never create or see Twilio
// credentials — Colvy provisions numbers on their behalf through this master
// account, exactly like the Telnyx master key. Configure in the environment:
//   TWILIO_MASTER_ACCOUNT_SID, TWILIO_MASTER_AUTH_TOKEN
//   TWILIO_MASTER_API_KEY_SID, TWILIO_MASTER_API_KEY_SECRET  (voice tokens)
//   TWILIO_MASTER_TWIML_APP_SID                              (browser calling)
//   TWILIO_MASTER_MESSAGING_SERVICE_SID                      (optional sender pool)
export const TWILIO_MASTER = {
  accountSid: process.env.TWILIO_MASTER_ACCOUNT_SID || '',
  authToken: process.env.TWILIO_MASTER_AUTH_TOKEN || '',
  apiKeySid: process.env.TWILIO_MASTER_API_KEY_SID || '',
  apiKeySecret: process.env.TWILIO_MASTER_API_KEY_SECRET || '',
  twimlAppSid: process.env.TWILIO_MASTER_TWIML_APP_SID || '',
  messagingServiceSid: process.env.TWILIO_MASTER_MESSAGING_SERVICE_SID || '',
}

export function platformTwilioConfigured(): boolean {
  return !!(TWILIO_MASTER.accountSid && TWILIO_MASTER.authToken)
}

export function platformTwilio(): TwilioService | null {
  if (!platformTwilioConfigured()) return null
  return new TwilioService(TWILIO_MASTER.accountSid, TWILIO_MASTER.authToken)
}

// The public base Twilio should call our webhooks on. Resolves per number by
// looking the company up from the receiving number, so any colvy host works.
export function colvyBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com').replace(/\/$/, '')
}
