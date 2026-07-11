import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Normalize a variety of possible payload shapes (raw WooCommerce checkout, an
// abandonment plugin, or a custom snippet) into our columns.
function normalize(body: any) {
  const billing = body.billing || body.customer || {}
  const name = body.name || `${billing.first_name || ''} ${billing.last_name || ''}`.trim() || null
  const items = (body.items || body.line_items || body.cart || []).map((it: any) => ({
    product_id: it.product_id || it.id || null,
    variation_id: it.variation_id || null,
    name: it.name || it.product_name || 'Item',
    sku: it.sku || null,
    quantity: it.quantity || it.qty || 1,
    price: it.price || it.line_total || it.total || null,
  }))
  const address = {
    address_1: billing.address_1 || body.address || null,
    city: billing.city || null,
    state: billing.state || null,
    postcode: billing.postcode || null,
    country: billing.country || 'AU',
  }
  return {
    external_id: body.external_id || body.cart_id || body.session_id || null,
    name, email: body.email || billing.email || null, phone: body.phone || billing.phone || null,
    address,
    items,
    coupon: body.coupon || (Array.isArray(body.coupons) ? body.coupons[0] : null) || null,
    shipping: body.shipping_line || (body.shipping ? { method: body.shipping.method, label: body.shipping.label || body.shipping.method_title, cost: body.shipping.cost || body.shipping.total } : null),
    notes: body.notes || body.customer_note || null,
    subtotal: body.subtotal != null ? Number(body.subtotal) : null,
    total: body.total != null ? Number(body.total) : (items.reduce((s: number, it: any) => s + (parseFloat(it.price) || 0) * (it.quantity || 1), 0) || null),
    currency: body.currency || 'AUD',
    cart_url: body.cart_url || body.recovery_url || body.checkout_url || null,
  }
}

// POST: receive an abandoned cart from the store. Company id via header or ?company=.
export async function POST(req: NextRequest) {
  try {
    const companyId = req.headers.get('x-company-id') || req.nextUrl.searchParams.get('company')
    if (!companyId) return NextResponse.json({ error: 'Missing company id (x-company-id header or ?company=)' }, { status: 400 })
    const body = await req.json()
    const db = admin()

    // Recovery ping: the store tells us a previously-abandoned cart converted.
    if (req.nextUrl.searchParams.get('recovered') || body.status === 'recovered') {
      if (body.external_id) {
        await db.from('abandoned_carts')
          .update({ status: 'recovered', recovered_order_id: body.recovered_order_id || null, updated_at: new Date().toISOString() })
          .eq('company_id', companyId).eq('external_id', body.external_id)
      }
      return NextResponse.json({ ok: true, recovered: true })
    }

    const norm = normalize(body)
    if (!norm.email && !norm.phone) return NextResponse.json({ error: 'Cart needs at least an email or phone to be useful' }, { status: 400 })

    // Match to an existing contact so we can link a conversation later.
    let conversationId: string | null = null
    try {
      let contact: any = null
      if (norm.email) {
        const { data } = await db.from('contacts').select('id').eq('company_id', companyId).ilike('email', norm.email).limit(1)
        contact = data?.[0] || null
      }
      if (!contact && norm.phone) {
        const { data } = await db.from('contacts').select('id').eq('company_id', companyId).eq('phone', norm.phone).limit(1)
        contact = data?.[0] || null
      }
      if (contact?.id) {
        const { data: conv } = await db.from('conversations').select('id').eq('company_id', companyId).eq('contact_id', contact.id).order('last_message_at', { ascending: false }).limit(1)
        conversationId = conv?.[0]?.id || null
      }
    } catch {}

    const row: any = { company_id: companyId, ...norm, status: 'abandoned', conversation_id: conversationId, updated_at: new Date().toISOString() }

    // Upsert on external_id if provided, else insert.
    let saved: any = null
    if (norm.external_id) {
      const { data } = await db.from('abandoned_carts').upsert(row, { onConflict: 'company_id,external_id' }).select().maybeSingle()
      saved = data
    } else {
      const { data } = await db.from('abandoned_carts').insert(row).select().maybeSingle()
      saved = data
    }

    return NextResponse.json({ ok: true, id: saved?.id })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// GET: list abandoned carts for a company, or fetch by email/phone (for the chat).
export async function GET(req: NextRequest) {
  try {
    const companyId = req.nextUrl.searchParams.get('companyId')
    const email = req.nextUrl.searchParams.get('email')
    const phone = req.nextUrl.searchParams.get('phone')
    if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })
    const db = admin()

    let q = db.from('abandoned_carts').select('*').eq('company_id', companyId).eq('status', 'abandoned').order('created_at', { ascending: false })
    if (email) q = q.ilike('email', email)
    else if (phone) q = q.eq('phone', phone)
    const { data } = await q.limit(email || phone ? 5 : 100)
    return NextResponse.json({ carts: data || [] })
  } catch (err: any) {
    return NextResponse.json({ error: err.message, carts: [] }, { status: 500 })
  }
}
