import { NextRequest, NextResponse } from 'next/server'
import { runKeywordReply } from '@/lib/keyword-reply'

export const dynamic = 'force-dynamic'

// Widget-facing endpoint. The shared engine lives in lib/keyword-reply so the
// SMS and email webhooks can call it directly (no internal HTTP hop).
export async function POST(req: NextRequest) {
  try {
    const { conversationId, text, companyId } = await req.json()
    const result = await runKeywordReply({ conversationId, text, companyId })
    return NextResponse.json({ ok: true, ...result })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message })
  }
}
