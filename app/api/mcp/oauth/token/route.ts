import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { adminDb, cors, issueOAuthTokens, normaliseScope, sha256 } from '@/lib/mcp/auth'

export const dynamic = 'force-dynamic'

// OAuth 2.1 token endpoint (public clients + PKCE).
//   grant_type=authorization_code: code, redirect_uri, client_id, code_verifier
//   grant_type=refresh_token:      refresh_token, client_id (rotates the pair)
const err = (error: string, description: string, status = 400) =>
  NextResponse.json({ error, error_description: description }, { status, headers: { ...cors, 'Cache-Control': 'no-store' } })

async function params(req: NextRequest): Promise<Record<string, string>> {
  const type = req.headers.get('content-type') || ''
  if (type.includes('application/json')) {
    const j = await req.json().catch(() => ({}))
    return Object.fromEntries(Object.entries(j || {}).map(([k, v]) => [k, String(v ?? '')]))
  }
  const text = await req.text().catch(() => '')
  return Object.fromEntries(new URLSearchParams(text))
}

export async function POST(req: NextRequest) {
  const db = adminDb()
  const p = await params(req)
  const ok = (body: any) => NextResponse.json(body, { headers: { ...cors, 'Cache-Control': 'no-store', Pragma: 'no-cache' } })

  if (p.grant_type === 'authorization_code') {
    if (!p.code || !p.code_verifier || !p.client_id || !p.redirect_uri) return err('invalid_request', 'code, code_verifier, client_id and redirect_uri are required.')
    // Single use: claim the code atomically.
    const { data: rows } = await db.from('mcp_auth_codes').update({ used_at: new Date().toISOString() })
      .eq('code_hash', sha256(p.code)).is('used_at', null).select('*')
    const c = rows?.[0]
    if (!c) return err('invalid_grant', 'That code is unknown or was already used.')
    if (Date.parse(c.expires_at) < Date.now()) return err('invalid_grant', 'That code has expired. Start again.')
    if (c.client_id !== p.client_id || c.redirect_uri !== p.redirect_uri) return err('invalid_grant', 'The code was issued to a different app or address.')
    const challenge = crypto.createHash('sha256').update(p.code_verifier).digest('base64url')
    if (challenge !== c.code_challenge) return err('invalid_grant', 'PKCE verification failed.')
    const { data: client } = await db.from('mcp_oauth_clients').select('client_name').eq('client_id', c.client_id).maybeSingle()
    return ok(await issueOAuthTokens(db, { companyId: c.company_id, userId: c.user_id, clientId: c.client_id, name: client?.client_name || null, scope: normaliseScope(c.scope) }))
  }

  if (p.grant_type === 'refresh_token') {
    if (!p.refresh_token) return err('invalid_request', 'refresh_token is required.')
    // Rotation: the old pair is revoked the moment it's used.
    const { data: rows } = await db.from('mcp_tokens').update({ revoked_at: new Date().toISOString() })
      .eq('refresh_hash', sha256(p.refresh_token)).is('revoked_at', null).select('*')
    const t = rows?.[0]
    if (!t) return err('invalid_grant', 'That refresh token is unknown or was revoked.')
    if (t.refresh_expires_at && Date.parse(t.refresh_expires_at) < Date.now()) return err('invalid_grant', 'That refresh token has expired. Connect again.')
    if (p.client_id && t.client_id && p.client_id !== t.client_id) return err('invalid_grant', 'The refresh token belongs to a different app.')
    // Never widen access on refresh.
    const scope = p.scope ? (normaliseScope(p.scope) === 'write' && t.scope === 'write' ? 'write' : 'read') : normaliseScope(t.scope)
    return ok(await issueOAuthTokens(db, { companyId: t.company_id, userId: t.user_id, clientId: t.client_id, name: t.name, scope }))
  }

  return err('unsupported_grant_type', 'Use authorization_code or refresh_token.')
}
export async function OPTIONS() { return new NextResponse(null, { status: 204, headers: cors }) }
