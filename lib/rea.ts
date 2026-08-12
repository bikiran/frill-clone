import crypto from 'crypto'

// Colvy's OWN realestate.com.au Partner Platform integration. Agencies never
// enter REA credentials — Colvy authenticates to REA with ITS partner
// credentials (system-to-system, OAuth 2.0 Client Credentials) and, on the
// agency's authorization, manages an EnquiryCreated webhook subscription and
// pulls full lead detail via the Leads API on their behalf.
//
// Server-only. Configure in the environment (the defaults below match REA's
// confirmed Partner Platform values, so only the credentials are required):
//   REA_CLIENT_ID, REA_CLIENT_SECRET   — Colvy's REA Partner Platform app
//   REA_TOKEN_URL                       — OAuth2 token endpoint (client_credentials)
//   REA_API_BASE                        — REA API base (Leads / webhook subscriptions)
//   REA_SCOPES                          — space-separated scopes the app is granted
//
// Inbound webhooks are verified with REA's Ed25519 signatures — the public keys
// are fetched from GET /webhooks/v1/signing; there is NO shared signing secret.
// Endpoint paths are overridable via env so they can be corrected without
// touching callers.

const TOKEN_URL = process.env.REA_TOKEN_URL || 'https://api.realestate.com.au/oauth/token'
const API_BASE = (process.env.REA_API_BASE || 'https://api.realestate.com.au').replace(/\/+$/, '')
const SUBSCRIPTIONS_PATH = process.env.REA_SUBSCRIPTIONS_PATH || '/webhooks/v1/subscriptions'
const LEADS_PATH = process.env.REA_LEADS_PATH || '/lead/v1/enquiries'
const SIGNING_PATH = process.env.REA_SIGNING_PATH || '/webhooks/v1/signing'

