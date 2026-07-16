// Thin wrapper around the Telnyx REST API (v2).
// Server-side only — never expose the API key to the browser.

const TELNYX_BASE = 'https://api.telnyx.com/v2'

export class TelnyxService {
  private apiKey: string
  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  private async req(path: string, method: string, body?: any) {
    const res = await fetch(`${TELNYX_BASE}${path}`, {
      method,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      const msg = data?.errors?.[0]?.detail || data?.errors?.[0]?.title || res.statusText
      throw new Error(`Telnyx: ${msg}`)
    }
    return data
  }

  // Verify the key works and list numbers
  async listPhoneNumbers() {
    const data = await this.req('/phone_numbers?page[size]=50', 'GET')
    return data.data || []
  }

  // Send an SMS
  async sendSMS(params: { from: string; to: string; text: string; messaging_profile_id?: string }) {
    return this.req('/messages', 'POST', {
      from: params.from,
      to: params.to,
      text: params.text,
      ...(params.messaging_profile_id ? { messaging_profile_id: params.messaging_profile_id } : {}),
    })
  }

  // Create an on-demand credential for WebRTC (telephony credential tied to a connection)
  async createTelephonyCredential(connectionId: string, name: string) {
    return this.req('/telephony_credentials', 'POST', { connection_id: connectionId, name })
  }

  // Fetch a telephony credential's details — needed to read its real sip_username
  // (the part before @sip.telnyx.com that Call Control dials to reach the client).
  async getTelephonyCredential(credentialId: string) {
    return this.req(`/telephony_credentials/${credentialId}`, 'GET')
  }

  // ── WebRTC connection ───────────────────────────────────────────────────
  // Browser calling needs a Credential Connection on the Telnyx side. Buying a
  // number does NOT create one, which is why calls failed with "Connection to
  // server lost" — the client had a token for a connection that didn't exist.

  async listCredentialConnections(): Promise<any[]> {
    try {
      const data = await this.req('/credential_connections?page[size]=50', 'GET')
      return data?.data || []
    } catch { return [] }
  }

  async createCredentialConnection(name: string, webhookUrl?: string, outboundVoiceProfileId?: string) {
    return this.req('/credential_connections', 'POST', {
      connection_name: name,
      // WebRTC clients register over TLS/SRTP.
      active: true,
      transport_protocol: 'TLS',
      encrypted_media: 'SRTP',
      // Let the browser client authenticate with the ephemeral token.
      user_name: `colvy_${Math.random().toString(36).slice(2, 10)}`,
      password: Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2).toUpperCase(),
      ...(webhookUrl ? {
        webhook_event_url: webhookUrl,
        webhook_api_version: '2',
      } : {}),
      inbound: { ani_number_format: '+E.164' },
      // CRITICAL: without an outbound voice profile ATTACHED to the connection,
      // Telnyx rejects every outbound call (the old code passed `undefined`,
      // which JSON.stringify silently drops — so no profile was ever attached).
      ...(outboundVoiceProfileId ? { outbound: { outbound_voice_profile_id: outboundVoiceProfileId } } : {}),
    })
  }

  // Fetch one credential connection (to inspect its outbound profile).
  async getCredentialConnection(connectionId: string) {
    const data = await this.req(`/credential_connections/${connectionId}`, 'GET')
    return data?.data || null
  }

  // Set a known username/password on the credential connection so a WebRTC
  // client can REGISTER with it (login/password), which — unlike a JWT token —
  // makes it a registered SIP endpoint that inbound Call Control can dial.
  async setConnectionCredentials(connectionId: string, userName: string, password: string) {
    return this.req(`/credential_connections/${connectionId}`, 'PATCH', {
      user_name: userName,
      password,
    })
  }

  // Attach/replace the outbound voice profile on an EXISTING connection —
  // heals connections created before the fix above.
  async attachOutboundProfile(connectionId: string, profileId: string) {
    return this.req(`/credential_connections/${connectionId}`, 'PATCH', {
      outbound: { outbound_voice_profile_id: profileId },
    })
  }

