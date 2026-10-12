import { NextRequest, NextResponse } from 'next/server'
import { agentAccess } from '@/lib/agent/access'
import { evaluateGoals, cleanGoals, GOAL_KEYS } from '@/lib/agent/goals'
import { getGoalSettings, setGoalSettings } from '@/lib/agent/pilot'

export const dynamic = 'force-dynamic'

const DAYS = [7, 30, 90]

/** GET /api/agent/goals?companyId=&days=7|30|90 — each goal, its target, and how often it was met. */
export async function GET(req: NextRequest) {
  const companyId = req.nextUrl.searchParams.get('companyId')
  const { ok, db } = await agentAccess(req, companyId)
  if (!ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  const d = Number(req.nextUrl.searchParams.get('days'))
  const settings = cleanGoals(await getGoalSettings(db, companyId!))
  const { goals } = await evaluateGoals(db, companyId!, settings, { days: DAYS.includes(d) ? d : 7 })
  return NextResponse.json({ goals })
}

/** POST /api/agent/goals { companyId, goals: { reply_time: { on, target }, … } } — change goals (only valid targets are kept). */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { ok, db, userId } = await agentAccess(req, body?.companyId)
  if (!ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  const current = cleanGoals(await getGoalSettings(db, body.companyId))
  const patch = body.goals && typeof body.goals === 'object' ? body.goals : {}
  const merged: any = { ...current }
  for (const k of GOAL_KEYS) if (patch[k]) merged[k] = { ...current[k], ...patch[k] }
  const next = cleanGoals(merged)
  await setGoalSettings(db, body.companyId, next, userId || null)
  return NextResponse.json({ ok: true, settings: next })
}
