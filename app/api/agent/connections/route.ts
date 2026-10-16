import { NextRequest, NextResponse } from 'next/server'
import { agentAccess } from '@/lib/agent/access'
import { ROLES } from '@/lib/agent/roles'
import { listMcpTools } from '@/lib/agent/mcp-client'
import { mergeTools, serverOf, MAX_CONNECTIONS, toolSchema, type ConnTool, type Connection, type ToolMode } from '@/lib/agent/external-tools'
import { checkPublicUrl } from '@/lib/integration-events'

export const dynamic = 'force-dynamic'

const MISSING = 'Outside tools need a database update first (COLVY_V355_AGENT_CONNECTIONS.sql).'
const missingTable = (e: any) => /agent_connections/i.test(String(e?.message || '')) && /does not exist|schema cache|relation/i.test(String(e?.message || ''))
const AUTH_TYPES = ['none', 'bearer', 'header'] as const
const MODES: ToolMode[] = ['off', 'auto', 'ask']

// What the browser sees: never the key itself.
function publicView(c: any) {
  const { secret, ...rest } = c
  return {
    ...rest,
    has_secret: !!secret,
    tools: (Array.isArray(c.tools) ? c.tools : []).map((t: ConnTool) => ({ key: t.key, name: t.name, title: t.title || null, description: String(t.description || '').slice(0, 300), read_only: !!t.read_only, mode: t.mode, problem: toolSchema(t.input_schema).problem })),
  }
}

const cleanRoles = (v: any): string[] => Array.isArray(v) ? Array.from(new Set(v.filter((r: any) => typeof r === 'string' && ROLES[r]))) as string[] : []

/** GET /api/agent/connections?companyId= — the business's outside tool connections. */
export async function GET(req: NextRequest) {
  const companyId = req.nextUrl.searchParams.get('companyId')
  const { ok, db } = await agentAccess(req, companyId)
  if (!ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  const roles = Object.values(ROLES).map(r => ({ key: r.key, name: r.name.replace(/^Colvy /, '') }))
  const { data, error } = await db.from('agent_connections').select('*').eq('company_id', companyId).order('created_at', { ascending: true })
  if (error) return missingTable(error) ? NextResponse.json({ connections: [], roles, missing: true }) : NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ connections: (data || []).map(publicView), roles, max: MAX_CONNECTIONS })
}

