import { NextRequest } from 'next/server'
import { castVote } from '@/lib/engage-server'
import { callerOf, crossSite, engageDb, engageDeps, reply, sameSite, unavailable } from '@/lib/engage-http'

export const dynamic = 'force-dynamic'

/**
 * POST /api/polls/<id>/vote { picks, name?, contact?, clv? }
 * One vote per person (or a changed vote when the poll allows it), live polls
 * only, rate limited. See lib/engage-server.ts.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!sameSite(req)) return crossSite()
  const db = engageDb()
  if (!db) return unavailable()
  let body: any = {}
  try { body = await req.json() } catch { body = {} }
  try {
    const out = await castVote(engageDeps(db), id, callerOf(req, 'poll', id, body?.clv), body || {})
    return reply(out, 'poll', id, body?.embed === true)
  } catch {
    return reply({ status: 500, body: { error: 'Couldn’t save your vote just now. Please try again.' } }, 'poll', id)
  }
}
