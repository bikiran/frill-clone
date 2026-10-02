import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireCompanyAccess } from '@/lib/company-access'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const STATUSES = ['open', 'in_progress', 'resolved', 'closed']
const PRIORITIES = ['low', 'normal', 'high', 'urgent']

// PATCH { status?, priority?, assigned_to? } — change a ticket. Keeps the
// deadline timestamps right: resolving stamps resolved_at, reopening clears it.
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const db = admin()
    const { data: ticket } = await db.from('support_tickets').select('id, company_id, status, resolved_at').eq('id', id).maybeSingle()
    if (!ticket) return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
    if (!(await requireCompanyAccess(req, db, ticket.company_id)).ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })

    const b = await req.json().catch(() => ({}))
    const patch: any = { updated_at: new Date().toISOString() }

    if (b.status !== undefined) {
      if (!STATUSES.includes(b.status)) return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
      patch.status = b.status
      if (['resolved', 'closed'].includes(b.status)) { if (!ticket.resolved_at) patch.resolved_at = patch.updated_at }
      else patch.resolved_at = null
    }
    if (b.priority !== undefined) {
      if (!PRIORITIES.includes(b.priority)) return NextResponse.json({ error: 'Invalid priority' }, { status: 400 })
      patch.priority = b.priority
    }
    if (b.assigned_to !== undefined) {
      if (b.assigned_to === null || b.assigned_to === '') patch.assigned_to = null
      else {
        // Only someone in this company: a teammate or the owner.
        const uid = String(b.assigned_to)
        const { data: tm } = await db.from('team_members').select('id').eq('company_id', ticket.company_id).eq('user_id', uid).limit(1)
        const { data: co } = await db.from('companies').select('owner_id').eq('id', ticket.company_id).maybeSingle()
        if (!tm?.length && co?.owner_id !== uid) return NextResponse.json({ error: 'That person isn’t on this team' }, { status: 400 })
        patch.assigned_to = uid
      }
    }

    let { data, error } = await db.from('support_tickets').update(patch).eq('id', id).select('*').maybeSingle()
    // Before migration V322, resolved_at doesn't exist yet — save the rest.
    if (error && /resolved_at|schema cache|could not find/i.test(error.message)) {
      delete patch.resolved_at
      ;({ data, error } = await db.from('support_tickets').update(patch).eq('id', id).select('*').maybeSingle())
    }
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, ticket: data })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}
