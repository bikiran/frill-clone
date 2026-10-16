import { NextRequest } from 'next/server'
import { getPollView } from '@/lib/engage-server'
import { callerOf, engageDb, engageDeps, reply, unavailable } from '@/lib/engage-http'

export const dynamic = 'force-dynamic'

/**
 * GET /api/polls/<id>?clv=
 * The poll as the public page and embeds show it. Drafts are 404; totals only
 * when the poll's "show results" setting allows; never the vote rows.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = engageDb()
  if (!db) return unavailable()
  try {
    const out = await getPollView(engageDeps(db), id, callerOf(req, 'poll', id, req.nextUrl.searchParams.get('clv')))
    return reply(out, 'poll', id, req.nextUrl.searchParams.get('embed') === '1')
  } catch {
    return reply({ status: 500, body: { poll: null, error: 'Couldn’t load this poll. Please try again.' } }, 'poll', id)
  }
}
