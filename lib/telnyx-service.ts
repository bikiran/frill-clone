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
