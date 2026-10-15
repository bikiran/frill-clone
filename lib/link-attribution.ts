import { createClient } from '@supabase/supabase-js'
import { creditLink, findCompanyClick } from '@/lib/link-stitch'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

/** How long after a click an order still counts as influenced by it. */
const ATTRIBUTION_WINDOW_DAYS = 7

/**
 * Credit an order to the links a contact clicked shortly beforehand.
 *
 * MODEL: last-touch attribution by contact. If this contact clicked a tracked
 * link within the attribution window before ordering, that link is credited.
 * Only the MOST RECENT click is credited, so revenue isn't multiplied across
 * every link they ever opened.
 *
 * This is "revenue influenced", not "revenue caused" — it can't see anonymous
 * browsing, and it will credit a link even if the customer would have ordered
 * anyway. Reports label it accordingly.
 *
 * Best-effort throughout: an attribution failure must never break order
 * processing.
 */
export async function attributeOrderToLinks(opts: {
  companyId: string
  contactId?: string | null
  orderId: string | number
  orderNumber?: string | number | null
  total?: number | string | null
  currency?: string | null
  stage: 'created' | 'paid' | 'cart' | 'checkout'
  orderDate?: string | null
}) {
  const { companyId, contactId, orderId, orderNumber, total, currency, stage } = opts
  if (!companyId || !contactId || !orderId) return

  try {
    const db = admin()
    const orderedAt = opts.orderDate ? new Date(opts.orderDate) : new Date()
    const since = new Date(orderedAt.getTime() - ATTRIBUTION_WINDOW_DAYS * 86400000).toISOString()

    // Most recent click by this contact inside the window.
    const { data: clicks } = await db
      .from('link_clicks')
      .select('link_id, clicked_at')
      .eq('company_id', companyId)
      .eq('contact_id', contactId)
      .gte('clicked_at', since)
      .lte('clicked_at', orderedAt.toISOString())
      .order('clicked_at', { ascending: false })
      .limit(1)

    const click = clicks?.[0]
    if (!click) return

    await db.from('link_conversions').upsert({
      company_id: companyId,
      link_id: click.link_id,
      contact_id: contactId,
      order_id: String(orderId),
      order_number: orderNumber != null ? String(orderNumber) : null,
      stage,
      revenue: Number(total) || 0,
      currency: currency || 'AUD',
      clicked_at: click.clicked_at,
      converted_at: orderedAt.toISOString(),
    }, { onConflict: 'link_id,order_id,stage' })
  } catch {
    // Attribution is analytics only — never let it affect the order flow.
  }
}

/**
 * Credit a confirmed booking to the link that led to it.
 *
 * Which link, in order:
 *   1. the one it's already credited to (a booking stays with one link, so the
 *      'paid' row follows the 'booking' row when payment lands later);
 *   2. the click the booking page was opened through (?clv=, stored on the
 *      booking as source_click_id) — only if that click is this company's;
 *   3. otherwise, like orders: the contact's most recent click on any tracked
 *      link in the 7 days before booking.
 *
 * Writes 'booking' (order id book_<id>) and, when paid, a 'paid' row carrying
 * the money taken online (the deposit or the full price — what a refund gives
 * back), so revenue totals that already add up 'paid' rows include it. Same
 * "revenue influenced" model as attributeOrderToLinks.
 * Returns the credited link id, or null. Never throws.
 */
export async function attributeBookingToLinks(opts: {
  companyId: string
  contactId?: string | null
  bookingId: string
  /** What was paid online for the booking (bookings.amount_due_cents). */
  paidCents?: number | null
  paid?: boolean
  currency?: string | null
  bookedAt?: string | null
  clickRef?: string | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db?: any
}): Promise<string | null> {
  const { companyId, contactId, bookingId } = opts
  if (!companyId || !bookingId) return null
  try {
    const db = opts.db || admin()
    const orderId = `book_${bookingId}`
    const bookedAt = opts.bookedAt && Number.isFinite(Date.parse(opts.bookedAt)) ? new Date(opts.bookedAt) : new Date()

    let linkId: string | null = null
    let clickedAt: string | null = null

    const { data: prior } = await db.from('link_conversions')
      .select('link_id, clicked_at').eq('company_id', companyId).eq('order_id', orderId).eq('stage', 'booking').limit(1)
    if (prior?.[0]?.link_id) { linkId = prior[0].link_id; clickedAt = prior[0].clicked_at || null }

    if (!linkId && opts.clickRef) {
      const click = await findCompanyClick(db, companyId, opts.clickRef, bookedAt.getTime())
      if (click) { linkId = click.link_id; clickedAt = click.clicked_at }
    }

    if (!linkId && contactId) {
      const since = new Date(bookedAt.getTime() - ATTRIBUTION_WINDOW_DAYS * 86400000).toISOString()
      const { data: clicks } = await db.from('link_clicks')
        .select('link_id, clicked_at')
        .eq('company_id', companyId)
        .eq('contact_id', contactId)
        .gte('clicked_at', since)
        .lte('clicked_at', bookedAt.toISOString())
        .order('clicked_at', { ascending: false })
        .limit(1)
      if (clicks?.[0]?.link_id) { linkId = clicks[0].link_id; clickedAt = clicks[0].clicked_at }
    }
    if (!linkId) return null

    const base = {
      company_id: companyId, link_id: linkId, contact_id: contactId || null, order_id: orderId,
      currency: opts.currency || 'AUD', clicked_at: clickedAt, converted_at: bookedAt.toISOString(),
    }
    await creditLink(db, { ...base, stage: 'booking', revenue: 0 })
    if (opts.paid) await creditLink(db, { ...base, stage: 'paid', revenue: Math.max(0, Number(opts.paidCents) || 0) / 100, converted_at: new Date().toISOString() })
    return linkId
  } catch {
    return null
  }
}
