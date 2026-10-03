import { NextRequest, NextResponse } from 'next/server'
import { adminDb, CODE_TTL_S, canWrite, normaliseScope, originOf, randomToken, roleIn, sha256 } from '@/lib/mcp/auth'

export const dynamic = 'force-dynamic'

// Backs the consent page (/oauth/authorize). The page is signed in with the
// person's normal Colvy session and sends it as a Bearer token.
//   POST { action: 'info', client_id, redirect_uri }  → the app + your workspaces
//   POST { action: 'approve' | 'deny', client_id, redirect_uri, state,
//          code_challenge, code_challenge_method, scope, resource, companyId }
//        → { redirect } with a one-time code (or error=access_denied)

const PLATFORM_SUPER_ADMIN = 'bishalstha76@gmail.com'

async function workspaces(db: any, user: any) {
  const out = new Map<string, { id: string; name: string; slug: string | null; role: string }>()
  const { data: own } = await db.from('companies').select('id, name, slug').eq('owner_id', user.id)
  for (const c of own || []) out.set(c.id, { id: c.id, name: c.name, slug: c.slug, role: 'owner' })
  const { data: tm } = await db.from('team_members').select('company_id, role').eq('user_id', user.id)
  const ids = (tm || []).map((t: any) => t.company_id).filter((id: string) => id && !out.has(id))
  if (ids.length) {
    const { data: cos } = await db.from('companies').select('id, name, slug').in('id', ids)
    for (const c of cos || []) out.set(c.id, { id: c.id, name: c.name, slug: c.slug, role: (tm || []).find((t: any) => t.company_id === c.id)?.role || 'viewer' })
  }
  return Array.from(out.values())
}

export async function POST(req: NextRequest) {
  const db = adminDb()
  const b = await req.json().catch(() => ({}))
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
  const { data: ud } = token ? await db.auth.getUser(token) : { data: null as any }
  const user = ud?.user
  if (!user) return NextResponse.json({ error: 'Please sign in to Colvy first.' }, { status: 401 })

  const { data: client } = await db.from('mcp_oauth_clients').select('client_id, client_name, client_uri, redirect_uris').eq('client_id', String(b.client_id || '')).maybeSingle()
  const redirect = String(b.redirect_uri || '')
  if (!client) return NextResponse.json({ error: 'This app isn’t registered with Colvy. Start the connection again from the app.' }, { status: 400 })
  if (!(client.redirect_uris || []).includes(redirect)) return NextResponse.json({ error: 'The app sent a return address it didn’t register. For your safety, Colvy stopped here.' }, { status: 400 })
  let redirectHost = redirect
  try { const u = new URL(redirect); redirectHost = u.host || u.protocol.replace(':', '') } catch {}

  if (b.action === 'info') {
    return NextResponse.json({ client: { name: client.client_name, uri: client.client_uri }, redirectHost, user: { email: user.email }, workspaces: await workspaces(db, user) })
  }

  const back = (params: Record<string, string>) => {
    const u = new URL(redirect)
    for (const [k, v] of Object.entries(params)) if (v) u.searchParams.set(k, v)
    if (b.state) u.searchParams.set('state', String(b.state))
    u.searchParams.set('iss', originOf(req))
    return NextResponse.json({ redirect: u.toString() })
  }
  if (b.action === 'deny') return back({ error: 'access_denied', error_description: 'The person declined.' })
  if (b.action !== 'approve') return NextResponse.json({ error: 'Unknown action' }, { status: 400 })

  if (String(b.code_challenge_method || '') !== 'S256' || !/^[A-Za-z0-9_-]{43,128}$/.test(String(b.code_challenge || ''))) {
    return back({ error: 'invalid_request', error_description: 'PKCE with S256 is required.' })
  }
  const companyId = String(b.companyId || '')
  let role = await roleIn(db, companyId, user.id)
  if (!role && user.email === PLATFORM_SUPER_ADMIN) role = 'owner'
  if (!role) return NextResponse.json({ error: 'You don’t have access to that business.' }, { status: 403 })
  // Someone who can't make changes in Colvy can only grant read access.
  const scope = normaliseScope(b.scope) === 'write' && canWrite(role) ? 'write' : 'read'

  const code = randomToken('colvy_ac_')
  const { error } = await db.from('mcp_auth_codes').insert({
    code_hash: sha256(code), client_id: client.client_id, user_id: user.id, company_id: companyId,
    redirect_uri: redirect, code_challenge: String(b.code_challenge), scope,
    resource: b.resource ? String(b.resource).slice(0, 300) : null,
    expires_at: new Date(Date.now() + CODE_TTL_S * 1000).toISOString(),
  })
  if (error) return NextResponse.json({ error: 'Colvy MCP isn’t set up yet (migration V331).' }, { status: 500 })
  return back({ code })
}
