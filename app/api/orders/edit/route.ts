import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// POST: edit an existing WooCommerce order — update line item quantities (or
// remove an item with quantity 0), change status, add a customer note.
export async function POST(req: NextRequest) {
  try {
    const { companyId, integrationId, orderId, status, items, customerNote, conversationId } = await req.json()
    if (!companyId || !orderId) return NextResponse.json({ error: 'Missing companyId or orderId' }, { status: 400 })

    const db = admin()
    let integ: any = null
    if (integrationId) {
      const r = await db.from('woocommerce_integrations').select('*').eq('id', integrationId).maybeSingle()
      integ = r.data
    }
    if (!integ) {
      const r = await db.from('woocommerce_integrations').select('*').eq('company_id', companyId).eq('is_active', true).order('created_at', { ascending: true }).limit(1)
      integ = r.data?.[0] || null
    }
    if (!integ?.store_url) return NextResponse.json({ error: 'No WooCommerce store connected' }, { status: 404 })

    const auth = `Basic ${Buffer.from(`${integ.consumer_key}:${integ.consumer_secret}`).toString('base64')}`

    // Build the line_items update. WooCommerce updates a line by its id; setting
    // quantity 0 removes it. New/changed quantities recalculate totals server-side.
    const payload: any = {}
    if (Array.isArray(items) && items.length) {
      payload.line_items = items.map((it: any) => it.quantity === 0
        ? { id: it.id, quantity: 0 }
        : { id: it.id, quantity: it.quantity })
    }
    if (status) payload.status = status
    if (customerNote) payload.customer_note = customerNote

    const res = await fetch(`${integ.store_url}/wp-json/wc/v3/orders/${orderId}`, {
      method: 'PUT', headers: { 'Authorization': auth, 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    })
    const data = await res.json()
    if (!res.ok) return NextResponse.json({ error: data?.message || `Update failed (${res.status})` }, { status: 502 })

    if (conversationId) {
      try {
        await db.from('messages').insert({
          conversation_id: conversationId, company_id: companyId, sender_type: 'system',
          content: `✏️ Order #${data.number || orderId} updated — new total ${data.currency || 'AUD'} $${data.total} (${data.status}).`,
        })
      } catch {}
    }

    return NextResponse.json({ ok: true, order: { id: data.id, number: data.number, total: data.total, status: data.status } })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
