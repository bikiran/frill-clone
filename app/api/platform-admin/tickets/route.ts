import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SUPER_ADMIN = 'bishalstha76@gmail.com'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function requireSuperAdmin(req: NextRequest, db: any): Promise<boolean> {
  try {
    const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
    if (!token) return false
    const { data } = await db.auth.getUser(token)
    return data?.user?.email === SUPER_ADMIN
  } catch { return false }
}

// GET: all support tickets across every company, with company + contact context.
export async function GET(req: NextRequest) {
  try {
    const db = admin()
    if (!(await requireSuperAdmin(req, db))) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })

    const { data: tickets } = await db.from('support_tickets').select('*').order('created_at', { ascending: false }).limit(500)

    const companyIds = Array.from(new Set((tickets || []).map((t: any) => t.company_id).filter(Boolean)))
    const contactIds = Array.from(new Set((tickets || []).map((t: any) => t.contact_id).filter(Boolean)))

    const [{ data: companies }, { data: contacts }] = await Promise.all([
      companyIds.length ? db.from('companies').select('id, name, slug').in('id', companyIds) : Promise.resolve({ data: [] }),
      contactIds.length ? db.from('contacts').select('id, name, email').in('id', contactIds) : Promise.resolve({ data: [] }),
    ])
    const coMap: Record<string, any> = {}; (companies || []).forEach((c: any) => coMap[c.id] = c)
    const ctMap: Record<string, any> = {}; (contacts || []).forEach((c: any) => ctMap[c.id] = c)

    const result = (tickets || []).map((t: any) => ({
      id: t.id, ticket_number: t.ticket_number, subject: t.subject, description: t.description,
      priority: t.priority || 'normal', status: t.status || 'open',
      created_at: t.created_at, updated_at: t.updated_at,
      company: coMap[t.company_id] || null,
      contact: ctMap[t.contact_id] || null,
      conversation_id: t.conversation_id || null,
    }))

    // Status counts for the summary chips.
    const counts: Record<string, number> = { open: 0, in_progress: 0, resolved: 0, closed: 0 }
    result.forEach((t: any) => { counts[t.status] = (counts[t.status] || 0) + 1 })

    return NextResponse.json({ tickets: result, counts, total: result.length })
  } catch (err: any) {
    return NextResponse.json({ error: err.message, tickets: [] }, { status: 500 })
  }
}

// PATCH: update a ticket's status from the platform admin.
export async function PATCH(req: NextRequest) {
  try {
    const db = admin()
    if (!(await requireSuperAdmin(req, db))) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    const { ticketId, status } = await req.json()
    if (!ticketId || !status) return NextResponse.json({ error: 'Missing ticketId or status' }, { status: 400 })
    const { error } = await db.from('support_tickets').update({ status, updated_at: new Date().toISOString() }).eq('id', ticketId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
