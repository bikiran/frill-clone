// Thin wrapper around the Twilio REST API (2010-04-01) + Voice Access Tokens.
// Server-side only — never expose the account credentials to the browser.
//
// Deliberately hand-rolled (no `twilio` npm SDK), mirroring lib/telnyx-service.ts:
// the SDK pulls in a large dependency tree we don't need, and every call here is
// a simple form-encoded POST/GET with Basic auth. Access Tokens are plain JWTs
// we sign ourselves with the API Key secret.

import crypto from 'crypto'

const TWILIO_BASE = 'https://api.twilio.com/2010-04-01'

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export class TwilioService {
  private accountSid: string
  private authToken: string
  constructor(accountSid: string, authToken: string) {
    this.accountSid = accountSid
    this.authToken = authToken
  }

  private basicAuth(): string {
    return 'Basic ' + Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64')
  }

  // Form-encoded REST call against the account's resource collection.
  private async req(path: string, method: string, form?: Record<string, any>): Promise<any> {
    const isAbsolute = /^https?:\/\//.test(path)
    const url = isAbsolute ? path : `${TWILIO_BASE}/Accounts/${this.accountSid}${path}`
    const init: any = {
      method,
      headers: { 'Authorization': this.basicAuth() },
    }
    if (form) {
      const body = new URLSearchParams()
      for (const [k, v] of Object.entries(form)) {
        if (v == null) continue
        // MediaUrl can repeat; pass an array to send several.
        if (Array.isArray(v)) { for (const item of v) if (item != null) body.append(k, String(item)) }
        else body.append(k, String(v))
      }
      init.body = body.toString()
      init.headers['Content-Type'] = 'application/x-www-form-urlencoded'
    }
    const res = await fetch(url, init)
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      const msg = data?.message || data?.detail || res.statusText
      throw new Error(`Twilio: ${msg}`)
    }
    return data
  }

  // ── Credential check ────────────────────────────────────────────────────
  // Fetching the account resource throws on bad credentials — used to verify a
  // key the moment it's entered.
  async verify(): Promise<{ friendlyName?: string; status?: string }> {
    const data = await this.req('.json', 'GET')
    return { friendlyName: data?.friendly_name, status: data?.status }
  }

  // List the account's Twilio numbers (for the settings picker / verification).
  async listPhoneNumbers(): Promise<any[]> {
    const data = await this.req('/IncomingPhoneNumbers.json?PageSize=50', 'GET')
    return data?.incoming_phone_numbers || []
  }

  // ── SMS / MMS ─────────────────────────────────────────────────────────────
  // `mediaUrls` sends real MMS (each must be a publicly reachable URL). Use
  // either `from` (a specific number) or `messagingServiceSid` (a sender pool).
  async sendMessage(params: {
    to: string
    text?: string
    from?: string
    messagingServiceSid?: string
    mediaUrls?: string[]
    statusCallback?: string
  }): Promise<{ sid: string | null; raw: any }> {
    const form: Record<string, any> = { To: params.to }
    if (params.messagingServiceSid) form.MessagingServiceSid = params.messagingServiceSid
    else if (params.from) form.From = params.from
    if (params.text) form.Body = params.text
    if (params.mediaUrls?.length) form.MediaUrl = params.mediaUrls
    if (params.statusCallback) form.StatusCallback = params.statusCallback
    const data = await this.req('/Messages.json', 'POST', form)
    return { sid: data?.sid || null, raw: data }
  }

  // Inbound MMS media lives behind the account (Basic-auth protected). Fetch the
  // bytes server-side so we can re-host them somewhere public and show the photo
  // in the thread instead of a broken, auth-gated link.
  async fetchMedia(mediaUrl: string): Promise<{ bytes: Uint8Array; contentType: string }> {
    const res = await fetch(mediaUrl, { headers: { 'Authorization': this.basicAuth() } })
    if (!res.ok) throw new Error(`Twilio media fetch: ${res.status}`)
    const contentType = res.headers.get('content-type') || 'application/octet-stream'
    const buf = new Uint8Array(await res.arrayBuffer())
    return { bytes: buf, contentType }
  }

  // ── Voice: live-call control (for transfer / hangup) ───────────────────────
  // Redirect an in-progress call to fresh TwiML (used to move a leg into a
  // conference for warm transfer), or end it.
  async updateCall(callSid: string, opts: { twiml?: string; url?: string; method?: string; status?: string }): Promise<any> {
    const form: Record<string, any> = {}
    if (opts.twiml) form.Twiml = opts.twiml
    if (opts.url) form.Url = opts.url
    if (opts.method) form.Method = opts.method
    if (opts.status) form.Status = opts.status
    return this.req(`/Calls/${callSid}.json`, 'POST', form)
  }

  async hangupCall(callSid: string): Promise<any> {
    return this.updateCall(callSid, { status: 'completed' })
  }

  // Place a server-originated call (e.g. click-to-dial without the browser SDK).
  async createCall(params: { to: string; from: string; url: string; statusCallback?: string }): Promise<{ sid: string | null; raw: any }> {
    const form: Record<string, any> = { To: params.to, From: params.from, Url: params.url }
    if (params.statusCallback) {
      form.StatusCallback = params.statusCallback
      form.StatusCallbackEvent = ['initiated', 'ringing', 'answered', 'completed']
    }
    const data = await this.req('/Calls.json', 'POST', form)
    return { sid: data?.sid || null, raw: data }
  }

  // ── Voice: self-provisioning (parity with Telnyx setup-calling) ────────────
  // Browser calling needs an API Key pair (to mint Access Tokens) and a TwiML
  // App (to route the SDK's calls to our /voice endpoints). Create them once.
  async createApiKey(friendlyName: string): Promise<{ sid: string; secret: string }> {
    const data = await this.req('/Keys.json', 'POST', { FriendlyName: friendlyName })
    return { sid: data?.sid, secret: data?.secret }
  }

  async createTwimlApp(params: { friendlyName: string; voiceUrl: string; voiceMethod?: string; statusCallback?: string }): Promise<any> {
    return this.req('/Applications.json', 'POST', {
      FriendlyName: params.friendlyName,
      VoiceUrl: params.voiceUrl,
      VoiceMethod: params.voiceMethod || 'POST',
      ...(params.statusCallback ? { StatusCallback: params.statusCallback } : {}),
    })
  }

  async updateTwimlApp(appSid: string, params: { voiceUrl?: string; voiceMethod?: string; statusCallback?: string }): Promise<any> {
    const form: Record<string, any> = {}
    if (params.voiceUrl) form.VoiceUrl = params.voiceUrl
    if (params.voiceMethod) form.VoiceMethod = params.voiceMethod
    if (params.statusCallback) form.StatusCallback = params.statusCallback
    return this.req(`/Applications/${appSid}.json`, 'POST', form)
  }

  // Point a number's inbound Voice + Messaging webhooks at our endpoints, so
  // calls and texts to it reach Colvy.
  async configureNumberWebhooks(params: {
    phoneNumberSid: string
    voiceUrl?: string
    smsUrl?: string
    voiceMethod?: string
    smsMethod?: string
    statusCallback?: string
  }): Promise<any> {
    const form: Record<string, any> = {}
    if (params.voiceUrl) { form.VoiceUrl = params.voiceUrl; form.VoiceMethod = params.voiceMethod || 'POST' }
    if (params.smsUrl) { form.SmsUrl = params.smsUrl; form.SmsMethod = params.smsMethod || 'POST' }
    if (params.statusCallback) form.StatusCallback = params.statusCallback
    return this.req(`/IncomingPhoneNumbers/${params.phoneNumberSid}.json`, 'POST', form)
  }

  async getPhoneNumberSid(phoneNumber: string): Promise<string | null> {
    const data = await this.req(`/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(phoneNumber)}`, 'GET')
    return data?.incoming_phone_numbers?.[0]?.sid || null
  }
}

