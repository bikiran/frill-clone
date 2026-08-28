import { NextRequest, NextResponse } from 'next/server'
import { executeAction, TOOL_SAFETY } from '@/lib/ai-assistant/tools'
import { resolveCaller } from '@/lib/ai-assistant/caller'

export const dynamic = 'force-dynamic'

// POST /api/ai/assistant/execute
// Runs a single action the user has EXPLICITLY confirmed — the second half of
// the confirm flow for sensitive tools like send_message. The first call
// (/api/ai/assistant) returns a preview and does nothing; only after the user
// approves does the client post the tool + args here to actually run it.
//
// Re-authenticates and re-validates from scratch — the confirmation UI is never
// trusted to have done the security checks.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const tool = String(body?.tool || '')
    const args = body?.args || {}
    if (!tool) return NextResponse.json({ error: 'Nothing to do.' }, { status: 400 })

    const caller = await resolveCaller(req, body?.companyId)
    if ('error' in caller) return NextResponse.json({ error: caller.error }, { status: caller.status })
    const { db, ctx } = caller

    const c = body?.context || {}
    ctx.currentRoute = c.currentRoute || null
    ctx.contactId = c.contactId || null
    ctx.conversationId = c.conversationId || null
    ctx.orderId = c.orderId || null
    ctx.callId = c.callId || null
    ctx.outletId = c.outletId || null

    // Only tools that actually go through a confirmation may be run here. An
    // 'immediate' or 'read' tool has no business arriving on the execute path.
    if (TOOL_SAFETY[tool] !== 'confirm') {
      return NextResponse.json({ error: 'That action cannot be confirmed this way.' }, { status: 400 })
    }

    const r = await executeAction(db, ctx, tool, args)
    if (!r.ok) return NextResponse.json({ error: r.error || 'Could not complete that.' }, { status: 400 })
    return NextResponse.json({ ok: true, card: r.card ? { ...r.card, undo: r.undo || null } : null })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Assistant error' }, { status: 500 })
  }
}
