import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireCompanyAccess } from '@/lib/company-access'
import { guardAiRequest } from '@/lib/rate-limit'
import { scanRecentQuestions } from '@/lib/ai-unanswered'
import { agentAccess } from '@/lib/agent/access'
import { saveMemory, slug } from '@/lib/agent/business-memory'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// POST { companyId, action: 'scan' } → look back over recent conversations for unanswered questions.
// POST { companyId, action: 'dismiss' | 'reopen', id }
// POST { companyId, action: 'save_memory', id, question, answer } → answer it as a Business Memory must-know fact.
export async function POST(req: NextRequest) {
  try {
    const db = admin()
    const b = await req.json().catch(() => ({}))
    const companyId = String(b.companyId || '')
    if (!(await requireCompanyAccess(req, db, companyId)).ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })

    if (b.action === 'scan') {
      const guard = await guardAiRequest(req, companyId, 'ai_unanswered_scan')
      if (!guard.ok) return guard.response!
      const r = await scanRecentQuestions(db, companyId)
      if ('error' in r) return NextResponse.json({ error: r.error }, { status: 422 })
      return NextResponse.json({ ok: true, ...r })
    }
    if (b.action === 'save_memory') {
      // Business Memory belongs to AI Agents, so this also needs that permission
      // (the same check as the Business memory page).
      const access = await agentAccess(req, companyId)
      if (!access.ok) return NextResponse.json({ error: 'Only people with access to AI Agents can change Business memory.' }, { status: 403 })
      const question = String(b.question || '').replace(/\s+/g, ' ').trim()
      const answer = String(b.answer || '').trim()
      if (!question || !answer) return NextResponse.json({ error: 'Add both a question and an answer.' }, { status: 400 })
      const { data: row } = await db.from('ai_unanswered').select('id').eq('id', String(b.id || '')).eq('company_id', companyId).maybeSingle()
      if (!row) return NextResponse.json({ error: 'That question isn’t on the list any more.' }, { status: 404 })
      try {
        // Its own key per question, so it never replaces one of the owner's other facts.
        await saveMemory(db, companyId, { kind: 'policy', key: `q_${slug(question).slice(0, 36)}`, content: { title: question.slice(0, 80), text: answer } }, access.userId || null)
      } catch (e) {
        const msg = e instanceof Error ? e.message : ''
        return NextResponse.json({ error: /business_memory/.test(msg) ? 'Business memory needs a database update first (COLVY_V353_AGENT_ENGINE.sql).' : msg || 'Couldn’t save to Business memory.' }, { status: 500 })
      }
      await db.from('ai_unanswered').update({ status: 'answered' }).eq('id', row.id).eq('company_id', companyId)
      return NextResponse.json({ ok: true })
    }
    if (b.action === 'dismiss' || b.action === 'reopen') {
      const { error } = await db.from('ai_unanswered').update({ status: b.action === 'dismiss' ? 'dismissed' : 'open' })
        .eq('id', String(b.id || '')).eq('company_id', companyId)
      if (error) return NextResponse.json({ error: /ai_unanswered/.test(error.message) ? 'Run the COLVY_V327 database update in Supabase first.' : error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}
