import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { adminDb, allowedRedirect, cors } from '@/lib/mcp/auth'

export const dynamic = 'force-dynamic'

// OAuth 2.0 Dynamic Client Registration (RFC 7591). Claude, ChatGPT, Cursor
// and other MCP clients register themselves here before sending the person
// to the Colvy sign-in/consent page. Public clients only (PKCE, no secret).
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null)
  const bad = (d: string) => NextResponse.json({ error: 'invalid_client_metadata', error_description: d }, { status: 400, headers: cors })
  if (!b || typeof b !== 'object') return bad('Send the client metadata as JSON.')
  const uris: string[] = Array.isArray(b.redirect_uris) ? b.redirect_uris.map(String) : []
  if (!uris.length || uris.length > 10) return bad('Give between 1 and 10 redirect_uris.')
  if (uris.some(u => u.length > 500 || !allowedRedirect(u))) return bad('Redirect URIs must be https, http on localhost, or an app scheme.')
  const clientId = `mcp_${crypto.randomBytes(16).toString('hex')}`
  const name = String(b.client_name || '').trim().slice(0, 100) || 'An AI app'
  const uri = typeof b.client_uri === 'string' && /^https:\/\//.test(b.client_uri) ? b.client_uri.slice(0, 300) : null
  const { error } = await adminDb().from('mcp_oauth_clients').insert({ client_id: clientId, client_name: name, client_uri: uri, redirect_uris: uris })
  if (error) return NextResponse.json({ error: 'server_error', error_description: 'Colvy MCP isn’t set up yet (migration V331).' }, { status: 500, headers: cors })
  return NextResponse.json({
    client_id: clientId, client_id_issued_at: Math.floor(Date.now() / 1000), client_name: name,
    ...(uri ? { client_uri: uri } : {}), redirect_uris: uris,
    token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], scope: 'read write',
  }, { status: 201, headers: cors })
}
export async function OPTIONS() { return new NextResponse(null, { status: 204, headers: cors }) }
