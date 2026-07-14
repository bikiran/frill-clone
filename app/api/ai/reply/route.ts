import { NextRequest, NextResponse } from 'next/server'
import { runAiAgent } from '@/lib/ai-agent'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Ask the AI to answer the customer's latest message. It stays quiet unless the
// business has switched it on, and it never talks over a human.
export async function POST(req: NextRequest) {
  try {
    const { conversationId, companyId } = await req.json()
    if (!conversationId) return NextResponse.json({ error: 'conversationId required' }, { status: 400 })
    const result = await runAiAgent({ conversationId, companyId })
    return NextResponse.json({ ok: true, ...result })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message })
  }
}
