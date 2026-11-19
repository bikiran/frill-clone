import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireCompanyAccess } from '@/lib/company-access'
import { creditLink } from '@/lib/link-stitch'
import { parsePrice, priceText } from '@/lib/listings'
import { LISTING_COLS, companySlug, listingStats, pageUrlFor } from '@/lib/listings-server'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

type Ctx = { params: Promise<{ id: string }> }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * POST /api/listings/<id>/sold
 *   { companyId, conversationId?, price? }   sold (to the customer in that conversation, if given)
 *   { companyId, undo: true }                not sold after all: back up for sale (and a
 *                                            note in the buyer’s chat)
 *
 * A sale counts once on the listing's link: a payment taken in Colvy for it
 * already counts (lib/listings-server creditListingPayment), so marking the
 * same buyer as sold doesn't add a second sale. Cash at pickup and bank
 * transfers are counted here, at the price it sold for.
 */
export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const companyId = body?.companyId
  const db = admin()
  const access = await requireCompanyAccess(req, db, companyId)
  if (!access.ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  if (!UUID.test(id)) return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
  const { data: l } = await db.from('listings').select(LISTING_COLS).eq('id', id).eq('company_id', companyId).maybeSingle()
  if (!l) return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
  const saleKey = `sold_${l.id}`

  if (body.undo) {
    await db.from('listings').update({
      status: 'active', sold_at: null, sold_price_cents: null, sold_contact_id: null, sold_conversation_id: null,
      updated_by: access.userId || null, updated_at: new Date().toISOString(),
    }).eq('id', l.id).eq('company_id', companyId)
    if (l.short_link_id) await db.from('link_conversions').delete().eq('link_id', l.short_link_id).eq('order_id', saleKey).eq('stage', 'paid')
    // The buyer's chat said "Marked as sold"; say it's back up for sale there
    // too, so the thread isn't left saying it went (once, if undone twice).
    if (l.status === 'sold' && l.sold_conversation_id) {
      await db.from('messages').insert({
        conversation_id: l.sold_conversation_id, company_id: companyId, sender_type: 'system',
        content: `Not sold after all: “${l.title}” is back up for sale`,
        metadata: { kind: 'listing_unsold', listing_id: l.id },
      })
    }
  } else {
    let conv: any = null
    if (body.conversationId) {
      if (!UUID.test(String(body.conversationId))) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
      const { data } = await db.from('conversations').select('id, company_id, contact_id').eq('id', body.conversationId).maybeSingle()
      if (!data || data.company_id !== companyId) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
      conv = data
    }
    const asked = body.price === undefined || body.price === null || body.price === '' ? null : parsePrice(body.price)
    if (body.price !== undefined && body.price !== null && body.price !== '' && asked === null) return NextResponse.json({ error: 'The price doesn’t look right.' }, { status: 400 })
    const price = asked ?? l.price_cents
    const contactId = conv?.contact_id || null
    await db.from('listings').update({
      status: 'sold', sold_at: new Date().toISOString(), sold_price_cents: price,
      sold_contact_id: contactId, sold_conversation_id: conv?.id || null,
      updated_by: access.userId || null, updated_at: new Date().toISOString(),
    }).eq('id', l.id).eq('company_id', companyId)

    if (l.short_link_id) {
      // Already paid through Colvy by this buyer? That payment is the sale.
      const { data: paid } = await db.from('link_conversions').select('order_id, contact_id').eq('link_id', l.short_link_id).eq('stage', 'paid').limit(200)
      const counted = (paid || []).some((r: any) => r.order_id !== saleKey && contactId && r.contact_id === contactId)
      await db.from('link_conversions').delete().eq('link_id', l.short_link_id).eq('order_id', saleKey).eq('stage', 'paid')
      if (!counted) {
        await creditLink(db, {
          company_id: companyId, link_id: l.short_link_id, contact_id: contactId,
          order_id: saleKey, order_number: l.code, stage: 'paid',
          revenue: Math.max(0, Number(price) || 0) / 100, currency: l.currency || 'aud',
          converted_at: new Date().toISOString(),
        })
      }
    }
    if (conv) {
      const p = priceText(price, l.currency)
      await db.from('messages').insert({
        conversation_id: conv.id, company_id: companyId, sender_type: 'system',
        content: `Marked as sold: “${l.title}”${p ? ` for ${p}` : ''}`,
        metadata: { kind: 'listing_sold', listing_id: l.id },
      })
    }
  }

  const { data: fresh } = await db.from('listings').select(LISTING_COLS).eq('id', l.id).maybeSingle()
  const slug = await companySlug(db, companyId)
  const stats = await listingStats(db, companyId, [fresh])
  return NextResponse.json({ listing: { ...fresh, url: slug ? pageUrlFor(slug, fresh.code) : null, stats: stats[fresh.id] } })
}
