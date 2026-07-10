import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { TelnyxService } from '@/lib/telnyx-service'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Colvy's platform-level Telnyx account. Companies never create their own —
// Colvy provisions numbers on their behalf through this master account.
const PLATFORM_KEY = process.env.TELNYX_MASTER_API_KEY
const PLATFORM_MESSAGING_PROFILE = process.env.TELNYX_MESSAGING_PROFILE_ID
const PLATFORM_CONNECTION = process.env.TELNYX_CONNECTION_ID

// GET: search available AU numbers to show the user before they buy
export async function GET(req: NextRequest) {
  try {
    if (!PLATFORM_KEY) return NextResponse.json({ error: 'Number provisioning is not configured yet. The platform admin needs to set TELNYX_MASTER_API_KEY, TELNYX_MESSAGING_PROFILE_ID and TELNYX_CONNECTION_ID in the environment.' }, { status: 503 })
    const type = (req.nextUrl.searchParams.get('type') as any) || 'local'
    const areaCode = req.nextUrl.searchParams.get('areaCode') || undefined
    const city = req.nextUrl.searchParams.get('city') || undefined
    const svc = new TelnyxService(PLATFORM_KEY)
    const raw = await svc.searchAvailableNumbers({ country: 'AU', type, limit: 12, areaCode, locality: city })
    // Only return complete, dial-able E.164 AU numbers. Telnyx sometimes returns
    // reserved/partial entries (especially for mobile) that render as
    // "+61 468 --- ---" — filter those out so the buyer never sees a blank.
    const isComplete = (pn: string) => {
      if (!pn) return false
      const d = pn.replace(/^\+61/, '').replace(/\D/g, '')
      return d.length === 9 // AU national numbers are 9 digits after +61
    }
    const numbers = raw
      .filter((n: any) => isComplete(n.phone_number))
      .slice(0, 6)
      .map((n: any) => ({
        phone_number: n.phone_number,
        region: n.region_information?.find((r: any) => r.region_type === 'location')?.region_name
          || n.region_information?.[0]?.region_name
          || (n.phone_number.replace(/^\+61/, '').startsWith('4') ? 'MOBILE' : 'AU'),
        monthly: parseFloat(process.env.COLVY_NUMBER_PRICE_AUD || '15'), // Colvy's price to the customer (configurable)
      }))
    if (numbers.length === 0) {
      return NextResponse.json({ numbers: [], error: type === 'mobile'
        ? 'No mobile numbers are available from our provider right now — landline numbers work for both calls and SMS, or try again shortly.'
        : 'No numbers available right now — please try again shortly.' })
    }
    return NextResponse.json({ numbers })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// POST: buy a number and assign it to the company
export async function POST(req: NextRequest) {
  try {
    if (!PLATFORM_KEY) return NextResponse.json({ error: 'Number provisioning is not configured yet. The platform admin needs to set TELNYX_MASTER_API_KEY, TELNYX_MESSAGING_PROFILE_ID and TELNYX_CONNECTION_ID in the environment.' }, { status: 503 })
    const { companyId, phoneNumber, stripeSubscriptionId } = await req.json()
    if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })

    const db = admin()
    const svc = new TelnyxService(PLATFORM_KEY)

    // If no specific number requested, grab the first available AU local number
    let numberToBuy = phoneNumber
    if (!numberToBuy) {
      const available = await svc.searchAvailableNumbers({ country: 'AU', type: 'local', limit: 1 })
      numberToBuy = available?.[0]?.phone_number
      if (!numberToBuy) return NextResponse.json({ error: 'No Australian numbers available right now — try again shortly' }, { status: 502 })
    }

    // 1. Order the number, assigning platform messaging profile + connection
    const order = await svc.orderNumber(numberToBuy, {
      messaging_profile_id: PLATFORM_MESSAGING_PROFILE,
      connection_id: PLATFORM_CONNECTION,
    })
    const orderId = order?.data?.id

    // 2. Belt-and-braces: ensure the number is configured (ordering doesn't
    //    always attach the connection depending on account settings)
    try {
      const pnId = await svc.getPhoneNumberId(numberToBuy)
      if (pnId) {
        await svc.configureNumber(pnId, {
          messaging_profile_id: PLATFORM_MESSAGING_PROFILE,
          connection_id: PLATFORM_CONNECTION,
        })
      }
    } catch (e) {
      console.warn('Number config warning (non-fatal):', e)
    }

    // 3. Store on the company's integration row — using the PLATFORM key so
    //    calls/SMS work without the company ever touching Telnyx.
    const payload = {
      company_id: companyId,
      phone_number: numberToBuy,
      api_key: PLATFORM_KEY,
      messaging_profile_id: PLATFORM_MESSAGING_PROFILE || null,
      connection_id: PLATFORM_CONNECTION || null,
      provisioned_by_colvy: true,
      number_order_id: orderId || null,
      monthly_cost: 2,
      provisioned_at: new Date().toISOString(),
      is_active: true,
      updated_at: new Date().toISOString(),
      ...(stripeSubscriptionId ? { stripe_subscription_id: stripeSubscriptionId } : {}),
    }
    const { data: existing } = await db.from('telnyx_integrations').select('id').eq('company_id', companyId).maybeSingle()
    if (existing) await db.from('telnyx_integrations').update(payload).eq('company_id', companyId)
    else await db.from('telnyx_integrations').insert(payload)

    return NextResponse.json({ ok: true, phoneNumber: numberToBuy })
  } catch (err: any) {
    console.error('Number provisioning error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
