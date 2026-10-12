import { NextRequest, NextResponse } from 'next/server'
import { agentAccess, missingAgentTables, staffName } from '@/lib/agent/access'
import { AUTO_TOPICS, agentsPaused, autoSentToday, getAutoSend, setAutoSend, setPaused, getReviewAuto, setReviewAuto, getSalesAuto, setSalesAuto, getOpsAuto, setOpsAuto, getAgentChannels, setAgentChannels, AGENT_CHANNEL_OPTIONS, getCommentAuto, setCommentAuto } from '@/lib/agent/pilot'

export const dynamic = 'force-dynamic'

async function state(db: any, companyId: string) {
  const [pause, autoSend, receptionAuto, reviewAuto, commentAuto, salesAuto, opsAuto, channels, sentToday, { count: waiting }] = await Promise.all([
    agentsPaused(db, companyId),
    getAutoSend(db, companyId),
    getAutoSend(db, companyId, 'reception'),
    getReviewAuto(db, companyId),
    getCommentAuto(db, companyId),
    getSalesAuto(db, companyId),
    getOpsAuto(db, companyId),
    getAgentChannels(db, companyId),
    autoSentToday(db, companyId),
    db.from('agent_approvals').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('status', 'pending').gt('expires_at', new Date().toISOString()).then((r: any) => r, () => ({ count: 0 })),
  ])
  return { pause, autoSend, receptionAuto, reviewAuto, commentAuto, salesAuto, opsAuto, channels, channelOptions: AGENT_CHANNEL_OPTIONS, sentToday, waiting: waiting || 0, topics: Object.entries(AUTO_TOPICS).map(([key, t]) => ({ key, label: t.label })) }
}

/** GET /api/agent/settings?companyId= — kill switch, auto-send settings and today's numbers. */
export async function GET(req: NextRequest) {
  const companyId = req.nextUrl.searchParams.get('companyId')
  const { ok, db } = await agentAccess(req, companyId)
  if (!ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  return NextResponse.json(await state(db, companyId!))
}

/**
 * POST /api/agent/settings
 *   { companyId, paused: boolean }        — pause / resume every agent
 *   { companyId, autoSend: { enabled, topics, max_per_day, max_per_conversation_per_hour, require_verified_customer } }
 *   { companyId, receptionAuto: { …same as autoSend } }   — Reception Agent
 *   { companyId, salesAuto: { enabled, max_per_day } }   — Sales Agent cart follow-ups
 *   { companyId, opsAuto: { enabled, max_per_day } }     — Operations Agent order updates
 *   { companyId, channels: ['sms','chat','email','facebook','instagram'] } — where Support and Reception answer
 *   { companyId, reviewAuto: { enabled, min_rating: 4 | 5, max_per_day } }   — Reputation Agent
 *   { companyId, commentAuto: { on, enabled, max_per_day } }   — Reputation Agent on Facebook / Instagram comments
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { ok, db, userId } = await agentAccess(req, body?.companyId)
  if (!ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  try {
    if (typeof body.paused === 'boolean') {
      await setPaused(db, body.companyId, body.paused, { id: userId || null, name: await staffName(db, body.companyId, userId) })
    }
    if (body.autoSend && typeof body.autoSend === 'object') {
      await setAutoSend(db, body.companyId, body.autoSend, userId || null)
    }
    if (body.receptionAuto && typeof body.receptionAuto === 'object') {
      await setAutoSend(db, body.companyId, body.receptionAuto, userId || null, 'reception')
    }
    if (body.salesAuto && typeof body.salesAuto === 'object') {
      await setSalesAuto(db, body.companyId, body.salesAuto, userId || null)
    }
    if (Array.isArray(body.channels)) {
      await setAgentChannels(db, body.companyId, body.channels, userId || null)
    }
    if (body.opsAuto && typeof body.opsAuto === 'object') {
      await setOpsAuto(db, body.companyId, body.opsAuto, userId || null)
    }
    if (body.commentAuto && typeof body.commentAuto === 'object') {
      await setCommentAuto(db, body.companyId, body.commentAuto, userId || null)
    }
    if (body.reviewAuto && typeof body.reviewAuto === 'object') {
      await setReviewAuto(db, body.companyId, body.reviewAuto, userId || null)
    }
    return NextResponse.json(await state(db, body.companyId))
  } catch (e: any) {
    return NextResponse.json({ error: missingAgentTables(e) || /agent_policies/.test(String(e?.message)) ? 'Agents need a database update first (COLVY_V353_AGENT_ENGINE.sql).' : e?.message || 'Couldn’t save.' }, { status: 500 })
  }
}