  // Point a phone number at a connection, so inbound calls reach the browser.
  async assignNumberToConnection(phoneNumber: string, connectionId: string) {
    // Find the number's id first.
    const list = await this.req(`/phone_numbers?filter[phone_number]=${encodeURIComponent(phoneNumber)}`, 'GET')
    const id = list?.data?.[0]?.id
    if (!id) throw new Error(`Number ${phoneNumber} not found on this Telnyx account`)
    return this.req(`/phone_numbers/${id}`, 'PATCH', { connection_id: connectionId })
  }

  // Outbound voice needs a profile, or Telnyx rejects the call.
  async ensureOutboundVoiceProfile(name: string) {
    // CRITICAL: Telnyx outbound voice profiles default their
    // `whitelisted_destinations` to ["US","CA"]. We never set it, so every call
    // to a +61 number was refused by the carrier the instant it was placed —
    // which is exactly what CALL_REJECTED means, and why the Telnyx log showed
    // call.initiated followed by call.hangup 1-3 seconds later.
    const DESTINATIONS = ['AU', 'NZ', 'US', 'CA', 'GB']
    try {
      const existing = await this.req('/outbound_voice_profiles?page[size]=50', 'GET')
      const found = (existing?.data || []).find((p: any) => p.name === name)
      if (found) {
        // HEAL an existing profile that's missing AU.
        const current: string[] = found.whitelisted_destinations || []
        const missing = DESTINATIONS.filter(d => !current.includes(d))
        if (missing.length) {
          try {
            const patched = await this.req(`/outbound_voice_profiles/${found.id}`, 'PATCH', {
              whitelisted_destinations: Array.from(new Set([...current, ...DESTINATIONS])),
              enabled: true,
            })
            return patched?.data || found
          } catch { /* fall through and use it as-is */ }
        }
        return found
      }
    } catch {}
    const created = await this.req('/outbound_voice_profiles', 'POST', {
      name,
      traffic_type: 'conversational',
      service_plan: 'global',
      enabled: true,
      whitelisted_destinations: DESTINATIONS,
    })
    return created?.data
  }

