import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireCompanyAccess } from '@/lib/company-access'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// POST { companyId, id?, question, answer, unansweredId? } → create or update a fact.
export async function POST(req: NextRequest) {
  try {
    const db = admin()
    const b = await req.json().catch(() => ({}))
    const companyId = String(b.companyId || '')
    const access = await requireCompanyAccess(req, db, companyId)
    if (!access.ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    const question = String(b.question || '').trim().slice(0, 300)
    const answer = String(b.answer || '').trim().slice(0, 3000)
    if (!question || !answer) return NextResponse.json({ error: 'Add both a question and an answer.' }, { status: 400 })

    const q = b.id
      ? db.from('ai_facts').update({ question, answer, updated_at: new Date().toISOString() }).eq('id', String(b.id)).eq('company_id', companyId)
      : db.from('ai_facts').insert({ company_id: companyId, question, answer, created_by: access.userId || null })
    const { data, error } = await q.select('id, question, answer, updated_at').maybeSingle()
    if (error) return NextResponse.json({ error: /ai_facts/.test(error.message) ? 'Run the COLVY_V326 database update in Supabase first.' : error.message }, { status: 500 })
    // Answering an unanswered question closes it.
    if (b.unansweredId && data?.id) {
      try { await db.from('ai_unanswered').update({ status: 'answered', fact_id: data.id }).eq('id', String(b.unansweredId)).eq('company_id', companyId) } catch {}
    }
    return NextResponse.json({ ok: true, fact: data })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}

// DELETE { companyId, id }
export async function DELETE(req: NextRequest) {
  try {
    const db = admin()
    const b = await req.json().catch(() => ({}))
    const companyId = String(b.companyId || '')
    if (!(await requireCompanyAccess(req, db, companyId)).ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    const { error } = await db.from('ai_facts').delete().eq('id', String(b.id || '')).eq('company_id', companyId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}
