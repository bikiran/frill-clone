import { NextRequest, NextResponse } from 'next/server'
import { notifyCompany } from '@/lib/notify'

// POST: create an activity notification for a company's team.
// Used by the widget (new inbound chat) and other client-side events.
export async function POST(req: NextRequest) {
  try {
    const { companyId, type, message, actorName, actorEmail, excludeUserId } = await req.json()
    if (!companyId || !message) return NextResponse.json({ error: 'Missing companyId or message' }, { status: 400 })
    await notifyCompany({ companyId, type: type || 'activity', message, actorName, actorEmail, excludeUserId })
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