// Mint a short-lived Twilio Voice Access Token (a JWT the browser SDK registers
// with). Signed HS256 with the API Key secret; carries a VoiceGrant for the
// TwiML App so the SDK can place and receive calls as `identity`.
export function createVoiceAccessToken(params: {
  accountSid: string
  apiKeySid: string
  apiKeySecret: string
  identity: string
  twimlAppSid: string
  ttlSeconds?: number
  nowSeconds: number   // pass an explicit clock — callers stamp it
}): string {
  const ttl = params.ttlSeconds || 3600
  const header = { alg: 'HS256', typ: 'JWT', cty: 'twilio-fpa;v=1' }
  const payload = {
    jti: `${params.apiKeySid}-${params.nowSeconds}`,
    iss: params.apiKeySid,
    sub: params.accountSid,
    iat: params.nowSeconds,
    exp: params.nowSeconds + ttl,
    grants: {
      identity: params.identity,
      voice: {
        incoming: { allow: true },
        outgoing: { application_sid: params.twimlAppSid },
      },
    },
  }
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`
  const sig = crypto.createHmac('sha256', params.apiKeySecret).update(signingInput).digest()
  return `${signingInput}.${b64url(sig)}`
}

// The browser Twilio Voice SDK identity for a user. Inbound TwiML dials
// <Client><Identity>this</Identity></Client>, so the format must match on both
// the token (registration) and inbound (dialling) sides. Kept ASCII-safe —
// Twilio identities disallow many characters.
export function twilioIdentity(userId: string | null | undefined, companyId: string): string {
  return userId
    ? `u_${String(userId).replace(/[^a-zA-Z0-9_]/g, '')}`
    : `co_${String(companyId).replace(/[^a-zA-Z0-9_]/g, '')}`
}

// Escape text for safe inclusion in TwiML (<Say>, attribute values).
export function xmlEscape(s: string): string {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}
