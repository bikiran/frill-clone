import { NextRequest, NextResponse } from 'next/server'
import { runKeywordReply } from '@/lib/keyword-reply'
import { isInternalCall } from '@/lib/internal-call'

export const dynamic = 'force-dynamic'

// Widget-facing endpoint. The shared engine lives in lib/keyword-reply so the
// SMS and email webhooks can call it directly (no internal HTTP hop).
// Only our own server calls it (widget/message, with the internal header), and
// the workspace is always the conversation's own: a companyId in the body let
// anyone post another workspace's canned replies into this thread.
export async function POST(req: NextRequest) {
  try {
    if (!isInternalCall(req)) return NextResponse.json({ ok: false, error: 'Not authorized' }, { status: 403 })
    const { conversationId, text } = await req.json()
    const result = await runKeywordReply({ conversationId, text })
    return NextResponse.json({ ok: true, ...result })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message })
  }
}
