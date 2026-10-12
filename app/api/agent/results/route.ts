import { NextRequest, NextResponse } from 'next/server'
import { agentAccess } from '@/lib/agent/access'
import { agentResults } from '@/lib/agent/results'
import { trustSuggestions, acceptTrust } from '@/lib/agent/trust'
import { dismissTrust, getDigest, setDigest } from '@/lib/agent/pilot'

export const dynamic = 'force-dynamic'

const DAYS = [7, 30, 90]

/** GET /api/agent/results?companyId=&days=7|30|90 — what the agents achieved, earned-trust suggestions, weekly email setting. */
export async function GET(req: NextRequest) {
  const companyId = req.nextUrl.searchParams.get('companyId')
  const { ok, db } = await agentAccess(req, companyId)
  if (!ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  const d = Number(req.nextUrl.searchParams.get('days'))
  const days = DAYS.includes(d) ? d : 7
  const [results, suggestions, digest] = await Promise.all([agentResults(db, companyId!, days), trustSuggestions(db, companyId!), getDigest(db, companyId!)])
  return NextResponse.json({ results, suggestions, digest: { enabled: digest.enabled } })
}

/**
 * POST /api/agent/results
 *   { companyId, action: 'accept', key }   — let the agent do that on its own (re-checked first)
 *   { companyId, action: 'dismiss', key }  — "Not now": hide it for a while
 *   { companyId, action: 'digest', enabled } — weekly summary email on / off
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { ok, db, userId } = await agentAccess(req, body?.companyId)
  if (!ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  const key = typeof body.key === 'string' ? body.key.slice(0, 120) : ''
  try {
    if (body.action === 'accept') {
      if (!key) return NextResponse.json({ error: 'Which one?' }, { status: 400 })
      const r = await acceptTrust(db, body.companyId, key, userId || null)
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: 409 })
      return NextResponse.json({ ok: true, suggestions: await trustSuggestions(db, body.companyId) })
    }
    if (body.action === 'dismiss') {
      if (!key) return NextResponse.json({ error: 'Which one?' }, { status: 400 })
      await dismissTrust(db, body.companyId, key, userId || null)
      return NextResponse.json({ ok: true })
    }
    if (body.action === 'digest') {
      const d = await setDigest(db, body.companyId, { enabled: !!body.enabled }, userId || null)
      return NextResponse.json({ ok: true, digest: { enabled: d.enabled } })
    }
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: /agent_policies|agent_runs/.test(String(e?.message)) ? 'Agents need a database update first (COLVY_V353_AGENT_ENGINE.sql).' : (e?.message || 'Something went wrong') }, { status: 500 })
  }
}
