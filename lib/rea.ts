// Colvy's OWN realestate.com.au Partner Platform integration. Agencies never
// enter REA credentials — Colvy authenticates to REA with ITS partner
// credentials (system-to-system, OAuth 2.0 Client Credentials) and, on the
// agency's authorization, manages an EnquiryCreated webhook subscription and
// pulls full lead detail via the Leads API on their behalf.
//
// Server-only. Configure in the environment:
//   REA_CLIENT_ID, REA_CLIENT_SECRET   — Colvy's REA Partner Platform app
//   REA_TOKEN_URL                       — OAuth2 token endpoint (client_credentials)
//   REA_API_BASE                        — REA API base (Leads / webhook subscriptions)
//   REA_SCOPES                          — space-separated scopes to request
//   REA_WEBHOOK_SIGNING_SECRET          — (optional) verify inbound webhook signatures
//
// The exact REA endpoint paths live behind the partner portal; they're kept in
// one place here and overridable via env so they can be corrected without
// touching callers.

const TOKEN_URL = process.env.REA_TOKEN_URL || 'https://api.realestate.com.au/oauth/token'
const API_BASE = (process.env.REA_API_BASE || 'https://api.realestate.com.au').replace(/\/+$/, '')
const SUBSCRIPTIONS_PATH = process.env.REA_SUBSCRIPTIONS_PATH || '/webhooks/v1/subscriptions'
const LEADS_PATH = process.env.REA_LEADS_PATH || '/listings/enquiries/v1/leads'

export const REA_MASTER = {
  clientId: process.env.REA_CLIENT_ID || '',
  clientSecret: process.env.REA_CLIENT_SECRET || '',
  scopes: process.env.REA_SCOPES || 'enquiries:read webhooks:manage',
}

export function reaConfigured(): boolean {
  return !!(REA_MASTER.clientId && REA_MASTER.clientSecret)
}

// ── OAuth 2.0 Client Credentials ────────────────────────────────────────────
// One app-level token shared across companies (system-to-system). Cached in
// memory until shortly before expiry.
let cached: { token: string; exp: number } | null = null

export async function getAccessToken(): Promise<string> {
  if (!reaConfigured()) throw new Error('REA partner credentials are not configured on the server')
  const now = Math.floor(Date.now() / 1000)
  if (cached && cached.exp - 60 > now) return cached.token

  const basic = Buffer.from(`${REA_MASTER.clientId}:${REA_MASTER.clientSecret}`).toString('base64')
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', scope: REA_MASTER.scopes }).toString(),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.access_token) throw new Error(`REA token request failed (${res.status}): ${data.error_description || data.error || 'no access_token'}`)
  cached = { token: data.access_token, exp: now + (Number(data.expires_in) || 3600) }
  return cached.token
}

// Authenticated request against the REA API with the master token.
export async function reaReq(path: string, method = 'GET', body?: any): Promise<any> {
  const token = await getAccessToken()
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const text = await res.text()
  const data = text ? (() => { try { return JSON.parse(text) } catch { return text } })() : null
  if (!res.ok) throw new Error(`REA ${method} ${path} failed (${res.status}): ${typeof data === 'string' ? data.slice(0, 300) : JSON.stringify(data).slice(0, 300)}`)
  return data
}

// ── Webhook subscriptions (EnquiryCreated) ──────────────────────────────────
// Create an EnquiryCreated subscription for one agency, delivered to our
// per-company callback URL. Returns the subscription id + any granted scopes.
export async function createEnquirySubscription(params: { agencyId?: string; officeId?: string; callbackUrl: string }): Promise<{ id: string | null; scopes: string[] }> {
  const payload: any = {
    eventType: 'EnquiryCreated',
    callbackUrl: params.callbackUrl,
  }
  if (params.agencyId) payload.agencyId = params.agencyId
  if (params.officeId) payload.officeId = params.officeId
  const data = await reaReq(SUBSCRIPTIONS_PATH, 'POST', payload)
  const scopes = Array.isArray(data?.scopes) ? data.scopes : (typeof data?.scope === 'string' ? data.scope.split(/\s+/).filter(Boolean) : REA_MASTER.scopes.split(/\s+/).filter(Boolean))
  return { id: data?.id || data?.subscriptionId || null, scopes }
}

export async function deleteSubscription(id: string): Promise<void> {
  if (!id) return
  await reaReq(`${SUBSCRIPTIONS_PATH}/${encodeURIComponent(id)}`, 'DELETE')
}

// ── Leads API ───────────────────────────────────────────────────────────────
// The EnquiryCreated webhook carries a lead reference; the full buyer + listing
// detail is fetched here with the master token.
export async function getLead(leadId: string): Promise<any> {
  if (!leadId) throw new Error('missing leadId')
  return reaReq(`${LEADS_PATH}/${encodeURIComponent(leadId)}`, 'GET')
}
