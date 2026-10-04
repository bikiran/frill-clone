// Colvy MCP — tokens and the origin helpers (server only).
//
// Two kinds of credential reach /api/mcp as "Authorization: Bearer …":
//   colvy_sk_…  an API key made on the Colvy MCP page (for Claude Code,
//               Cursor, scripts). Never expires until revoked.
//   colvy_at_…  an OAuth access token, issued to an app (Claude, ChatGPT…)
//               after the person approved it. 1 hour, renewed with a
//               rotating refresh token (colvy_rt_…, 60 days).
// Only SHA-256 hashes are stored; the token itself is shown once.

import crypto from 'crypto'
import type { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const adminDb = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export type Scope = 'read' | 'write'
export const ACCESS_TTL_S = 60 * 60
export const REFRESH_TTL_S = 60 * 24 * 3600
export const CODE_TTL_S = 10 * 60

export const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex')
export const randomToken = (prefix: string) => `${prefix}${crypto.randomBytes(32).toString('base64url')}`
export const normaliseScope = (s: any): Scope => String(s || '').split(/[\s,]+/).includes('write') ? 'write' : 'read'

/** The public origin this request came in on (https://roxyaquarium.colvy.com). */
export function originOf(req: NextRequest): string {
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || ''
  if (!host) return (process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com').replace(/\/$/, '')
  const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)
  const proto = local ? (req.headers.get('x-forwarded-proto') || 'http') : 'https'
  return `${proto}://${host}`
}
export const mcpUrl = (req: NextRequest) => `${originOf(req)}/api/mcp`
export const resourceMetadataUrl = (req: NextRequest) => `${originOf(req)}/.well-known/oauth-protected-resource`

export type McpAuth = { tokenId: string; companyId: string; userId: string; scope: Scope; kind: 'api_key' | 'oauth'; name: string | null }

/** Check a bearer token. Null when missing, unknown, revoked or expired. */
export async function verifyBearer(db: any, req: NextRequest): Promise<McpAuth | null> {
  const raw = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (!/^colvy_(sk|at)_[A-Za-z0-9_-]{20,}$/.test(raw)) return null
  const { data: t } = await db.from('mcp_tokens').select('id, company_id, user_id, scope, kind, name, expires_at, revoked_at, last_used_at')
    .eq('token_hash', sha256(raw)).maybeSingle()
  if (!t || t.revoked_at) return null
  if (t.expires_at && Date.parse(t.expires_at) < Date.now()) return null
  // Note use, at most once a minute.
  if (!t.last_used_at || Date.now() - Date.parse(t.last_used_at) > 60_000) {
    db.from('mcp_tokens').update({ last_used_at: new Date().toISOString() }).eq('id', t.id).then(() => {}, () => {})
  }
  return { tokenId: t.id, companyId: t.company_id, userId: t.user_id, scope: normaliseScope(t.scope), kind: t.kind, name: t.name || null }
}

/** The person's role in the business, from the verified user id (never from the request). */
export async function roleIn(db: any, companyId: string, userId: string): Promise<string | null> {
  const { data: co } = await db.from('companies').select('owner_id').eq('id', companyId).maybeSingle()
  if (!co) return null
  if (co.owner_id === userId) return 'owner'
  const { data: tm } = await db.from('team_members').select('role').eq('company_id', companyId).eq('user_id', userId).limit(1)
  return tm?.[0]?.role || null
}
export const canWrite = (role: string | null) => ['owner', 'admin', 'editor'].includes(String(role))

/** Mint an OAuth access + refresh token pair. */
export async function issueOAuthTokens(db: any, g: { companyId: string; userId: string; clientId: string; name: string | null; scope: Scope }) {
  const access = randomToken('colvy_at_')
  const refresh = randomToken('colvy_rt_')
  const now = Date.now()
  const { error } = await db.from('mcp_tokens').insert({
    company_id: g.companyId, user_id: g.userId, kind: 'oauth', name: g.name, client_id: g.clientId,
    token_hash: sha256(access), token_last4: access.slice(-4), refresh_hash: sha256(refresh), scope: g.scope,
    expires_at: new Date(now + ACCESS_TTL_S * 1000).toISOString(),
    refresh_expires_at: new Date(now + REFRESH_TTL_S * 1000).toISOString(),
  })
  if (error) throw new Error('Could not issue a token')
  return { access_token: access, token_type: 'Bearer', expires_in: ACCESS_TTL_S, refresh_token: refresh, scope: g.scope }
}

/** Redirect URIs an app may register: https anywhere, http only on this machine, or an app's own scheme. */
export function allowedRedirect(uri: string): boolean {
  let u: URL
  try { u = new URL(uri) } catch { return false }
  if (u.hash) return false
  if (u.protocol === 'https:') return true
  if (u.protocol === 'http:') return ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)
  // Native apps (cursor://…, vscode://…) — never script or local-file schemes.
  return /^[a-z][a-z0-9+.-]*:$/.test(u.protocol) && !['javascript:', 'data:', 'vbscript:', 'file:', 'blob:', 'about:'].includes(u.protocol)
}

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept, Mcp-Session-Id, MCP-Protocol-Version, Last-Event-ID',
  'Access-Control-Expose-Headers': 'WWW-Authenticate, Mcp-Session-Id, MCP-Protocol-Version',
  'Access-Control-Max-Age': '86400',
}
