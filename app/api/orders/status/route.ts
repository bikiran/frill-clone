import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// POST: update a WooCommerce order's status (e.g. mark paid → completed/processing,
// or cancel). Marking paid sets set_paid:true which, in WooCommerce, records the
// payment and reduces stock — so we only do it on explicit staff action.
export async function POST(req: NextRequest) {
  try {
    const { companyId, integrationId, orderId, status, conversationId } = await req.json()
    if (!companyId || !orderId || !status) return NextResponse.json({ error: 'Missing companyId, orderId or status' }, { status: 400 })

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

    const payload: any = { status }
    // Marking paid records payment + reduces stock in WooCommerce.
    if (status === 'completed' || status === 'processing') payload.set_paid = true

    let result: { ok: boolean; order?: any; error?: string }
    try {
      const res = await fetch(`${integ.store_url}/wp-json/wc/v3/orders/${orderId}`, {
        method: 'PUT',
        headers: { 'Authorization': `Basic ${Buffer.from(`${integ.consumer_key}:${integ.consumer_secret}`).toString('base64')}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      result = res.ok ? { ok: true, order: data } : { ok: false, error: data?.message || `Update failed (${res.status})` }
    } catch (e: any) { result = { ok: false, error: e.message } }

    if (!result.ok || !result.order) return NextResponse.json({ error: result.error }, { status: 502 })

    // Post a system note in the conversation
    if (conversationId) {
      try {
        const label = status === 'cancelled' ? 'cancelled' : status === 'completed' ? 'marked paid & completed' : `set to ${status}`
        await db.from('messages').insert({
          conversation_id: conversationId, company_id: companyId, sender_type: 'system',
          content: `🛒 Order #${result.order.number || orderId} ${label}.`,
        })
      } catch {}
    }

    return NextResponse.json({ ok: true, status: result.order.status })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
