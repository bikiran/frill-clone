import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { WooCommerceService } from '@/lib/woocommerce-service'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function genCouponCode(email: string) {
  const base = 'DOA' + Math.random().toString(36).slice(2, 7).toUpperCase()
  return base
}

// POST: execute a DOA resolution against an order.
// resolution: 'refund' | 'coupon' | 'resend'
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { companyId, conversationId, contactId, order, resolution, selectedItems, amount, notes, createdBy } = body
    if (!companyId || !order?.order_id || !resolution) {
      return NextResponse.json({ error: 'Missing companyId, order, or resolution' }, { status: 400 })
    }

    const db = admin()
    const { data: integs } = await db.from('woocommerce_integrations')
      .select('*').eq('company_id', companyId).eq('is_active', true).order('created_at', { ascending: true })
    const integ = integs?.[0]
    if (!integ?.store_url) return NextResponse.json({ error: 'No WooCommerce store connected' }, { status: 404 })

    const woo = new WooCommerceService({
      storeUrl: integ.store_url, consumerKey: integ.consumer_key, consumerSecret: integ.consumer_secret,
    })

    // Record the claim first (so we have an audit trail even if the action fails)
    const { data: claim } = await db.from('doa_claims').insert({
      company_id: companyId, conversation_id: conversationId || null, contact_id: contactId || null,
      order_number: String(order.order_number), order_id: order.order_id,
      customer_email: order.email, customer_name: `${order.first_name} ${order.last_name}`.trim(), customer_phone: order.phone,
      order_snapshot: order, selected_items: selectedItems || null, notes: notes || null,
      resolution, created_by: createdBy || null, status: 'open',
    }).select().maybeSingle()

    const claimId = claim?.id

    let resultMessage = ''
    let updatePatch: any = { updated_at: new Date().toISOString() }

    if (resolution === 'refund') {
      // Refund specific line items or a flat amount, via the original payment
      // method (Stripe api_refund=true).
      const lineItems = (selectedItems && selectedItems.length)
        ? selectedItems.map((it: any) => ({ id: it.id, quantity: it.quantity, refund_total: String(it.total).replace('-', '') }))
        : undefined
      const refundAmount = amount ? String(amount) : undefined
      const r = await woo.createRefund(order.order_id, {
        amount: refundAmount, lineItems, reason: notes || 'DOA claim', refundPayment: true,
      })
      if (!r.ok) {
        await db.from('doa_claims').update({ ...updatePatch, status: 'open', error: r.error }).eq('id', claimId)
        return NextResponse.json({ error: r.error || 'Refund failed' }, { status: 502 })
      }
      const refunded = r.refund?.amount || refundAmount || '0'
      updatePatch = { ...updatePatch, status: 'refunded', refund_amount: parseFloat(refunded) || 0, refund_id: r.refund?.id || null }
      resultMessage = `✅ Refunded ${order.currency || 'AUD'} $${refunded} to the original payment method for order #${order.order_number}.`
    }

    else if (resolution === 'coupon') {
      // Store credit as a one-time, email-restricted coupon.
      const code = genCouponCode(order.email)
      const couponAmount = amount ? String(amount) : String(order.total || '0')
      const c = await woo.createCoupon({ code, amount: couponAmount, email: order.email, description: `DOA store credit for order #${order.order_number}` })
      if (!c.ok) {
        await db.from('doa_claims').update({ ...updatePatch, error: c.error }).eq('id', claimId)
        return NextResponse.json({ error: c.error || 'Coupon creation failed' }, { status: 502 })
      }
      updatePatch = { ...updatePatch, status: 'credited', coupon_code: code, refund_amount: parseFloat(couponAmount) || 0 }
      resultMessage = `🎟️ Store credit issued: coupon code **${code}** for ${order.currency || 'AUD'} $${couponAmount}, valid once for ${order.email}.`
    }

    else if (resolution === 'resend') {
      updatePatch = { ...updatePatch, status: 'resent' }
      resultMessage = `📦 Replacement flagged for order #${order.order_number}. Arrange a re-ship from your fulfilment.`
    }

    if (claimId) await db.from('doa_claims').update(updatePatch).eq('id', claimId)

    // Post the outcome into the conversation so the customer sees it.
    if (conversationId) {
      try {
        await db.from('messages').insert({
          conversation_id: conversationId, company_id: companyId, sender_type: 'system', content: resultMessage,
        })
        await db.from('conversations').update({ last_message: resultMessage.replace(/\*/g, ''), last_message_at: new Date().toISOString() }).eq('id', conversationId)
      } catch {}
    }

    return NextResponse.json({ ok: true, claimId, message: resultMessage, coupon: updatePatch.coupon_code || null, code: updatePatch.coupon_code || null, shop_url: integ.store_url || null })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
