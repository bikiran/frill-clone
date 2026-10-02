import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireCompanyAccess } from '@/lib/company-access'
import { guardAiRequest } from '@/lib/rate-limit'
import { draftReply } from '@/lib/ai-draft'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// POST { companyId, conversationId? | ticketId?, instruction?, previousDraft? } → an AI draft
// of the next reply, for a staff member to review and send. Team members only
// (it reads the customer's orders); AI plan + daily limit enforced by the guard.
export async function POST(req: NextRequest) {
  try {
    const db = admin()
    const b = await req.json().catch(() => ({}))
    const companyId = String(b.companyId || '')
    if (!(await requireCompanyAccess(req, db, companyId)).ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    const guard = await guardAiRequest(req, companyId, 'ai_draft')
    if (!guard.ok) return guard.response!
    if (!b.conversationId && !b.ticketId) return NextResponse.json({ error: 'conversationId or ticketId required' }, { status: 400 })

    const r = await draftReply(db, {
      companyId,
      conversationId: b.conversationId || null,
      ticketId: b.ticketId || null,
      instruction: b.instruction ? String(b.instruction) : null,
      previousDraft: b.previousDraft ? String(b.previousDraft) : null,
    })
    if ('error' in r) return NextResponse.json({ error: r.error }, { status: 422 })
    return NextResponse.json(r)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}
