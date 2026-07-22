import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const uuidOrNull = (v: any): string | null =>
  (typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) ? v : null

/**
 * POST /api/shipments/create
 *
 * Records a tracking link that was sent to a customer. Best-effort: if the
 * shipments table hasn't been migrated yet this returns ok:false rather than
 * failing the send, because the customer has already received their link.
 */
export async function POST(req: NextRequest) {
  try {
    const b = await req.json()
    if (!b.companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 })

    const db = admin()
    const { error } = await db.from('shipments').insert({
      company_id: b.companyId,
      conversation_id: uuidOrNull(b.conversationId),
      contact_id: uuidOrNull(b.contactId),
      order_id: b.orderId != null ? String(b.orderId) : null,
      carrier: b.carrier || null,
      carrier_label: b.carrierLabel || null,
      tracking_number: b.trackingNumber || null,
      tracking_url: b.trackingUrl || null,
      short_code: b.shortCode || null,
      sent_by: b.sentBy || null,
    })
    if (error) return NextResponse.json({ ok: false, error: error.message })

    // Tag the short link so link reports can group tracking links together.
    if (b.shortCode) {
      try {
        await db.from('short_links').update({ link_type: 'tracking' })
          .eq('code', b.shortCode).eq('company_id', b.companyId)
      } catch { /* optional */ }
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message })
  }
}
