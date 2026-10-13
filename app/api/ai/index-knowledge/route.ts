import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireCompanyAccess } from '@/lib/company-access'
import { rebuildKnowledge } from '@/lib/ai-knowledge'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// Rebuild what the AI knows from the company's OWN material (see lib/ai-knowledge).
// Kept for the AI settings page; the Knowledge page uses /api/ai/knowledge.
export async function POST(req: NextRequest) {
  try {
    const db = admin()
    const { companyId } = await req.json().catch(() => ({}))
    if (!(await requireCompanyAccess(req, db, companyId)).ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    const r = await rebuildKnowledge(db, companyId)
    return NextResponse.json({ ok: true, indexed: r.total, counts: r.counts })
  } catch (e: any) {
    const msg = String(e?.message || '')
    if (/ON CONFLICT|unique or exclusion/i.test(msg)) return NextResponse.json({ error: 'Run the COLVY_V326 database update in Supabase first.' }, { status: 409 })
    return NextResponse.json({ error: msg || 'Failed' }, { status: 500 })
  }
}

// GET → what's currently indexed
export async function GET(req: NextRequest) {
  try {
    const db = admin()
    const companyId = req.nextUrl.searchParams.get('companyId')
    if (!(await requireCompanyAccess(req, db, companyId)).ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    // A count and the newest row, rather than downloading the library to count it.
    const [{ count }, { data: newest }] = await Promise.all([
      db.from('ai_knowledge').select('id', { count: 'exact', head: true }).eq('company_id', companyId),
      db.from('ai_knowledge').select('indexed_at').eq('company_id', companyId).order('indexed_at', { ascending: false }).limit(1),
    ])
    return NextResponse.json({ total: count || 0, lastIndexedAt: newest?.[0]?.indexed_at || null })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
