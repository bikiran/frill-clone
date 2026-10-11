import { NextRequest, NextResponse } from 'next/server'
import { agentAccess, staffName } from '@/lib/agent/access'
import { listMemory, saveMemory, setMemoryStatus, POLICY_TEMPLATES, TONE_STYLES } from '@/lib/agent/business-memory'
import { DEFAULT_THRESHOLDS } from '@/lib/order-assess'

export const dynamic = 'force-dynamic'

const missing = (e: any) => /business_memory/.test(String(e?.message || '')) && /does not exist|schema cache|relation/i.test(String(e?.message || ''))

async function payload(db: any, companyId: string) {
  const items = await listMemory(db, companyId)
  // Who edited the reply a proposal was learned from.
  const ids = Array.from(new Set(items.map(i => i.content?.evidence?.edited_by).filter(Boolean)))
  const names: Record<string, string | null> = {}
  for (const uid of ids.slice(0, 20)) names[uid] = await staffName(db, companyId, uid)
  return {
    items: items.map(i => (i.content?.evidence?.edited_by ? { ...i, content: { ...i.content, evidence: { ...i.content.evidence, edited_by_name: names[i.content.evidence.edited_by] || null } } } : i)),
    templates: { policies: POLICY_TEMPLATES, tones: Object.fromEntries(Object.entries(TONE_STYLES).map(([k, v]) => [k, { label: v.label, sample: v.sample }])), thresholds: DEFAULT_THRESHOLDS },
  }
}

/** GET /api/agent/memory?companyId= — everything the agents know (active), plus proposals waiting. */
export async function GET(req: NextRequest) {
  const companyId = req.nextUrl.searchParams.get('companyId')
  const { ok, db } = await agentAccess(req, companyId)
  if (!ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  try { return NextResponse.json(await payload(db, companyId!)) }
  catch (e: any) { return NextResponse.json(missing(e) ? { items: [], needsMigration: true } : { error: e?.message || 'Couldn’t load memory' }, { status: missing(e) ? 200 : 500 }) }
}

/**
 * POST /api/agent/memory
 *   { companyId, kind, key?, content }          save one item (empty text removes it)
 *   { companyId, id, status: 'active' | 'archived', content? }   keep / dismiss / remove
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { ok, db, userId } = await agentAccess(req, body?.companyId)
  if (!ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  try {
    if (body.id) {
      if (!['active', 'archived'].includes(body.status)) return NextResponse.json({ error: 'Unknown status' }, { status: 400 })
      const done = await setMemoryStatus(db, body.companyId, String(body.id), body.status, body.content, userId || null)
      if (!done) return NextResponse.json({ error: 'Couldn’t find that item.' }, { status: 404 })
    } else {
      await saveMemory(db, body.companyId, { kind: body.kind, key: body.key, content: body.content }, userId || null)
    }
    return NextResponse.json(await payload(db, body.companyId))
  } catch (e: any) {
    return NextResponse.json({ error: missing(e) ? 'Agents need a database update first (COLVY_V353_AGENT_ENGINE.sql).' : e?.message || 'Couldn’t save.' }, { status: 400 })
  }
}
