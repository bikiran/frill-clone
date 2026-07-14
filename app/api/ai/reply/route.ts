import { NextRequest, NextResponse } from 'next/server'
import { runAiAgent } from '@/lib/ai-agent'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// Ask the AI to answer the customer's latest message. It stays quiet unless the
// business has switched it on, and it never talks over a human.
//
// The reason it stayed quiet is RECORDED, so "the AI didn't reply" is always
// answerable instead of a mystery.
export async function POST(req: NextRequest) {
  try {
    const { conversationId, companyId } = await req.json()
    if (!conversationId) return NextResponse.json({ error: 'conversationId required' }, { status: 400 })

    const result = await runAiAgent({ conversationId, companyId })

    // Log a skip so the business can see why nothing happened.
    if (!result.replied && result.reason) {
      try {
        const db = admin()
        const { data: conv } = await db.from('conversations')
          .select('company_id').eq('id', conversationId).maybeSingle()
        if (conv?.company_id) {
          await db.from('ai_actions').insert({
            company_id: conv.company_id,
            conversation_id: conversationId,
            action: 'skipped',
            allowed: false,
            blocked_reason: result.reason,
          })
        }
      } catch {}
    }

    return NextResponse.json({ ok: true, ...result })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message })
  }
}

// GET ?conversationId= → why didn't the AI reply? A dry run that explains
// itself without posting anything to the customer.
export async function GET(req: NextRequest) {
  try {
    const conversationId = req.nextUrl.searchParams.get('conversationId')
    const companyId = req.nextUrl.searchParams.get('companyId')
    const db = admin()

    const checks: any = {}

    checks.anthropic_key_set = !!process.env.ANTHROPIC_API_KEY

    let cid = companyId
    if (conversationId && !cid) {
      const { data } = await db.from('conversations').select('company_id').eq('id', conversationId).maybeSingle()
      cid = data?.company_id
    }

    if (cid) {
      const { data: co } = await db.from('companies').select('ai_settings').eq('id', cid).maybeSingle()
      const cfg = co?.ai_settings || {}
      checks.ai_enabled = !!cfg.enabled
      checks.auto_reply_on = !!cfg.auto_reply
      checks.handoff_after = cfg.handoff_after ?? 3

      const { data: knowledge } = await db.from('ai_knowledge')
        .select('id', { count: 'exact', head: true }).eq('company_id', cid)
      const { count } = await db.from('ai_knowledge')
        .select('*', { count: 'exact', head: true }).eq('company_id', cid)
      checks.knowledge_indexed = count || 0

      const { data: recent } = await db.from('ai_actions')
        .select('action, blocked_reason, created_at')
        .eq('company_id', cid).order('created_at', { ascending: false }).limit(10)
      checks.recent_ai_activity = recent || []
    }

    // The single most likely reason, in plain words.
    let verdict = 'Everything looks ready.'
    if (!checks.anthropic_key_set) verdict = 'ANTHROPIC_API_KEY is not set on the server — the AI cannot run.'
    else if (!checks.ai_enabled) verdict = 'The AI assistant is switched off in settings.'
    else if (!checks.auto_reply_on) verdict = 'The AI is on, but "Reply to customers automatically" is off.'
    else if (checks.knowledge_indexed === 0) verdict = 'Nothing is indexed yet — click "Learn from my content" in AI settings.'

    return NextResponse.json({ ok: true, verdict, checks })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message })
  }
}
