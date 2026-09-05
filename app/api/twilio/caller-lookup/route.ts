import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const tail9 = (s: any) => String(s || '').replace(/\D/g, '').slice(-9)

async function memberOf(db: any, uid: string | null, companyId: string): Promise<boolean> {
  if (!uid || !companyId) return false
  const { data: owned } = await db.from('companies').select('id').eq('id', companyId).eq('owner_id', uid).maybeSingle()
  if (owned) return true
  const { data: member } = await db.from('team_members').select('id').eq('company_id', companyId).eq('user_id', uid).maybeSingle()
  return !!member
}

/**
 * Who is calling? GET ?companyId=&number= → { name }
 *
 * The mobile app asks this while presenting an incoming call. It matters most
 * when the app has been swiped away: the push wakes a headless JS context that
 * has to ring within a second or two, and the only thing it can put on the lock
 * screen is whatever this returns. Until now the app called this route and got
 * a 404, because it was never built — every killed-app call rang as a bare
 * number.
 *
 * Runs with the service role so it can see past row-level security, and covers
 * the three places a name can live: the CRM contact, a WooCommerce customer,
 * and the billing name on a WooCommerce order (which is the only record a guest
 * checkout leaves behind).
 */
export async function GET(req: NextRequest) {
  try {
    const db = admin()
    const url = new URL(req.url)
    const companyId = url.searchParams.get('companyId') || ''
    const number = url.searchParams.get('number') || ''
    if (!companyId || !number) {
      return NextResponse.json({ error: 'companyId and number required' }, { status: 400 })
    }

    // The caller's own identity, not the phone number's. A name lookup keyed on
    // a phone number is a disclosure of the company's contact list, so it is
    // limited to someone who already has access to that company.
    const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
    const { data: who } = token ? await db.auth.getUser(token) : { data: null as any }
    if (!(await memberOf(db, who?.user?.id || null, companyId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const tail = tail9(number)
    if (!tail) return NextResponse.json({ name: null })

    // Narrow on the trailing digits in the query, then confirm exactly: ilike
    // ignores the formatting on either side, so "+61 452 372 246" and
    // "0452372246" both reach the same row, but a substring match alone could
    // land on a longer number that merely contains those digits.
    const { data: contacts } = await db.from('contacts')
      .select('name, phone').eq('company_id', companyId).ilike('phone', `%${tail}%`).limit(10)
    const contact = (contacts || []).find((c: any) => tail9(c.phone) === tail)
    if (contact?.name) return NextResponse.json({ name: contact.name, source: 'contact' })

    // WooCommerce customer. phone_norm is already the last nine digits and is
    // indexed, so this is an equality match rather than a scan.
    const { data: customers } = await db.from('woocommerce_customers')
      .select('first_name, last_name').eq('company_id', companyId).eq('phone_norm', tail).limit(1)
    const cust = (customers || [])[0]
    const custName = [cust?.first_name, cust?.last_name].filter(Boolean).join(' ').trim()
    if (custName) return NextResponse.json({ name: custName, source: 'woocommerce_customer' })

    // A guest checkout creates no customer record, so the billing name on the
    // most recent order is the last place the caller can be recognised.
    const { data: orders } = await db.from('woocommerce_orders')
      .select('billing').eq('company_id', companyId).eq('billing_phone_norm', tail)
      .order('order_date', { ascending: false }).limit(1)
    const billing = (orders || [])[0]?.billing || {}
    const orderName = [billing.first_name, billing.last_name].filter(Boolean).join(' ').trim()
    if (orderName) return NextResponse.json({ name: orderName, source: 'woocommerce_order' })

    return NextResponse.json({ name: null })
  } catch (e: any) {
    // Never fail the call. The app rings with the number when this returns
    // nothing, which is strictly better than delaying or dropping the ring.
    return NextResponse.json({ name: null, error: e?.message || String(e) })
  }
}
