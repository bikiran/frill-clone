import { TwilioService } from './twilio-service'

// Colvy's OWN (platform) Twilio account. Companies never create or see Twilio
// credentials — Colvy provisions numbers on their behalf through this master
// account, exactly like the Telnyx master key. Configure in the environment:
//   TWILIO_MASTER_ACCOUNT_SID, TWILIO_MASTER_AUTH_TOKEN
//   TWILIO_MASTER_API_KEY_SID, TWILIO_MASTER_API_KEY_SECRET  (voice tokens)
//   TWILIO_MASTER_TWIML_APP_SID                              (browser calling)
//   TWILIO_MASTER_MESSAGING_SERVICE_SID                      (optional sender pool)
//   TWILIO_MASTER_ADDRESS_SID                                (optional AU regulatory address)
//   TWILIO_MASTER_FROM_NUMBER                                (optional: a number on the account,
//                                                             e.g. +61485059215, that texts sign-up
//                                                             codes when no Messaging Service is set,
//                                                             and is the caller ID for code calls)
//   TWILIO_MASTER_VOICE_FROM                                 (optional: a different caller ID for
//                                                             "Call me with the code")
export const TWILIO_MASTER = {
  accountSid: process.env.TWILIO_MASTER_ACCOUNT_SID || '',
  authToken: process.env.TWILIO_MASTER_AUTH_TOKEN || '',
  apiKeySid: process.env.TWILIO_MASTER_API_KEY_SID || '',
  apiKeySecret: process.env.TWILIO_MASTER_API_KEY_SECRET || '',
  twimlAppSid: process.env.TWILIO_MASTER_TWIML_APP_SID || '',
  messagingServiceSid: process.env.TWILIO_MASTER_MESSAGING_SERVICE_SID || '',
  // A pre-created Address (ADxxxx) on the platform account. When set, it is
  // attached to every number purchase to satisfy Twilio's "requires an address"
  // rule. If empty, the buy flow auto-creates one from the company's regulatory
  // bundle instead.
  addressSid: process.env.TWILIO_MASTER_ADDRESS_SID || '',
  // E.164 number on the platform account that places sign-up code calls. A
  // Messaging Service can't make calls, so this is separate.
  voiceFrom: (process.env.TWILIO_MASTER_VOICE_FROM || '').trim(),
  // E.164 number on the platform account for sign-up code texts when there's
  // no Messaging Service (the Messaging Service wins when both are set), and
  // the caller ID for code calls when TWILIO_MASTER_VOICE_FROM isn't set.
  fromNumber: (process.env.TWILIO_MASTER_FROM_NUMBER || '').replace(/[\s()-]/g, ''),
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

// A Colvy number's status callback: Twilio tells us there when a call to the
// number ends. It's how a turn-by-turn AI call learns the caller hung up on
// the greeting (see app/api/twilio/voice/status).
export function numberStatusCallbackUrl(): string {
  return `${colvyBaseUrl()}/api/twilio/voice/status`
}
