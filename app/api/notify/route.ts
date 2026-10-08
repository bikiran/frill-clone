import { memberOr403 } from '@/lib/company-access'
import { NextRequest, NextResponse } from 'next/server'
import { notifyCompany } from '@/lib/notify'

// POST: create an activity notification for a company's team.
// Used by the widget (new inbound chat) and other client-side events.
export async function POST(req: NextRequest) {
  try {
    const { companyId, type, message, actorName, actorEmail, excludeUserId } = await req.json()
    if (!companyId || !message) return NextResponse.json({ error: 'Missing companyId or message' }, { status: 400 })
    // Our own server, or a member of the workspace. (The chat widget used to post
    // here anonymously; /api/widget/message notifies the team itself now.)
    { const deny = await memberOr403(req, companyId, { allowInternal: true }); if (deny) return deny }
    await notifyCompany({ companyId, type: type || 'activity', message, actorName, actorEmail, excludeUserId })
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
