import { NextRequest, NextResponse } from 'next/server'
import { guardAiRequest } from '@/lib/rate-limit'
import { feedbackItems, ownedBy } from '@/lib/engage-admin'
import { summariseFeedback } from '@/lib/engage-ai'
import { engageDb } from '@/lib/engage-http'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * POST /api/engage/summary { kind: 'survey', id, companyId }
 * "Summarise responses": themes, sentiment and next steps from a survey's
 * written answers. guardAiRequest checks the caller is staff of companyId,
 * the plan includes AI, and the daily limit; the survey must be that
 * company's. Read-only.
 */
export async function POST(req: NextRequest) {
  let body: any = {}
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Bad request' }, { status: 400 }) }
  const guard = await guardAiRequest(req, body?.companyId, 'engage-summary')
  if (!guard.ok) return guard.response!
  const db = engageDb()
  if (!db) return NextResponse.json({ error: 'Not available' }, { status: 503 })
  if (body?.kind !== 'survey') return NextResponse.json({ error: 'Only surveys can be summarised' }, { status: 400 })
  const survey = await ownedBy(db, 'survey', body?.id, body?.companyId)
  if (!survey) return NextResponse.json({ error: 'Survey not found' }, { status: 404 })
  const { items, scoreLabel, question } = await feedbackItems(db, survey)
  let business: string | null = null
  try { business = (await db.from('companies').select('name').eq('id', body.companyId).maybeSingle()).data?.name || null } catch {}
  const out = await summariseFeedback({ companyId: body.companyId, business, title: String(survey.title || 'Survey'), question, scoreLabel, items })
  if ('error' in out) return NextResponse.json({ error: out.error }, { status: 422 })
  return NextResponse.json({ summary: out.summary, used: out.used, at: new Date().toISOString() }, { headers: { 'Cache-Control': 'no-store' } })
}
