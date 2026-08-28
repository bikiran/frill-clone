import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { runAssistant, type AssistantTurn } from '@/lib/ai-assistant/run'
import { resolveCaller } from '@/lib/ai-assistant/caller'

export const dynamic = 'force-dynamic'

// POST /api/ai/assistant
// The single entry point for the Colvy AI command bar (web + mobile, typed or
// voice — voice is transcribed client-side and posted here as text).
//
// Pipeline: authenticate → resolve company + role → build a minimal, relevant
// context → run the controlled tool loop → return structured cards (+ an
// optional confirmation for sensitive actions). The model never touches the DB
// directly; it can only request our named tools, which are executed and
// re-validated server-side.
export async function POST(req: NextRequest) {
  try {
    const key = process.env.ANTHROPIC_API_KEY
    if (!key) return NextResponse.json({ error: 'Assistant is not configured.' }, { status: 503 })

    const body = await req.json().catch(() => ({}))
    const message = String(body?.message || '').trim()
    if (!message) return NextResponse.json({ error: 'Say what you need and I\'ll help.' }, { status: 400 })

    const caller = await resolveCaller(req, body?.companyId)
    if ('error' in caller) return NextResponse.json({ error: caller.error }, { status: caller.status })
    const { db, ctx } = caller

    // Only the relevant slices of page context — never a blob of everything.
    const c = body?.context || {}
    ctx.currentRoute = c.currentRoute || null
    ctx.contactId = c.contactId || null
    ctx.conversationId = c.conversationId || null
    ctx.orderId = c.orderId || null
    ctx.callId = c.callId || null
    ctx.outletId = c.outletId || null

    const history: AssistantTurn[] = Array.isArray(body?.history)
      ? body.history.map((h: any) => ({ role: h?.role === 'assistant' ? 'assistant' : 'user', text: String(h?.text || '') }))
      : []

    const out = await runAssistant({ db, ctx, apiKey: key, history, message, suggested: body?.suggested })
    if (out.error) return NextResponse.json({ error: out.error }, { status: 502 })
    return NextResponse.json({ text: out.text, cards: out.cards, confirm: out.confirm || null, clientActions: out.clientActions || [] })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Assistant error' }, { status: 500 })
  }
}