  // Generate a short-lived JWT the browser uses to register the WebRTC client
  async createCredentialToken(credentialId: string) {
    // Returns a raw JWT string (text/plain)
    const res = await fetch(`${TELNYX_BASE}/telephony_credentials/${credentialId}/token`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${this.apiKey}` },
    })
    if (!res.ok) throw new Error(`Telnyx token: ${res.statusText}`)
    return (await res.text()).trim()
  }

  // ── Regulatory requirements (AU numbers need these before activation) ────────

  // Discover what a given AU number type requires (fields + documents), so the
  // UI can render exactly the right form. Returns Telnyx's requirement list.
  async getPhoneNumberRequirements(params: { country?: string; phoneNumberType?: string; action?: string }) {
    const country = params.country || 'AU'
    const type = params.phoneNumberType || 'local'
    const action = params.action || 'ordering'
    const data = await this.req(`/phone_number_regulatory_requirements?filter[country_code]=${country}&filter[phone_number_type]=${type}&filter[action]=${action}`, 'GET')
    return data.data || []
  }

  // Create a Requirement Group — a reusable bundle of regulatory info for a
  // specific (country, number type, action). Returns the group with its id.
  async createRequirementGroup(params: { country?: string; phoneNumberType?: string; action?: string; customerReference?: string }) {
    const body = {
      country_code: params.country || 'AU',
      phone_number_type: params.phoneNumberType || 'local',
      action: params.action || 'ordering',
      customer_reference: params.customerReference,
    }
    const data = await this.req('/requirement_groups', 'POST', body)
    return data.data
  }

  // Fill a requirement group's fields. `values` is a map of
  // requirement_id → value (text) — addresses/documents use document ids.
  async updateRequirementGroup(groupId: string, regulatoryRequirements: { requirement_id: string; field_value: string }[]) {
    const data = await this.req(`/requirement_groups/${groupId}`, 'PATCH', { regulatory_requirements: regulatoryRequirements })
    return data.data
  }

  // Submit the group for validation once all fields are filled.
  async submitRequirementGroup(groupId: string) {
    const data = await this.req(`/requirement_groups/${groupId}/submit`, 'POST')
    return data.data
  }

  // Upload a document (proof of address, ID) to Telnyx; returns a document id
  // to reference in a requirement group field.
  async uploadDocument(fileBuffer: ArrayBuffer, filename: string, customerReference?: string) {
    const form = new FormData()
    form.append('file', new Blob([fileBuffer]), filename)
    if (customerReference) form.append('customer_reference', customerReference)
    const res = await fetch(`${TELNYX_BASE}/documents`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${this.apiKey}` },
      body: form as any,
    })
    if (!res.ok) throw new Error(`Telnyx document upload: ${res.status} ${await res.text()}`)
    const data = await res.json()
    return data.data // has .id
  }

  // Kick off Onfido ID verification for an AU MOBILE order. Per Telnyx docs,
  // POST to the sub number order's external_requirements with the end user's
  // name; the response contains an Onfido URL to send to the end user.
  async createOnfidoVerification(subNumberOrderId: string, firstName: string, lastName: string) {
    const data = await this.req(`/external_requirements/${subNumberOrderId}/sub_number_orders`, 'POST', {
      first_name: firstName,
      last_name: lastName,
    })
    // The verification URL is in requirement_action.value
    const action = data?.data?.requirement_action || data?.requirement_action
    return { url: action?.value || null, raw: data }
  }


  // Outbound call via Call Control (used for mobile-app / server-dialed calls later)
  async dial(params: { connection_id: string; to: string; from: string; webhook_url?: string }) {
    return this.req('/calls', 'POST', {
      connection_id: params.connection_id,
      to: params.to,
      from: params.from,
      ...(params.webhook_url ? { webhook_url: params.webhook_url } : {}),
    })
  }

  // ── Call Control commands (for inbound ring-all → voicemail) ────────────────
  // These act on a live call identified by its call_control_id.
  private cc(id: string, action: string, body?: any) {
    return this.req(`/calls/${id}/actions/${action}`, 'POST', body || {})
  }
  // Answer an inbound call so we can control it.
  async answerCall(callControlId: string, clientState?: string) {
    return this.cc(callControlId, 'answer', clientState ? { client_state: Buffer.from(clientState).toString('base64') } : {})
  }
  // Ring a WebRTC/SIP client by dialing a new leg to its SIP URI, to be bridged.
  async createChildCall(params: { connection_id: string; to: string; from: string; webhook_url?: string; timeout_secs?: number; link_to?: string }) {
    return this.req('/calls', 'POST', {
      connection_id: params.connection_id,
      to: params.to,
      from: params.from,
      timeout_secs: params.timeout_secs || 25,
      ...(params.link_to ? { link_to: params.link_to } : {}),
      ...(params.webhook_url ? { webhook_url: params.webhook_url } : {}),
    })
  }
  // Bridge two call legs (the caller and the agent who answered).
  async bridgeCalls(callControlId: string, otherCallControlId: string) {
    return this.cc(callControlId, 'bridge', { call_control_id: otherCallControlId })
  }
  // Speak text to the caller (voicemail greeting).
  async speak(callControlId: string, text: string, opts?: { voice?: string; language?: string }) {
    return this.cc(callControlId, 'speak', {
      payload: text,
      voice: opts?.voice || 'female',
      language: opts?.language || 'en-AU',
    })
  }
  // Start recording (voicemail).
  async recordStart(callControlId: string, opts?: { max_length_secs?: number }) {
    return this.cc(callControlId, 'record_start', {
      format: 'mp3', channels: 'single',
      ...(opts?.max_length_secs ? { max_length_secs: opts.max_length_secs } : {}),
      // Stop the recording when the caller stops talking / hangs up.
      trim: 'trim-silence',
    })
  }
  async hangupCall(callControlId: string) {
    return this.cc(callControlId, 'hangup')
  }
  // Play a ringback tone / start gathering — used to hold the caller while agents ring.
  async startPlayback(callControlId: string, audioUrl: string, loop = false) {
    return this.cc(callControlId, 'playback_start', { audio_url: audioUrl, loop: loop ? 'infinity' : '1' })
  }

  // ── Self-serve number provisioning ─────────────────────────────────────────

  // Search available numbers by country + type. Tries progressively looser
  // filters because AU inventory varies — a strict features filter often
  // returns "No coverage found".
  async searchAvailableNumbers(params: { country?: string; type?: 'local' | 'mobile' | 'toll_free' | 'national'; limit?: number; areaCode?: string; locality?: string }) {
    const country = params.country || 'AU'
    const limit = params.limit || 5
    const attempts: string[] = []
    const t = params.type || 'local'
    const big = Math.max(limit * 3, 20)
    if (t === 'mobile') {
      // AU mobile numbers in Telnyx inventory typically list NO features and
      // only surface with best_effort=true (confirmed in the Telnyx portal).
      // Requiring sms/voice features or best_effort=false hides them all.
      attempts.push(`filter[country_code]=${country}&filter[phone_number_type]=mobile&filter[best_effort]=true&filter[limit]=${big}`)
      attempts.push(`filter[country_code]=${country}&filter[phone_number_type]=mobile&filter[limit]=${big}`)
      attempts.push(`filter[country_code]=${country}&filter[national_destination_code]=468&filter[best_effort]=true&filter[limit]=${big}`)
      attempts.push(`filter[country_code]=${country}&filter[phone_number_type]=national&filter[best_effort]=true&filter[limit]=${big}`)
    } else {
      // Landline: AU area codes are region-specific. Map the chosen city to its
      // National Destination Code so a Melbourne business gets an 03 number
      // rather than whatever's first in inventory (e.g. a Gold Coast 07).
      const cityToNdc: Record<string, string> = {
        'Melbourne': '3', 'Hobart': '3', 'Geelong': '3',
        'Sydney': '2', 'Canberra': '2', 'Newcastle': '2', 'Wollongong': '2',
        'Brisbane': '7', 'Gold Coast': '7', 'Cairns': '7', 'Townsville': '7',
        'Perth': '8', 'Adelaide': '8', 'Darwin': '8',
      }
      const ndc = params.areaCode || (params.locality ? cityToNdc[params.locality] : undefined)
      const loc = params.locality ? `&filter[locality]=${encodeURIComponent(params.locality)}` : ''
      const ndcF = ndc ? `&filter[national_destination_code]=${ndc}` : ''
      // 1) exact locality + area code
      if (loc || ndcF) attempts.push(`filter[country_code]=${country}&filter[phone_number_type]=local${loc}${ndcF}&filter[limit]=${big}`)
      // 2) area code only (Telnyx rate-center names don't always match city names)
      if (ndcF) attempts.push(`filter[country_code]=${country}&filter[phone_number_type]=local${ndcF}&filter[limit]=${big}`)
      // 3) local + sms/voice
      attempts.push(`filter[country_code]=${country}&filter[phone_number_type]=local&filter[features]=sms,voice&filter[limit]=${big}`)
      // 4) local, no features
      attempts.push(`filter[country_code]=${country}&filter[phone_number_type]=local&filter[limit]=${big}`)
      // 5) national type
      attempts.push(`filter[country_code]=${country}&filter[phone_number_type]=national&filter[limit]=${big}`)
    }
    // final fallback: any number in the country
    attempts.push(`filter[country_code]=${country}&filter[limit]=${big}`)

    // Return only complete E.164 numbers (9 national digits for AU).
    const complete = (pn: string) => {
      if (!pn) return false
      const d = pn.replace(/^\+\d{1,3}/, '').replace(/\D/g, '')
      return d.length >= 8
    }

    for (const q of attempts) {
      try {
        const data = await this.req(`/available_phone_numbers?${q}`, 'GET')
        const list = (data.data || []).filter((n: any) => complete(n.phone_number))
        if (list.length > 0) return list
      } catch (e: any) {
        if (!/coverage|not found|no results/i.test(e.message || '')) {
          if (/authenticate|unauthorized|invalid api|forbidden/i.test(e.message || '')) throw e
        }
      }
    }
    return []
  }

  // Check a specific number is currently available to buy. Telnyx rejects orders
  // for numbers it hasn't seen in a recent availability search ("We don't
  // recognize the number(s)... Did you first search for the number(s)?"), and a
  // number found minutes ago may already be taken by someone else.
  async isNumberAvailable(phoneNumber: string): Promise<boolean> {
    const digits = phoneNumber.replace(/\D/g, '')
    // Search by the exact number across the shapes Telnyx accepts.
    const queries = [
      `filter[phone_number][starts_with]=${encodeURIComponent(phoneNumber)}&filter[limit]=5`,
      `filter[phone_number][contains]=${digits.slice(-8)}&filter[limit]=10`,
    ]
    for (const q of queries) {
      try {
        const data = await this.req(`/available_phone_numbers?${q}`, 'GET')
        const list = data.data || []
        if (list.some((n: any) => (n.phone_number || '').replace(/\D/g, '') === digits)) return true
      } catch { /* try the next shape */ }
    }
    return false
  }

  // Order a specific number. Re-validates availability first so we surface a
  // useful message instead of Telnyx's cryptic "did you search first?" error.
  async orderNumber(phoneNumber: string, opts?: { messaging_profile_id?: string; connection_id?: string }) {
    const body: any = { phone_numbers: [{ phone_number: phoneNumber }] }
    if (opts?.messaging_profile_id) body.messaging_profile_id = opts.messaging_profile_id
    if (opts?.connection_id) body.connection_id = opts.connection_id
    return this.req('/number_orders', 'POST', body)
  }

  // Order the wanted number, falling back to an equivalent one if it's gone.
  // Returns { order, phoneNumber, substituted }.
  async orderNumberWithFallback(
    wanted: string,
    searchParams: { country?: string; type?: 'local' | 'mobile' | 'toll_free' | 'national'; areaCode?: string; locality?: string },
    opts?: { messaging_profile_id?: string; connection_id?: string }
  ): Promise<{ order: any; phoneNumber: string; substituted: boolean }> {
    // 1) Re-search to (a) satisfy Telnyx's "search before order" rule and
    //    (b) confirm nobody took it while the customer was paying.
    const stillFree = await this.isNumberAvailable(wanted)
    if (stillFree) {
      try {
        const order = await this.orderNumber(wanted, opts)
        return { order, phoneNumber: wanted, substituted: false }
      } catch (e: any) {
        // Fall through to a substitute rather than failing a paid customer.
        console.warn('[telnyx] wanted number failed to order, substituting:', e.message)
      }
    }

    // 2) Pick a fresh number of the same kind/region.
    const candidates = await this.searchAvailableNumbers({ ...searchParams, limit: 5 })
    for (const c of candidates) {
      const pn = c.phone_number
      if (!pn || pn === wanted) continue
      try {
        const order = await this.orderNumber(pn, opts)
        return { order, phoneNumber: pn, substituted: true }
      } catch { /* try the next candidate */ }
    }

    throw new Error('That number is no longer available, and no replacement could be provisioned. Please contact support — you have not been charged for a number.')
  }

  // Configure a purchased number (assign messaging profile + voice connection)
  async configureNumber(phoneNumberId: string, opts: { messaging_profile_id?: string; connection_id?: string }) {
    return this.req(`/phone_numbers/${phoneNumberId}`, 'PATCH', {
      ...(opts.messaging_profile_id ? { messaging_profile_id: opts.messaging_profile_id } : {}),
      ...(opts.connection_id ? { connection_id: opts.connection_id } : {}),
    })
  }

  // Look up the phone_number record id (needed to configure it after ordering)
  async getPhoneNumberId(phoneNumber: string) {
    const data = await this.req(`/phone_numbers?filter[phone_number]=${encodeURIComponent(phoneNumber)}`, 'GET')
    return data.data?.[0]?.id || null
  }

  // The full phone number record — including connection_id, so we can tell
  // whether inbound calls are actually routed to our WebRTC connection.
  // (If they're not, Telnyx has nowhere to ring and the caller hears engaged.)
  async getNumber(phoneNumber: string) {
    const data = await this.req(`/phone_numbers?filter[phone_number]=${encodeURIComponent(phoneNumber)}`, 'GET')
    return data.data?.[0] || null
  }
}

// Normalize a phone number to E.164, defaulting to Australia (+61).
export function toE164(raw: string, defaultCountry: 'AU' = 'AU'): string | null {
  if (!raw) return null
  let s = raw.replace(/[^\d+]/g, '')
  if (s.startsWith('+')) return s
  // Australian normalisation: 04xxxxxxxx -> +614xxxxxxxx, 0x... -> +61x...
  if (defaultCountry === 'AU') {
    if (s.startsWith('0')) return '+61' + s.slice(1)
    if (s.startsWith('61')) return '+' + s
    if (s.length === 9) return '+61' + s // missing leading 0
  }
  return '+' + s
}
