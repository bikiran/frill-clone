import { NextRequest, NextResponse } from 'next/server'
import { adminDb, cors, sha256 } from '@/lib/mcp/auth'

export const dynamic = 'force-dynamic'

// OAuth 2.0 Token Revocation (RFC 7009): an app can disconnect itself.
export async function POST(req: NextRequest) {
  const text = await req.text().catch(() => '')
  let token = ''
  try { token = (req.headers.get('content-type') || '').includes('json') ? JSON.parse(text).token : new URLSearchParams(text).get('token') || '' } catch {}
  if (token) {
    const h = sha256(String(token))
    const db = adminDb()
    const now = new Date().toISOString()
    await db.from('mcp_tokens').update({ revoked_at: now }).eq('token_hash', h).is('revoked_at', null)
    await db.from('mcp_tokens').update({ revoked_at: now }).eq('refresh_hash', h).is('revoked_at', null)
  }
  return new NextResponse(null, { status: 200, headers: cors })   // always 200 per RFC 7009
}
export async function OPTIONS() { return new NextResponse(null, { status: 204, headers: cors }) }