/**
 * POST /api/agent/connections
 *   { companyId, action: 'create', name, url, authType, authHeader?, secret?, roles }
 *       Connects, loads the tools and saves it (look-ups on their own, anything
 *       else asks a person first).
 *   { companyId, action: 'refresh', id }     — reload the tool list (keeps your choices)
 *   { companyId, action: 'update', id, name?, url?, authType?, authHeader?, secret?, roles?, enabled?, tools?: { [key]: 'off'|'auto'|'ask' } }
 *   { companyId, action: 'delete', id }
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const companyId = body?.companyId
  const { ok, db, userId } = await agentAccess(req, companyId)
  if (!ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  const now = new Date().toISOString()

  const load = async (id: string): Promise<Connection | null> => {
    const { data } = await db.from('agent_connections').select('*').eq('id', id).eq('company_id', companyId).maybeSingle()
    return data || null
  }

  try {
    if (body.action === 'create') {
      const name = String(body.name || '').trim().slice(0, 60)
      const url = String(body.url || '').trim()
      const authType = AUTH_TYPES.includes(body.authType) ? body.authType : 'none'
      const authHeader = authType === 'header' ? String(body.authHeader || '').trim() : null
      const secret = authType === 'none' ? null : String(body.secret || '').trim()
      if (!name) return NextResponse.json({ error: 'Give the connection a name.' }, { status: 400 })
      const bad = await checkPublicUrl(url)
      if (bad) return NextResponse.json({ error: bad }, { status: 400 })
      if (authType !== 'none' && !secret) return NextResponse.json({ error: 'Paste the API key or token.' }, { status: 400 })
      if (authType === 'header' && !/^[A-Za-z0-9-]{1,64}$/.test(authHeader || '')) return NextResponse.json({ error: 'Enter the header name, e.g. X-API-Key.' }, { status: 400 })
      const { count, error: cErr } = await db.from('agent_connections').select('id', { count: 'exact', head: true }).eq('company_id', companyId)
      if (cErr) return NextResponse.json({ error: missingTable(cErr) ? MISSING : cErr.message }, { status: 500 })
      if ((count || 0) >= MAX_CONNECTIONS) return NextResponse.json({ error: `You can connect up to ${MAX_CONNECTIONS} outside tools.` }, { status: 400 })

      let listed
      try { listed = await listMcpTools(serverOf({ url, auth_type: authType, auth_header: authHeader, secret })) } catch (e: any) {
        return NextResponse.json({ error: `Couldn’t connect: ${e?.message || 'no answer'}` }, { status: 400 })
      }
      const id = crypto.randomUUID()
      const row = {
        id, company_id: companyId, name, url, auth_type: authType, auth_header: authHeader, secret,
        roles: cleanRoles(body.roles), tools: mergeTools(id, listed.tools), enabled: true,
        status: 'ok', last_error: null, server_name: listed.serverName || null, synced_at: now,
        created_by: userId || null, created_at: now, updated_at: now,
      }
      const { data, error } = await db.from('agent_connections').insert(row).select('*').maybeSingle()
      if (error) return NextResponse.json({ error: missingTable(error) ? MISSING : error.message }, { status: 500 })
      return NextResponse.json({ ok: true, connection: publicView(data || row) })
    }

    const conn = body.id ? await load(String(body.id)) : null
    if (!conn) return NextResponse.json({ error: 'Connection not found.' }, { status: 404 })

    if (body.action === 'refresh') {
      try {
        const listed = await listMcpTools(serverOf(conn))
        const patch = { tools: mergeTools(conn.id, listed.tools, conn.tools), status: 'ok', last_error: null, server_name: listed.serverName || (conn as any).server_name || null, synced_at: now, updated_at: now }
        await db.from('agent_connections').update(patch).eq('id', conn.id).eq('company_id', companyId)
        return NextResponse.json({ ok: true, connection: publicView({ ...conn, ...patch }) })
      } catch (e: any) {
        const patch = { status: 'error', last_error: String(e?.message || 'Couldn’t connect').slice(0, 300), updated_at: now }
        await db.from('agent_connections').update(patch).eq('id', conn.id).eq('company_id', companyId)
        return NextResponse.json({ error: `Couldn’t connect: ${patch.last_error}`, connection: publicView({ ...conn, ...patch }) }, { status: 400 })
      }
    }

    if (body.action === 'update') {
      const patch: Record<string, any> = { updated_at: now }
      if (typeof body.name === 'string' && body.name.trim()) patch.name = body.name.trim().slice(0, 60)
      if (Array.isArray(body.roles)) patch.roles = cleanRoles(body.roles)
      if (typeof body.enabled === 'boolean') patch.enabled = body.enabled
      if (body.tools && typeof body.tools === 'object') {
        patch.tools = (conn.tools || []).map(t => MODES.includes(body.tools[t.key]) ? { ...t, mode: body.tools[t.key] } : t)
      }
      // A new address or key: check it works before saving.
      const newUrl = typeof body.url === 'string' && body.url.trim() && body.url.trim() !== conn.url ? body.url.trim() : null
      const newAuth = AUTH_TYPES.includes(body.authType) ? body.authType : null
      const newSecret = typeof body.secret === 'string' && body.secret.trim() ? body.secret.trim() : null
      if (newUrl || newAuth || newSecret) {
        const next = {
          url: newUrl || conn.url,
          auth_type: newAuth || conn.auth_type,
          auth_header: (newAuth || conn.auth_type) === 'header' ? String(body.authHeader ?? conn.auth_header ?? '').trim() : null,
          secret: (newAuth || conn.auth_type) === 'none' ? null : (newSecret || conn.secret || null),
        }
        if (newUrl) { const bad = await checkPublicUrl(newUrl); if (bad) return NextResponse.json({ error: bad }, { status: 400 }) }
        if (next.auth_type !== 'none' && !next.secret) return NextResponse.json({ error: 'Paste the API key or token.' }, { status: 400 })
        try {
          const listed = await listMcpTools(serverOf(next))
          Object.assign(patch, next, { tools: mergeTools(conn.id, listed.tools, patch.tools || conn.tools), status: 'ok', last_error: null, synced_at: now })
        } catch (e: any) {
          return NextResponse.json({ error: `Couldn’t connect with those details: ${e?.message || 'no answer'}` }, { status: 400 })
        }
      }
      await db.from('agent_connections').update(patch).eq('id', conn.id).eq('company_id', companyId)
      return NextResponse.json({ ok: true, connection: publicView({ ...conn, ...patch }) })
    }

    if (body.action === 'delete') {
      await db.from('agent_connections').delete().eq('id', conn.id).eq('company_id', companyId)
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: missingTable(e) ? MISSING : (e?.message || 'Something went wrong') }, { status: 500 })
  }
}
