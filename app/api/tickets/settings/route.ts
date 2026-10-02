import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireCompanyAccess } from '@/lib/company-access'
import { resolveSla } from '@/lib/ticket-sla'
import { loadTicketTeam } from '@/lib/ticket-assign'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// GET ?companyId= — deadline settings + the assignable team (ticket page sidebar).
export async function GET(req: NextRequest) {
  try {
    const db = admin()
    const companyId = req.nextUrl.searchParams.get('companyId')
    if (!(await requireCompanyAccess(req, db, companyId)).ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    const { data: co } = await db.from('companies').select('ticket_sla_settings').eq('id', companyId).maybeSingle()
    return NextResponse.json({ sla: resolveSla((co as any)?.ticket_sla_settings), team: await loadTicketTeam(db, String(companyId)) })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}

// PATCH { companyId, settings: { enabled?, first_response_hours?, resolution_hours?, auto_assign? } }
export async function PATCH(req: NextRequest) {
  try {
    const db = admin()
    const b = await req.json().catch(() => ({}))
    const companyId = String(b.companyId || '')
    if (!(await requireCompanyAccess(req, db, companyId)).ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    const clean = resolveSla({ ...(b.settings || {}) })
    const { error } = await db.from('companies').update({ ticket_sla_settings: clean }).eq('id', companyId)
    if (error) {
      const missing = /ticket_sla_settings|schema cache|could not find/i.test(error.message)
      return NextResponse.json({ error: missing ? 'Run migrations/COLVY_V322_TICKET_SLA.sql in Supabase, then try again.' : error.message }, { status: 400 })
    }
    return NextResponse.json({ ok: true, settings: clean })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}
