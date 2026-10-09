import { isInternalCall } from '@/lib/internal-call'
import { requireCompanyAccess } from '@/lib/company-access'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { resolveShopifyOrderRef, shopifyChangeStatus, ShopifyActionError } from '@/lib/shopify-order-actions'

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
// Shopify orders (orderId "shopify-<id>", an `orders` row id, or channel
// 'shopify') get the same status words applied in Shopify — paid, fulfilled,
// on hold, cancelled (lib/shopify-order-actions).
export async function POST(req: NextRequest) {
  try {
    const { companyId, integrationId, orderId, status, conversationId, channel, orderRowId, reason } = await req.json()
    if (!companyId || !orderId || !status) return NextResponse.json({ error: 'Missing companyId, orderId or status' }, { status: 400 })

    const db = admin()
    // Workspace members only (customer details, orders and refunds).
    if (!isInternalCall(req) && !(await requireCompanyAccess(req, db, companyId)).ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    if (conversationId) {
      const { data: owner } = await db.from('conversations').select('company_id').eq('id', conversationId).maybeSingle()
      if (!owner || owner.company_id !== companyId) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }
    // The note posted in the thread once the change is made (either store).
    const postNote = async (number: string) => {
      if (!conversationId) return
      try {
        const label = status === 'cancelled' ? 'cancelled' : status === 'completed' ? 'marked paid & completed' : `set to ${status}`
        const content = `🛒 Order #${number} ${label}.`
        const { data: dup } = await db.from('messages').select('id')
          .eq('conversation_id', conversationId).eq('sender_type', 'system').eq('content', content)
          .gte('created_at', new Date(Date.now() - 10 * 60 * 1000).toISOString()).limit(1)
        if (!dup || dup.length === 0) {
          await db.from('messages').insert({
            conversation_id: conversationId, company_id: companyId, sender_type: 'system',
            content, is_read: true,
          })
        }
      } catch {}
    }

    try {
      const shop = await resolveShopifyOrderRef(db, companyId, { orderId, channel, orderRowId })
      if (shop) {
        const r = await shopifyChangeStatus(db, shop, status, { reason })
        await postNote(String(r.order?.name || shop.row?.order_number || shop.externalId).replace(/^#/, ''))
        return NextResponse.json({ ok: true, status: r.status, channel: 'shopify' })
      }
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: e instanceof ShopifyActionError ? e.status : 502 })
    }

    let integ: any = null
    if (integrationId) {
      const r = await db.from('woocommerce_integrations').select('*').eq('id', integrationId).eq('company_id', companyId).maybeSingle()
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

    // Post a system note in the conversation — but only once. A double-click or a
    // retriggered status change was inserting the same pill twice, so postNote
    // skips it if an identical system line landed in the last 10 minutes.
    await postNote(String(result.order.number || orderId))

    return NextResponse.json({ ok: true, status: result.order.status })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
