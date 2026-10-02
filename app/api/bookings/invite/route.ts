import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireCompanyAccess } from '@/lib/company-access'
import { loadCompanyPublic, createInvite, bookingPageUrl, MIGRATION_HINT_V324 } from '@/lib/booking'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// POST { companyId, conversationId?, contactId?, serviceId? } → { url }
// A personal booking link for one customer (sent from the inbox): their
// details are pre-filled and the booking lands in their conversation.
export async function POST(req: NextRequest) {
  try {
    const db = admin()
    const b = await req.json().catch(() => ({}))
    const companyId = String(b.companyId || '')
    const access = await requireCompanyAccess(req, db, companyId)
    if (!access.ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    const company = await loadCompanyPublic(db, { id: companyId })
    if (!company?.slug) return NextResponse.json({ error: 'Set up your workspace address first.' }, { status: 400 })

    let contactId: string | null = b.contactId || null
    const conversationId: string | null = b.conversationId || null
    if (conversationId) {
      const { data: conv } = await db.from('conversations').select('id, contact_id').eq('id', conversationId).eq('company_id', companyId).maybeSingle()
      if (!conv) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
      contactId = contactId || conv.contact_id || null
    }
    if (contactId) {
      const { data: c } = await db.from('contacts').select('id').eq('id', contactId).eq('company_id', companyId).maybeSingle()
      if (!c) contactId = null
    }
    let serviceSlug: string | undefined
    if (b.serviceId) {
      const { data: svc } = await db.from('booking_services').select('id, slug, active').eq('id', b.serviceId).eq('company_id', companyId).maybeSingle()
      if (!svc?.active) return NextResponse.json({ error: 'That service is hidden or deleted.' }, { status: 400 })
      serviceSlug = svc.slug
    }
    let inv: any
    try {
      inv = await createInvite(db, { companyId, contactId, conversationId, serviceId: b.serviceId || null, userId: access.userId || null })
    } catch (e: any) {
      const missing = /booking_invites|schema cache|does not exist/i.test(String(e?.message))
      return NextResponse.json({ error: missing ? MIGRATION_HINT_V324 : (e?.message || 'Failed') }, { status: 400 })
    }
    return NextResponse.json({ ok: true, url: `${bookingPageUrl(company, serviceSlug)}?i=${inv.token}` })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}
