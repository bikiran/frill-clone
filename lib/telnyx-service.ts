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

  // Outbound call via Call Control (used for mobile-app / server-dialed calls later)
  async dial(params: { connection_id: string; to: string; from: string; webhook_url?: string }) {
    return this.req('/calls', 'POST', {
      connection_id: params.connection_id,
      to: params.to,
      from: params.from,
      ...(params.webhook_url ? { webhook_url: params.webhook_url } : {}),
    })
  }

  // ── Self-serve number provisioning ─────────────────────────────────────────

  // Search available numbers by country + type. Tries progressively looser
  // filters because AU inventory varies — a strict features filter often
  // returns "No coverage found".
  async searchAvailableNumbers(params: { country?: string; type?: 'local' | 'mobile' | 'toll_free' | 'national'; limit?: number; areaCode?: string }) {
    const country = params.country || 'AU'
    const limit = params.limit || 5
    const attempts: string[] = []
    const t = params.type || 'local'
    // Request extra results (we filter to complete numbers upstream) and disable
    // best-effort so Telnyx returns actual dial-able numbers, not partial ranges
    // (the cause of "+61 468 --- ---" blanks for AU mobile).
    const big = Math.max(limit * 3, 20)
    if (t === 'mobile') {
      // AU mobiles are classified differently across Telnyx inventory — try
      // mobile, then national, then national with a 04 prefix.
      attempts.push(`filter[country_code]=${country}&filter[phone_number_type]=mobile&filter[features]=sms,voice&filter[best_effort]=false&filter[limit]=${big}`)
      attempts.push(`filter[country_code]=${country}&filter[phone_number_type]=mobile&filter[best_effort]=false&filter[limit]=${big}`)
      attempts.push(`filter[country_code]=${country}&filter[phone_number_type]=national&filter[national_destination_code]=4&filter[limit]=${big}`)
      attempts.push(`filter[country_code]=${country}&filter[phone_number_type]=mobile&filter[limit]=${big}`)
    } else {
      // 1) requested type + sms/voice features
      attempts.push(`filter[country_code]=${country}&filter[phone_number_type]=${t}&filter[features]=sms,voice&filter[limit]=${big}`)
      // 2) requested type, voice only (many AU landlines lack SMS)
      attempts.push(`filter[country_code]=${country}&filter[phone_number_type]=${t}&filter[features]=voice&filter[limit]=${big}`)
      // 3) requested type, no feature filter
      attempts.push(`filter[country_code]=${country}&filter[phone_number_type]=${t}&filter[limit]=${big}`)
      // 4) national type (AU numbers are often classified national), no features
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

  // Order a specific number
  async orderNumber(phoneNumber: string, opts?: { messaging_profile_id?: string; connection_id?: string }) {
    const body: any = { phone_numbers: [{ phone_number: phoneNumber }] }
    if (opts?.messaging_profile_id) body.messaging_profile_id = opts.messaging_profile_id
    if (opts?.connection_id) body.connection_id = opts.connection_id
    return this.req('/number_orders', 'POST', body)
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
