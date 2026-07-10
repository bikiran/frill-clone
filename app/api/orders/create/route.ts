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

// POST: create a WooCommerce order from the chat.
// body: {
//   companyId, integrationId?, conversationId?, contactId?, source: 'woocommerce',
//   customer: { existingId?, createAccount, email, first_name, last_name, phone, billing, shipping },
//   items: [{ product_id, variation_id?, quantity, name, price, custom_price?, custom_name? }],
//   coupons: [code], orderDiscount: { type: 'fixed'|'percent', amount },
//   fees: [{ name, amount }], shipping: { method, label, cost },
//   customerNote, internalNote, status, setPaid, createdByName, staffId
// }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { companyId, integrationId, conversationId, contactId, customer, items, coupons, orderDiscount, fees, shipping, customerNote, internalNote, status, setPaid, createdByName } = body
    if (!companyId || !items?.length) return NextResponse.json({ error: 'Missing companyId or items' }, { status: 400 })

    const db = admin()
    let integ: any = null
    if (integrationId) {
      const r = await db.from('woocommerce_integrations').select('*').eq('id', integrationId).maybeSingle()
      integ = r.data
    } else {
      const r = await db.from('woocommerce_integrations').select('*').eq('company_id', companyId).eq('is_active', true).order('created_at', { ascending: true }).limit(1)
      integ = r.data?.[0] || null
    }
    if (!integ?.store_url) return NextResponse.json({ error: 'No WooCommerce store connected' }, { status: 404 })
    const woo = new WooCommerceService({ storeUrl: integ.store_url, consumerKey: integ.consumer_key, consumerSecret: integ.consumer_secret })

    // ── Stock/price recheck: another sale may have happened while the panel was
    // open. Verify each item is still purchasable.
    const stockProblems: string[] = []
    for (const it of items) {
      if (!it.product_id) continue // custom item, skip
      const fresh = await woo.getProductOrVariation(Number(it.product_id), it.variation_id ? Number(it.variation_id) : undefined)
      if (!fresh) { stockProblems.push(`${it.name}: no longer available`); continue }
      if (fresh.stock_status === 'outofstock') stockProblems.push(`${it.name}: now out of stock`)
      else if (fresh.manage_stock && fresh.stock_quantity != null && fresh.stock_quantity < it.quantity) {
        stockProblems.push(`${it.name}: only ${fresh.stock_quantity} left (you asked for ${it.quantity})`)
      }
    }
    if (stockProblems.length > 0 && !body.ignoreStockWarnings) {
      return NextResponse.json({ stockWarning: true, problems: stockProblems }, { status: 409 })
    }

    // ── Customer matching precedence: linked WC id → email → create/guest.
    let customerId = 0
    if (customer?.existingId) {
      customerId = Number(customer.existingId)
    } else if (customer?.email) {
      const existing = await woo.findCustomerByEmail(customer.email)
      if (existing?.id) {
        customerId = existing.id
      } else if (customer.createAccount) {
        const created = await woo.createCustomer({
          email: customer.email, first_name: customer.first_name, last_name: customer.last_name,
          phone: customer.phone, billing: customer.billing, shipping: customer.shipping,
        })
        if (created.ok) customerId = created.customer.id
        // If account creation fails we fall through to a guest order.
      }
    }

    // ── Assemble line items (respect custom price via a per-item override).
    const line_items = items.map((it: any) => {
      const li: any = { quantity: it.quantity }
      if (it.product_id) {
        li.product_id = Number(it.product_id)
        if (it.variation_id) li.variation_id = Number(it.variation_id)
      } else {
        li.name = it.custom_name || it.name || 'Custom item'
      }
      // Product-level custom price: WooCommerce takes subtotal/total on the line.
      if (it.custom_price != null && it.custom_price !== '') {
        const lineTotal = (parseFloat(it.custom_price) * it.quantity).toFixed(2)
        li.subtotal = lineTotal
        li.total = lineTotal
        if (it.product_id && !it.custom_name) li.name = it.name // keep the product name
      }
      return li
    })

    // ── Fees (custom charges) + order-level discount as a negative fee.
    const fee_lines: any[] = []
    for (const f of (fees || [])) {
      if (f.amount && parseFloat(f.amount) !== 0) fee_lines.push({ name: f.name || 'Fee', total: String(f.amount), tax_status: 'taxable' })
    }
    if (orderDiscount && orderDiscount.amount && parseFloat(orderDiscount.amount) > 0) {
      // Percentage is resolved client-side into a dollar amount before sending;
      // here we always treat it as a fixed negative fee for reliability.
      fee_lines.push({ name: orderDiscount.label || 'Discount', total: `-${Math.abs(parseFloat(orderDiscount.amount)).toFixed(2)}`, tax_status: 'none' })
    }

    // ── Shipping line
    const shipping_lines: any[] = []
    if (shipping && shipping.method !== 'none') {
      const cost = shipping.method === 'free' || shipping.method === 'pickup' || shipping.method === 'quote_later' ? '0.00' : String(shipping.cost || '0')
      shipping_lines.push({
        method_id: shipping.method === 'pickup' ? 'local_pickup' : (shipping.method === 'free' ? 'free_shipping' : 'flat_rate'),
        method_title: shipping.label || (shipping.method === 'pickup' ? 'Local pickup' : shipping.method === 'free' ? 'Free shipping' : shipping.method === 'quote_later' ? 'Shipping — quote to follow' : 'Shipping'),
        total: cost,
      })
    }

    // ── Coupons
    const coupon_lines = (coupons || []).filter(Boolean).map((code: string) => ({ code }))

    // ── Build order payload. Unpaid chat order defaults to pending + set_paid:false.
    const payload: any = {
      customer_id: customerId || 0,
      status: status || 'pending',
      set_paid: setPaid === true, // careful: true moves to processing + reduces stock
      billing: customer?.billing || {},
      shipping: customer?.shipping || {},
      line_items,
      shipping_lines,
      fee_lines,
      coupon_lines,
      customer_note: customerNote || '',
      meta_data: [
        { key: '_colvy_conversation_id', value: conversationId || '' },
        { key: '_colvy_contact_id', value: contactId || '' },
        { key: '_colvy_created_by', value: createdByName || '' },
      ],
    }

    const result = await woo.createOrder(payload)
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 })
    const order = result.order

    // ── Internal note (staff-only) after creation
    if (internalNote && internalNote.trim()) {
      await woo.addOrderNote(order.id, `[Colvy] ${internalNote.trim()}`, false)
    }
    await woo.addOrderNote(order.id, `Order created from Colvy chat${createdByName ? ` by ${createdByName}` : ''}.`, false)

    // ── Payment link (WooCommerce order-pay URL)
    const payLink = order.payment_url || `${integ.store_url}/checkout/order-pay/${order.id}/?pay_for_order=true&key=${order.order_key}`

    // ── Post the audit event into the conversation
    if (conversationId) {
      try {
        const content = `🛒 WooCommerce order #${order.number || order.id} created\nTotal: ${order.currency || 'AUD'} $${order.total}\nStatus: ${order.status}${createdByName ? `\nCreated by: ${createdByName}` : ''}`
        await db.from('messages').insert({
          conversation_id: conversationId, company_id: companyId, sender_type: 'system',
          content,
          message_type: 'order',
          message_payload: { kind: 'order', order_id: order.id, order_number: order.number || order.id, total: order.total, currency: order.currency, status: order.status, pay_link: payLink, store_url: integ.store_url },
        })
        await db.from('conversations').update({ last_message: `🛒 Order #${order.number || order.id} created`, last_message_at: new Date().toISOString() }).eq('id', conversationId)
      } catch {}
    }

    return NextResponse.json({ ok: true, order: { id: order.id, number: order.number || order.id, total: order.total, currency: order.currency, status: order.status, pay_link: payLink } })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
