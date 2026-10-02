import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireCompanyAccess } from '@/lib/company-access'
import { cleanService, isMissingBookingSchema, MIGRATION_HINT } from '@/lib/booking'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// Bookable services.
// GET    ?companyId=
// POST   { companyId, service: {id?, …} }   → create / update
// POST   { companyId, order: [id, …] }      → reorder
// DELETE ?companyId=&id=                     → delete (archived instead if it has bookings)
export async function GET(req: NextRequest) {
  try {
    const db = admin()
    const companyId = req.nextUrl.searchParams.get('companyId')
    if (!(await requireCompanyAccess(req, db, companyId)).ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    const { data, error } = await db.from('booking_services').select('*').eq('company_id', companyId).order('sort_order').order('created_at')
    if (error) {
      if (isMissingBookingSchema(error)) return NextResponse.json({ services: [], setupNeeded: true, hint: MIGRATION_HINT })
      throw error
    }
    return NextResponse.json({ services: data || [] })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const db = admin()
    const body = await req.json().catch(() => ({}))
    const companyId = String(body.companyId || '')
    if (!(await requireCompanyAccess(req, db, companyId)).ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })

    if (Array.isArray(body.order)) {
      for (let i = 0; i < body.order.length && i < 200; i++) {
        await db.from('booking_services').update({ sort_order: i }).eq('id', body.order[i]).eq('company_id', companyId)
      }
      return NextResponse.json({ ok: true })
    }

    let row: Record<string, any>
    try { row = cleanService(body.service || {}) } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 400 }) }
    const id = body.service?.id ? String(body.service.id) : null

    // Keep the link slug unique within the company.
    const { data: taken } = await db.from('booking_services').select('id, slug').eq('company_id', companyId).like('slug', `${row.slug}%`)
    const others = new Set((taken || []).filter((t: any) => t.id !== id).map((t: any) => t.slug))
    if (others.has(row.slug)) { let n = 2; while (others.has(`${row.slug}-${n}`)) n++; row.slug = `${row.slug}-${n}` }

    const res = id
      ? await db.from('booking_services').update({ ...row, updated_at: new Date().toISOString() }).eq('id', id).eq('company_id', companyId).select('*').maybeSingle()
      : await db.from('booking_services').insert({ ...row, company_id: companyId }).select('*').maybeSingle()
    if (res.error) {
      if (isMissingBookingSchema(res.error)) return NextResponse.json({ error: MIGRATION_HINT }, { status: 400 })
      return NextResponse.json({ error: res.error.message }, { status: 400 })
    }
    return NextResponse.json({ ok: true, service: res.data })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const db = admin()
    const sp = req.nextUrl.searchParams
    const companyId = sp.get('companyId'), id = sp.get('id')
    if (!(await requireCompanyAccess(req, db, companyId)).ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    const { count } = await db.from('bookings').select('id', { count: 'exact', head: true }).eq('service_id', id).eq('company_id', companyId)
    if (count) {
      await db.from('booking_services').update({ active: false }).eq('id', id).eq('company_id', companyId)
      return NextResponse.json({ ok: true, archived: true })
    }
    await db.from('booking_services').delete().eq('id', id).eq('company_id', companyId)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}
