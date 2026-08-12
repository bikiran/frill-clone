import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { PrextyService } from '@/lib/prexty-service'

export const dynamic = 'force-dynamic'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

/**
 * GET /api/prexty/customer?companyId=&email=&phone=&contactId=&conversationId=
 *
 * Looks up the chat contact's Prexty POS profile (spend, loyalty, store credit,
 * address) via the connected key. Match is by email, then phone. Returns
 * { connected, customer } — never the API key. Order history is not included
 * yet: Prexty's /api/v1/orders endpoint isn't live (the customer object still
 * carries aggregate totalOrders/totalSpent, which is what we surface for now).
 */
export async function GET(req: NextRequest) {
  try {
    const q = req.nextUrl.searchParams
    const companyId = q.get('companyId')
    if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })

    const db = admin()
    const { data: integ } = await db.from('prexty_integrations')
      .select('api_key, base_url, is_active').eq('company_id', companyId).maybeSingle()
    if (!integ?.api_key || integ.is_active === false) {
      return NextResponse.json({ connected: false, customer: null })
    }

    // Resolve the identifiers to match on: explicit email/phone win, else pull
    // them off the contact (directly, or via the conversation).
    let email = (q.get('email') || '').trim()
    let phone = (q.get('phone') || '').trim()
    let contactId = q.get('contactId')
    const conversationId = q.get('conversationId')

    if ((!email || !phone) && !contactId && conversationId) {
      const { data: conv } = await db.from('conversations')
        .select('contact_id, sms_number').eq('id', conversationId).maybeSingle()
      if (conv?.contact_id) contactId = conv.contact_id
      if (!phone && conv?.sms_number) phone = conv.sms_number
    }
    if ((!email || !phone) && contactId) {
      const { data: c } = await db.from('contacts')
        .select('email, phone').eq('id', contactId).maybeSingle()
      if (!email && c?.email) email = c.email
      if (!phone && c?.phone) phone = c.phone
    }

    if (!email && !phone) {
      return NextResponse.json({ connected: true, customer: null, reason: 'No email or phone to match on' })
    }

    const svc = new PrextyService({ baseUrl: integ.base_url, apiKey: integ.api_key })
    const customer = await svc.findCustomerByContact({ email, phone })

    // Best-effort: note that we synced (ignore failures).
    db.from('prexty_integrations').update({ last_synced_at: new Date().toISOString() }).eq('company_id', companyId).then(() => {}, () => {})

    // Cache the match on the contact so the conversation list can show a Prexty
    // indicator without a live lookup per row. Best-effort; only when it changed.
    if (contactId && customer?.id) {
      db.from('contacts').update({ prexty_customer_id: customer.id })
        .eq('id', contactId).is('prexty_customer_id', null).then(() => {}, () => {})
    }

    return NextResponse.json({ connected: true, customer })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Lookup failed' }, { status: 500 })
  }
}
