import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireCompanyAccess } from '@/lib/company-access'
import { guardAiRequest } from '@/lib/rate-limit'
import { scanRecentQuestions } from '@/lib/ai-unanswered'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// POST { companyId, action: 'scan' } → look back over recent conversations for unanswered questions.
// POST { companyId, action: 'dismiss' | 'reopen', id }
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
