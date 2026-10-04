import { NextRequest, NextResponse } from 'next/server'
import { adminDb, cors, originOf, resourceMetadataUrl, roleIn, verifyBearer } from '@/lib/mcp/auth'
import { handleRpc } from '@/lib/mcp/server'
import type { AssistantContext } from '@/lib/ai-assistant/tools'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Colvy MCP server — Streamable HTTP transport, JSON responses.
// Clients POST JSON-RPC messages with "Authorization: Bearer <token>". A
// missing or bad token gets a 401 pointing at the OAuth metadata, which is how
// Claude, ChatGPT and Cursor discover the sign-in flow.

// Simple per-token rate limit (per server instance): 120 calls a minute.
const hits = new Map<string, number[]>()
function limited(key: string) {
  const now = Date.now()
  const list = (hits.get(key) || []).filter(t => now - t < 60_000)
  list.push(now); hits.set(key, list)
  if (hits.size > 5000) hits.clear()
  return list.length > 120
}

const unauthorized = (req: NextRequest, description = 'Sign in to Colvy to use this server.') =>
  new NextResponse(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32001, message: description } }), {
    status: 401,
    headers: {
      ...cors, 'Content-Type': 'application/json',
      'WWW-Authenticate': `Bearer realm="colvy", resource_metadata="${resourceMetadataUrl(req)}", error="invalid_token", error_description="${description}"`,
    },
  })

export async function POST(req: NextRequest) {
  const db = adminDb()
  const auth = await verifyBearer(db, req)
  if (!auth) return unauthorized(req)
  if (limited(auth.tokenId)) {
    return NextResponse.json({ jsonrpc: '2.0', id: null, error: { code: -32029, message: 'Too many requests. Try again in a minute.' } }, { status: 429, headers: { ...cors, 'Retry-After': '30' } })
  }

  // Who and where, from the token — never from the request body.
  const role = await roleIn(db, auth.companyId, auth.userId)
  if (!role) return unauthorized(req, 'This connection no longer has access to that business.')
  const [{ data: co }, { data: u }] = await Promise.all([
    db.from('companies').select('name').eq('id', auth.companyId).maybeSingle(),
    db.auth.admin.getUserById(auth.userId).then((r: any) => r, () => ({ data: null })),
  ])
  const user = (u as any)?.user
  const ctx: AssistantContext = {
    companyId: auth.companyId, userId: auth.userId, role,
    userName: user?.user_metadata?.display_name || (user?.email ? String(user.email).split('@')[0] : 'Colvy user'),
    companyName: co?.name || 'your business',
    siteOrigin: originOf(req),
  }

  let body: any
  try { body = await req.json() } catch {
    return NextResponse.json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, { status: 400, headers: cors })
  }
  const env = { db, ctx, auth }
  const headers = { ...cors, 'Content-Type': 'application/json' }

  if (Array.isArray(body)) {
    const out = (await Promise.all(body.slice(0, 20).map(m => handleRpc(m, env)))).filter(Boolean)
    return out.length ? new NextResponse(JSON.stringify(out), { status: 200, headers }) : new NextResponse(null, { status: 202, headers: cors })
  }
  const out = await handleRpc(body, env)
  if (!out) return new NextResponse(null, { status: 202, headers: cors })
  return new NextResponse(JSON.stringify(out), { status: 200, headers })
}

// No server-initiated stream: replies always come back on the POST.
export async function GET(req: NextRequest) {
  const db = adminDb()
  if (!(await verifyBearer(db, req))) return unauthorized(req)
  return new NextResponse(null, { status: 405, headers: { ...cors, Allow: 'POST' } })
}

export async function DELETE() {
  return new NextResponse(null, { status: 204, headers: cors })
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: cors })
}
