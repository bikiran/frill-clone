import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireCompanyAccess } from '@/lib/company-access'
import { guardAiRequest } from '@/lib/rate-limit'
import { answerFromKnowledge } from '@/lib/ai-knowledge'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// POST { companyId, question } → how Colvy AI would answer, and which sources it used.
export async function POST(req: NextRequest) {
  try {
    const db = admin()
    const b = await req.json().catch(() => ({}))
    const companyId = String(b.companyId || '')
    if (!(await requireCompanyAccess(req, db, companyId)).ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    const question = String(b.question || '').trim()
    if (!question) return NextResponse.json({ error: 'Type a question to test.' }, { status: 400 })
    const guard = await guardAiRequest(req, companyId, 'ai_knowledge_test')
    if (!guard.ok) return guard.response!
    const r = await answerFromKnowledge(db, companyId, question)
    if ('error' in r) return NextResponse.json({ error: r.error }, { status: 422 })
    return NextResponse.json(r)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}
