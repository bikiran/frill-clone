import { NextRequest, NextResponse } from 'next/server'
import { integrationAccess } from '@/lib/integration-access'
import { adminDb, normaliseScope, randomToken, sha256 } from '@/lib/mcp/auth'

export const dynamic = 'force-dynamic'

// Colvy MCP connections for a business.
//   GET    ?companyId=          → API keys and connected apps (never the secrets)
//   POST   { companyId, name, scope } → a new API key, shown once
//   DELETE { companyId, id }    → revoke a key or disconnect an app

const NEEDS_MIGRATION = 'Colvy MCP needs a quick database update (migration V331) first.'

export async function GET(req: NextRequest) {
  const db = adminDb()
  const companyId = req.nextUrl.searchParams.get('companyId') || ''
  const access = await integrationAccess(req, db, companyId)
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })
  const { data, error } = await db.from('mcp_tokens')
    .select('id, kind, name, client_id, token_last4, scope, user_id, expires_at, refresh_expires_at, last_used_at, created_at')
    .eq('company_id', companyId).is('revoked_at', null).order('created_at', { ascending: false }).limit(200)
  if (error) return NextResponse.json({ keys: [], apps: [], needsMigration: true })
  const now = Date.now()
  const live = (data || []).filter((t: any) => t.kind === 'api_key' || !t.refresh_expires_at || Date.parse(t.refresh_expires_at) > now)
  // Who made each one.
  const ids = Array.from(new Set(live.map((t: any) => t.user_id)))
  const names: Record<string, string> = {}
  await Promise.all(ids.map(async (id: any) => {
    try { const { data: u } = await db.auth.admin.getUserById(id); names[id] = u?.user?.user_metadata?.display_name || u?.user?.email || 'Team member' } catch { names[id] = 'Team member' }
  }))
  const shape = (t: any) => ({ id: t.id, name: t.name, scope: normaliseScope(t.scope), last4: t.token_last4, by: names[t.user_id] || 'Team member', lastUsed: t.last_used_at, created: t.created_at })
  return NextResponse.json({
    keys: live.filter((t: any) => t.kind === 'api_key').map(shape),
    apps: live.filter((t: any) => t.kind === 'oauth').map(shape),
  })
}

export async function POST(req: NextRequest) {
  const db = adminDb()
  const b = await req.json().catch(() => ({}))
  const companyId = String(b.companyId || '')
  const access = await integrationAccess(req, db, companyId, { edit: true })
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })
  const name = String(b.name || '').trim().slice(0, 80) || 'API key'
  const key = randomToken('colvy_sk_')
  const { data, error } = await db.from('mcp_tokens').insert({
    company_id: companyId, user_id: access.userId, kind: 'api_key', name,
    token_hash: sha256(key), token_last4: key.slice(-4), scope: normaliseScope(b.scope),
  }).select('id').maybeSingle()
  if (error) return NextResponse.json({ error: NEEDS_MIGRATION }, { status: 503 })
  return NextResponse.json({ ok: true, id: data?.id, key })
}

export async function DELETE(req: NextRequest) {
  const db = adminDb()
  const b = await req.json().catch(() => ({}))
  const companyId = String(b.companyId || '')
  const access = await integrationAccess(req, db, companyId, { edit: true })
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })
  const { data } = await db.from('mcp_tokens').update({ revoked_at: new Date().toISOString() })
    .eq('company_id', companyId).eq('id', String(b.id || '')).is('revoked_at', null).select('id')
  if (!data?.length) return NextResponse.json({ error: 'Already removed.' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
