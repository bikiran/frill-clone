import { NextRequest } from 'next/server'
import { submitSurvey } from '@/lib/engage-server'
import { callerOf, engageDb, engageDeps, reply, unavailable } from '@/lib/engage-http'

export const dynamic = 'force-dynamic'

/**
 * POST /api/surveys/<id>/respond { score?, comment?, answers?, name?, contact?, clv? }
 * One response per person, live surveys only, rate limited. See lib/engage-server.ts.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = engageDb()
  if (!db) return unavailable()
  let body: any = {}
  try { body = await req.json() } catch { body = {} }
  try {
    const out = await submitSurvey(engageDeps(db), id, callerOf(req, 'survey', id, body?.clv), body || {})
    return reply(out, 'survey', id)
  } catch {
    return reply({ status: 500, body: { error: 'Couldn’t send your answer just now. Please try again.' } }, 'survey', id)
  }
}
