import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { runAssistant, reportFastPath, type AssistantTurn } from '@/lib/ai-assistant/run'
import { resolveCaller, scopeContext } from '@/lib/ai-assistant/caller'
import { guardAiRequest } from '@/lib/rate-limit'

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
    // Bounded, like every other AI input: a pasted novel is a large model bill.
    const message = String(body?.message || '').trim().slice(0, 8000)
    if (!message) return NextResponse.json({ error: 'Say what you need and I\'ll help.' }, { status: 400 })

    const caller = await resolveCaller(req, body?.companyId)
    if ('error' in caller) return NextResponse.json({ error: caller.error }, { status: caller.status })
    const { db, ctx } = caller

    // Only the relevant slices of page context — never a blob of everything.
    // Only this workspace's own rows count as context (lib/ai-assistant/caller).
    await scopeContext(db, ctx, body?.context || {})

    const history: AssistantTurn[] = Array.isArray(body?.history)
      ? body.history.map((h: any) => ({ role: h?.role === 'assistant' ? 'assistant' : 'user', text: String(h?.text || '').slice(0, 8000) }))
      : []

    // Deterministic fast-path for a plain report question — no model call at all.
    const fast = await reportFastPath(db, ctx, message)
    if (fast) return NextResponse.json({ text: fast.text, cards: fast.cards, confirm: null, clientActions: [] })

    // Same burst + daily limits as every other AI route (counted under
    // 'assistant'). Not plan-gated: Colvy AI stays available on every plan.
    const guard = await guardAiRequest(req, ctx.companyId, 'assistant', false)
    if (!guard.ok) return guard.response!

    const out = await runAssistant({ db, ctx, apiKey: key, history, message, suggested: body?.suggested })
    if (out.error) return NextResponse.json({ error: out.error }, { status: 502 })
    return NextResponse.json({ text: out.text, cards: out.cards, confirm: out.confirm || null, clientActions: out.clientActions || [] })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Assistant error' }, { status: 500 })
  }
}
