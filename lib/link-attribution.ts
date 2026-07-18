import { createClient } from '@supabase/supabase-js'

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
