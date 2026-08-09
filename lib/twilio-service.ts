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

  // Does this API Key (SKxxxx) still exist on the account? Catches a key that
  // was created in a DIFFERENT account/subaccount (the #1 reason browser calling
  // silently fails to register). We can't verify the SECRET this way, only that
  // the SID belongs here.
  async keyExists(sid: string): Promise<boolean> {
    try { const d = await this.req(`/Keys/${sid}.json`, 'GET'); return !!d?.sid } catch { return false }
  }

  // Fetch a TwiML App (APxxxx) — returns null if it doesn't belong to this
  // account. Used to confirm the app the token points at is real + reachable.
  async getTwimlApp(sid: string): Promise<any | null> {
    try { return await this.req(`/Applications/${sid}.json`, 'GET') } catch { return null }
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

  // The full IncomingPhoneNumber resource (voice_url, sms_url, etc.) — used by
  // the voice diagnostic to confirm inbound webhooks point at us.
  async getIncomingNumber(phoneNumber: string): Promise<any | null> {
    const data = await this.req(`/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(phoneNumber)}`, 'GET')
    return data?.incoming_phone_numbers?.[0] || null
  }

  // Create an Address resource in the account. Twilio requires an emergency /
  // regulatory address (AddressSid) before it will sell certain numbers (AU
  // among them — "Phone Number Requires an Address"). Returns the ADxxxx SID.
  async createAddress(params: { customerName: string; street: string; city: string; region: string; postalCode: string; isoCountry?: string; streetSecondary?: string }): Promise<string | null> {
    const form: Record<string, any> = {
      CustomerName: params.customerName,
      Street: params.street,
      City: params.city,
      Region: params.region,
      PostalCode: params.postalCode,
      IsoCountry: params.isoCountry || 'AU',
    }
    if (params.streetSecondary) form.StreetSecondary = params.streetSecondary
    const data = await this.req('/Addresses.json', 'POST', form)
    return data?.sid || null
  }

  // ── Conferences (warm transfer / hold) ─────────────────────────────────────
  // A live 2-leg call can't hold one side while consulting a third party. Moving
  // both legs into a named conference makes each participant independently
  // holdable and lets a colleague's leg be added without the customer hearing.

  // Find the in-progress conference by its friendly name (we name it per call).
  async getConferenceSid(friendlyName: string): Promise<string | null> {
    const data = await this.req(`/Conferences.json?FriendlyName=${encodeURIComponent(friendlyName)}&Status=in-progress`, 'GET')
    return data?.conferences?.[0]?.sid || null
  }

  // Hold / unhold one participant (identified by their call SID) in a conference.
  async holdParticipant(conferenceSid: string, callSid: string, hold: boolean, holdUrl?: string): Promise<any> {
    const form: Record<string, any> = { Hold: hold ? 'true' : 'false' }
    if (hold && holdUrl) form.HoldUrl = holdUrl
    return this.req(`/Conferences/${conferenceSid}/Participants/${callSid}.json`, 'POST', form)
  }

  // Dial a new participant (e.g. a colleague's browser client) straight into the
  // conference. `to` is a `client:<identity>` or an E.164 number.
  async addParticipant(conferenceSid: string, params: { from: string; to: string; timeout?: number; statusCallback?: string }): Promise<{ callSid: string | null; raw: any }> {
    const form: Record<string, any> = { From: params.from, To: params.to }
    if (params.timeout) form.Timeout = params.timeout
    if (params.statusCallback) { form.StatusCallback = params.statusCallback; form.StatusCallbackEvent = ['answered', 'completed'] }
    const data = await this.req(`/Conferences/${conferenceSid}/Participants.json`, 'POST', form)
    return { callSid: data?.call_sid || null, raw: data }
  }

  // Remove a participant from the conference (their call is hung up).
  async removeParticipant(conferenceSid: string, callSid: string): Promise<any> {
    return this.req(`/Conferences/${conferenceSid}/Participants/${callSid}.json`, 'DELETE')
  }

  // Live-resolve the answered agent leg of an inbound ring-all call.
  //
  // A <Dial><Client> child leg carries ParentCallSid = the inbound customer
  // call, and its `to` is `client:<identity>`. The child-status webhook is
  // supposed to capture this SID at answer, but if that callback never lands
  // (base URL not publicly reachable, delivery dropped) warm transfer would be
  // stuck. This asks Twilio directly for the in-progress child so transfer can
  // proceed regardless. Returns the client leg's SID, or null if none is live.
  async getAnsweredChildCallSid(parentCallSid: string): Promise<string | null> {
    try {
      const data = await this.req(`/Calls.json?ParentCallSid=${encodeURIComponent(parentCallSid)}&Status=in-progress`, 'GET')
      const calls: any[] = data?.calls || []
      const client = calls.find(c => typeof c?.to === 'string' && c.to.startsWith('client:'))
      return client?.sid || calls[0]?.sid || null
    } catch { return null }
  }

  // ── Number provisioning (used with the platform account) ────────────────────
  // Search buyable numbers in a country. `type` maps to Twilio's number classes.
  async searchAvailableNumbers(params: { country?: string; type?: 'local' | 'mobile' | 'national' | 'tollfree'; areaCode?: string; contains?: string; limit?: number }): Promise<any[]> {
    const country = params.country || 'AU'
    const kind = params.type === 'mobile' ? 'Mobile'
      : params.type === 'national' ? 'National'
      : params.type === 'tollfree' ? 'TollFree' : 'Local'
    const q = new URLSearchParams()
    q.set('PageSize', String(params.limit || 10))
    q.set('SmsEnabled', 'true')
    q.set('VoiceEnabled', 'true')
    if (params.areaCode) q.set('AreaCode', params.areaCode)
    if (params.contains) q.set('Contains', params.contains)
    const data = await this.req(`/AvailablePhoneNumbers/${country}/${kind}.json?${q.toString()}`, 'GET')
    return data?.available_phone_numbers || []
  }

  // Buy a number and point its webhooks at Colvy. For regulated countries (AU),
  // pass the BundleSid + AddressSid that satisfy the regulatory requirements.
  async buyNumber(params: { phoneNumber: string; smsUrl?: string; voiceUrl?: string; statusCallback?: string; bundleSid?: string; addressSid?: string; friendlyName?: string }): Promise<{ sid: string | null; raw: any }> {
    const form: Record<string, any> = { PhoneNumber: params.phoneNumber }
    if (params.friendlyName) form.FriendlyName = params.friendlyName
    if (params.smsUrl) { form.SmsUrl = params.smsUrl; form.SmsMethod = 'POST' }
    if (params.voiceUrl) { form.VoiceUrl = params.voiceUrl; form.VoiceMethod = 'POST' }
    if (params.statusCallback) form.StatusCallback = params.statusCallback
    if (params.bundleSid) form.BundleSid = params.bundleSid
    if (params.addressSid) form.AddressSid = params.addressSid
    const data = await this.req('/IncomingPhoneNumbers.json', 'POST', form)
    return { sid: data?.sid || null, raw: data }
  }

  // ── Regulatory compliance (AU numbers) ──────────────────────────────────────
  // Twilio's Regulatory Compliance API lives on numbers.twilio.com (not the
  // 2010-04-01 base). Creating the bundle shell here; attaching the exact
  // RegulationSid / EndUser / SupportingDocument is account-specific and verified
  // live, mirroring how the Telnyx requirement-group mapping is left as a
  // live-verification follow-up.
  async createRegulatoryBundle(params: { friendlyName: string; email: string; isoCountry?: string; numberType?: string; endUserType?: string; regulationSid?: string }): Promise<any> {
    const form: Record<string, any> = {
      FriendlyName: params.friendlyName,
      Email: params.email,
      IsoCountry: params.isoCountry || 'AU',
      NumberType: params.numberType || 'local',
      EndUserType: params.endUserType || 'business',
    }
    if (params.regulationSid) form.RegulationSid = params.regulationSid
    return this.req('https://numbers.twilio.com/v2/RegulatoryCompliance/Bundles', 'POST', form)
  }

  async submitRegulatoryBundle(bundleSid: string): Promise<any> {
    return this.req(`https://numbers.twilio.com/v2/RegulatoryCompliance/Bundles/${bundleSid}`, 'POST', { Status: 'pending-review' })
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
