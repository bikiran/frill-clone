import { NextRequest, NextResponse } from 'next/server'
import { agentAccess } from '@/lib/agent/access'
import { needsYou } from '@/lib/agent/needs-you'
import { getAlertSettings, setAlertSettings } from '@/lib/agent/pilot'

export const dynamic = 'force-dynamic'

/** GET /api/agent/needs-you?companyId= — everything waiting on a person, most urgent first. */
export async function GET(req: NextRequest) {
  const companyId = req.nextUrl.searchParams.get('companyId')
  const { ok, db } = await agentAccess(req, companyId)
  if (!ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  const [list, alerts] = await Promise.all([needsYou(db, companyId!), getAlertSettings(db, companyId!)])
  return NextResponse.json({ items: list.items, counts: list.counts, alerts: { enabled: alerts.enabled }, goals: list.goals.filter(g => g.on).map(g => ({ key: g.key, label: g.label, rate: g.rate, open: g.open, met: g.met, missed: g.missed })) })
}

/** POST /api/agent/needs-you { companyId, action: 'alerts', enabled } — phone alerts on / off. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { ok, db, userId } = await agentAccess(req, body?.companyId)
  if (!ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  if (body.action !== 'alerts') return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  const s = await setAlertSettings(db, body.companyId, { enabled: !!body.enabled }, userId || null)
  return NextResponse.json({ ok: true, alerts: { enabled: s.enabled } })
}
