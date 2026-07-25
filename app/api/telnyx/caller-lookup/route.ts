import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Resolves an inbound caller's name for a phone number, using the SERVICE ROLE
// so it works from the mobile app's headless push context — where the device
// has no authenticated session and an RLS-protected `contacts` read comes back
// empty, which is why saved contacts were ringing through as "unknown". Also
// covers WooCommerce customers and guest-checkout orders so a shopper who was
// never added to the address book still shows a name.

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Trailing 9 digits are the stable key across +61452372246 / 0452 372 246 / etc.
const tail = (s?: string | null) => (s || '').replace(/\D/g, '').slice(-9)

async function resolveName(db: ReturnType<typeof admin>, companyId: string, number: string) {
  const t = tail(number)
  if (!t) return null

  // 1. Saved contact — the address book wins.
  try {
    const { data } = await db.from('contacts')
      .select('id, name, phone').eq('company_id', companyId).not('phone', 'is', null).limit(1000)
    const hit = (data || []).find((c: any) => tail(c.phone) === t)
    if (hit?.name) return { name: hit.name as string, contactId: hit.id as string, source: 'contact' }
  } catch {}

  // 2. WooCommerce customer by phone.
  try {
    const { data } = await db.from('woocommerce_customers')
      .select('first_name, last_name, phone').eq('company_id', companyId).not('phone', 'is', null).limit(1000)
    const hit = (data || []).find((c: any) => tail(c.phone) === t)
    const nm = hit ? `${hit.first_name || ''} ${hit.last_name || ''}`.trim() : ''
    if (nm) return { name: nm, source: 'woo_customer' }
  } catch {}

  // 3. WooCommerce order billing — the normalised column is indexed, so this is
  //    a cheap exact lookup that catches guest checkouts with no customer row.
  try {
    const { data } = await db.from('woocommerce_orders')
      .select('billing').eq('company_id', companyId).eq('billing_phone_norm', t)
      .order('created_at', { ascending: false }).limit(1)
    const b = (data || [])[0]?.billing
    const nm = b ? `${b.first_name || ''} ${b.last_name || ''}`.trim() : ''
    if (nm) return { name: nm, source: 'woo_order' }
  } catch {}

  return null
}

async function handle(companyId: string | null, number: string | null) {
  if (!companyId || !number) {
    return NextResponse.json({ error: 'missing companyId or number' }, { status: 400 })
  }
  try {
    const hit = await resolveName(admin(), companyId, number)
    return NextResponse.json(hit || { name: null })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'lookup failed' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  return handle(url.searchParams.get('companyId'), url.searchParams.get('number'))
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  return handle(body?.companyId || null, body?.number || null)
}
