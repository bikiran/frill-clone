import { NextRequest } from 'next/server'
import { getSurveyView } from '@/lib/engage-server'
import { callerOf, engageDb, engageDeps, reply, unavailable } from '@/lib/engage-http'

export const dynamic = 'force-dynamic'

/**
 * GET /api/surveys/<id>?clv=
 * The survey as the public page shows it (drafts are 404), and whether this
 * person has already answered. Never any responses.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = engageDb()
  if (!db) return unavailable()
  try {
    const out = await getSurveyView(engageDeps(db), id, callerOf(req, 'survey', id, req.nextUrl.searchParams.get('clv')))
    return reply(out, 'survey', id)
  } catch {
    return reply({ status: 500, body: { survey: null, error: 'Couldn’t load this survey. Please try again.' } }, 'survey', id)
  }
}