export const REA_MASTER = {
  clientId: process.env.REA_CLIENT_ID || '',
  clientSecret: process.env.REA_CLIENT_SECRET || '',
  scopes: process.env.REA_SCOPES || 'lead:enquiries:read webhooks:subscriptions:write',
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
  // Client id + secret go in the HTTP Basic header; the body carries only the
  // grant type. Scopes are granted to the credentials by REA, not requested
  // per-call, so they are NOT sent in the token body.
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials' }).toString(),
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

// ── Leads / Enquiries API ───────────────────────────────────────────────────
// The EnquiryCreated webhook carries an enquiry reference (and often a
// `resourceUrl`); the full buyer + listing detail is fetched here with the
// master token, from /lead/v1/enquiries/{id}.
export async function getLead(leadId: string): Promise<any> {
  if (!leadId) throw new Error('missing leadId')
  return reaReq(`${LEADS_PATH}/${encodeURIComponent(leadId)}`, 'GET')
}

// Fetch the enquiry straight from the event's `resourceUrl`, when present. The
// URL is confined to the REA API host so a spoofed payload can't point us at an
// arbitrary server; it's then fetched with the master token like any other call.
export async function getEnquiryByUrl(resourceUrl: string): Promise<any> {
  if (!resourceUrl) throw new Error('missing resourceUrl')
  const u = new URL(resourceUrl)
  const apiHost = new URL(API_BASE).host
  if (u.host !== apiHost) throw new Error(`resourceUrl host ${u.host} is not the REA API host`)
  return reaReq(u.pathname + u.search, 'GET')
}

// ── Inbound webhook signature verification (Ed25519) ─────────────────────────
// REA signs each webhook delivery with Ed25519 over `timestamp + raw body` and
// sends the signature in `x-rea-signature`. The verifying public keys are
// published at GET /webhooks/v1/signing (keys rotate, so we fetch + cache them
// rather than holding a static secret).

interface ReaSigningKey { id: string | null; key: crypto.KeyObject }

// SPKI DER prefix for a raw 32-byte Ed25519 public key (lets us accept keys
// published as raw bytes as well as full DER/PEM/JWK).
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex')

let signingKeysCache: { keys: ReaSigningKey[]; exp: number } | null = null

function toEd25519PublicKey(material: any): crypto.KeyObject | null {
  try {
    if (!material) return null
    if (typeof material === 'object' && (material.kty || material.crv)) {
      return crypto.createPublicKey({ key: material, format: 'jwk' })   // JWK (OKP/Ed25519)
    }
    const s = String(material).trim()
    if (s.startsWith('-----BEGIN')) return crypto.createPublicKey(s)     // PEM
    const buf = Buffer.from(s.replace(/\s+/g, ''), 'base64')
    if (buf.length === 32) {                                             // raw 32-byte key
      return crypto.createPublicKey({ key: Buffer.concat([ED25519_SPKI_PREFIX, buf]), format: 'der', type: 'spki' })
    }
    return crypto.createPublicKey({ key: buf, format: 'der', type: 'spki' })  // SPKI DER
  } catch { return null }
}

function parseSigningKey(k: any): ReaSigningKey | null {
  if (k == null) return null
  if (typeof k === 'string') { const key = toEd25519PublicKey(k); return key ? { id: null, key } : null }
  if (typeof k === 'object') {
    const id = k.id ?? k.kid ?? k.keyId ?? null
    const source = (k.kty || k.crv) ? k : (k.publicKey ?? k.key ?? k.value ?? k.pem ?? k.publicKeyBase64 ?? null)
    const key = toEd25519PublicKey(source)
    return key ? { id: id != null ? String(id) : null, key } : null
  }
  return null
}

export async function getSigningKeys(force = false): Promise<ReaSigningKey[]> {
  const now = Math.floor(Date.now() / 1000)
  if (!force && signingKeysCache && signingKeysCache.exp > now) return signingKeysCache.keys
  const data = await reaReq(SIGNING_PATH, 'GET')
  const raw: any[] = Array.isArray(data) ? data
    : Array.isArray(data?.keys) ? data.keys
    : Array.isArray(data?.publicKeys) ? data.publicKeys
    : data ? [data] : []
  const keys = raw.map(parseSigningKey).filter(Boolean) as ReaSigningKey[]
  // Cache only a non-empty set; keep retrying if a fetch came back empty/garbled.
  if (keys.length) signingKeysCache = { keys, exp: now + 3600 }
  return keys
}

function decodeSignature(v: string): Buffer | null {
  const s = v.trim()
  if (/^[0-9a-f]+$/i.test(s) && s.length % 2 === 0) {          // hex
    const b = Buffer.from(s, 'hex'); if (b.length === 64) return b
  }
  try {                                                         // base64 / base64url
    const b = Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
    if (b.length) return b
  } catch {}
  return null
}

interface ParsedSignature { sig: Buffer | null; keyId: string | null; timestamp: string | null }

// The `x-rea-signature` header is read tolerantly: a bare signature, or
// comma-separated `t=…,k=…,s=…` pairs. `timestamp` falls back to a header value.
function parseSignatureHeader(header0: string | null, tsFallback?: string | null): ParsedSignature | null {
  const header = (header0 || '').trim()
  if (!header) return null
  let sigValue = header
  let keyId: string | null = null
  let timestamp = tsFallback || null
  if (header.includes('=') && /\b(s|v1|sig|signature)=/.test(header)) {
    const parts: Record<string, string> = {}
    for (const p of header.split(',')) { const i = p.indexOf('='); if (i > 0) parts[p.slice(0, i).trim()] = p.slice(i + 1).trim() }
    sigValue = parts.s || parts.v1 || parts.sig || parts.signature || sigValue
    keyId = parts.k || parts.kid || parts.keyId || keyId
    timestamp = parts.t || parts.timestamp || timestamp
  } else {
    sigValue = sigValue.replace(/^(ed25519=|v1=)/i, '')
  }
  const sig = decodeSignature(sigValue)
  return { sig: sig && sig.length === 64 ? sig : null, keyId, timestamp }
}

// Verify an already-parsed signature against a set of Ed25519 keys. Pure (no
// network) so it's shared by the live check and the self-test.
function verifyAgainstKeys(rawBody: string, parsed: ParsedSignature, keys: ReaSigningKey[]): { ok: boolean; reason?: string } {
  if (!parsed.sig) return { ok: false, reason: 'unparseable Ed25519 signature' }
  // REA concatenates timestamp + raw body. Try the plain concatenation first,
  // then a dotted variant, so a minor delimiter difference doesn't reject a
  // genuinely-signed request (each candidate still requires a valid signature).
  const messages = [
    Buffer.from(`${parsed.timestamp ?? ''}${rawBody}`, 'utf8'),
    Buffer.from(`${parsed.timestamp ?? ''}.${rawBody}`, 'utf8'),
  ]
  const candidates = parsed.keyId ? keys.filter(k => k.id === parsed.keyId || k.id == null) : keys
  for (const k of (candidates.length ? candidates : keys)) {
    for (const msg of messages) {
      try { if (crypto.verify(null, msg, k.key, parsed.sig)) return { ok: true } } catch {}
    }
  }
  return { ok: false, reason: 'signature did not match any REA signing key' }
}

// Verify the `x-rea-signature` header over `timestamp + raw body`, fetching
// REA's current public keys.
export async function verifyWebhookSignature(params: {
  rawBody: string
  signatureHeader: string | null
  timestamp?: string | null
}): Promise<{ ok: boolean; reason?: string }> {
  const parsed = parseSignatureHeader(params.signatureHeader, params.timestamp)
  if (!parsed) return { ok: false, reason: 'missing x-rea-signature header' }
  if (!parsed.sig) return { ok: false, reason: 'unparseable Ed25519 signature' }
  let keys: ReaSigningKey[]
  try { keys = await getSigningKeys() } catch (e: any) { return { ok: false, reason: `could not fetch signing keys: ${e?.message || e}` } }
  if (!keys.length) return { ok: false, reason: 'no signing keys published by REA' }
  return verifyAgainstKeys(params.rawBody, parsed, keys)
}

// ── Diagnostics ──────────────────────────────────────────────────────────────

// Non-secret snapshot of the resolved REA configuration, for the super-admin
// diagnostic. The client secret is never included (only whether it's set), and
// the client id is masked.
export function reaConfigSummary() {
  const mask = (s: string) => (s ? `${s.slice(0, 8)}…(${s.length})` : '')
  return {
    tokenUrl: TOKEN_URL,
    apiBase: API_BASE,
    subscriptionsPath: SUBSCRIPTIONS_PATH,
    leadsPath: LEADS_PATH,
    signingPath: SIGNING_PATH,
    scopes: REA_MASTER.scopes,
    clientId: mask(REA_MASTER.clientId),
    clientSecretSet: !!REA_MASTER.clientSecret,
  }
}

// Exercise the REAL parse + verify code path end-to-end with an ephemeral key
// (no network, no REA): a valid signature must pass and a tampered body must
// fail. Proves the verifier itself is sound independent of REA's live keys.
export function signatureSelfTest(): { ok: boolean; detail: string } {
  try {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519')
    const raw32 = publicKey.export({ type: 'spki', format: 'der' }).subarray(-32).toString('base64')
    const key = parseSigningKey(raw32)
    if (!key) return { ok: false, detail: 'could not build a test key from a raw Ed25519 public key' }
    const ts = '1700000000', body = '{"selfTest":true}'
    const sigB64 = crypto.sign(null, Buffer.from(ts + body, 'utf8'), privateKey).toString('base64')
    const parsed = parseSignatureHeader(sigB64, ts)
    if (!parsed) return { ok: false, detail: 'signature header failed to parse' }
    const good = verifyAgainstKeys(body, parsed, [key])
    const tampered = verifyAgainstKeys('{"selfTest":false}', parsed, [key])
    const ok = good.ok && !tampered.ok
    return { ok, detail: ok
      ? 'Ed25519 verify path works — valid signature accepted, tampered body rejected'
      : `unexpected result (valid=${good.ok}, tamperedAccepted=${tampered.ok})` }
  } catch (e: any) {
    return { ok: false, detail: e?.message || 'self-test threw' }
  }
}
