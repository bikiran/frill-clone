import { memberOr403 } from '@/lib/company-access'
import { NextRequest, NextResponse } from 'next/server'
import { syncSocial, admin } from '@/lib/social-sync'
import { queueCommentReplies } from '@/lib/agent/reputation'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// POST { companyId } — pull the page's recent posts + comments and AI-classify them.
export async function POST(req: NextRequest) {
  try {
    const { companyId } = await req.json()
    if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 })
    { const deny = await memberOr403(req, companyId); if (deny) return deny }
    const result = await syncSocial(companyId)
    // Recent unanswered comments get a drafted reply, if the Reputation Agent is on for comments.
    const agent = await queueCommentReplies(admin(), companyId).catch(() => null)
    return NextResponse.json({ ok: true, ...result, agent })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
