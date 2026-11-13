import { isInternalCall } from '@/lib/internal-call'
import { requireCompanyAccess } from '@/lib/company-access'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { resolveShopifyOrderRef, shopifyChangeStatus, ShopifyActionError } from '@/lib/shopify-order-actions'
import { shopifyDraftAction, shopifyStoreFor, ShopifyCreateError } from '@/lib/shopify-create'
import { readStoreJson } from '@/lib/store-response'
import { forgetWooOrders } from '@/lib/woocommerce-service'
import { wantsNotify, quietStatuses, quietMetaValue, holdCustomerNotice, releaseCustomerNotice, QUIET_META_KEY, QUIET_NOTE } from '@/lib/order-notify'

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
//
// notifyCustomer (default true): false = "Notify customer" was unticked, so the
// customer hears nothing about this change from Colvy (lib/order-notify), and
// WooCommerce's own customer email is held by the Colvy WordPress plugin.
export async function POST(req: NextRequest) {
  try {
    const { companyId, integrationId, orderId, status, conversationId, channel, orderRowId, reason, notifyCustomer } = await req.json()
    if (!companyId || !orderId || !status) return NextResponse.json({ error: 'Missing companyId, orderId or status' }, { status: 400 })
    const notify = wantsNotify(notifyCustomer)
    const quiet = quietStatuses(status)

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
        const content = `🛒 Order #${number} ${label}.${notify ? '' : ` ${QUIET_NOTE}`}`
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

    // A Shopify draft created from Colvy (the in-chat order card).
    const draft = String(orderId).match(/^shopify-draft-(\d+)$/i)
    if (draft) {
      try {
        const integ = await shopifyStoreFor(db, companyId, integrationId)
        if (!integ) return NextResponse.json({ error: 'No Shopify store connected' }, { status: 404 })
        // A draft becomes a real order here: hold its thank-you the moment
        // Shopify gives the order an id, before its webhook can arrive.
        const r = await shopifyDraftAction(db, integ, draft[1], status, notify ? {} : {
          onOrder: async (externalId: string) => { await holdCustomerNotice(db, companyId, Number(externalId), quietStatuses(status)) },
        })
        if (conversationId) {
          const content = r.status === 'cancelled' ? `🛒 Shopify draft order deleted.` : `🛒 Order #${r.number} ${status === 'completed' ? 'marked paid & completed' : status === 'on-hold' ? 'created — awaiting payment' : 'marked paid'}.${notify ? '' : ` ${QUIET_NOTE}`}`
          try { await db.from('messages').insert({ conversation_id: conversationId, company_id: companyId, sender_type: 'system', content, is_read: true }) } catch {}
        }
        return NextResponse.json({ ok: true, status: r.status, channel: 'shopify', orderId: (r as any).orderId || null })
      } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: e instanceof ShopifyCreateError || e instanceof ShopifyActionError ? e.status : 502 })
      }
    }

    try {
      const shop = await resolveShopifyOrderRef(db, companyId, { orderId, channel, orderRowId })
      if (shop) {
        const shopId = Number(shop.externalId)
        if (notify) await releaseCustomerNotice(db, companyId, shopId, quiet)
        else await holdCustomerNotice(db, companyId, shopId, quiet)
        let r: Awaited<ReturnType<typeof shopifyChangeStatus>>
        try { r = await shopifyChangeStatus(db, shop, status, { reason }) }
        catch (e) { if (!notify) await releaseCustomerNotice(db, companyId, shopId, quiet); throw e }
        await postNote(String(r.order?.name || shop.row?.order_number || shop.externalId).replace(/^#/, ''))
        return NextResponse.json({ ok: true, status: r.status, channel: 'shopify', notified: notify })
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
    // Quiet: the marker goes on before the change, so the webhook it sets off
    // finds it, and in the same update as the change, so WooCommerce's own
    // email for it (sent while saving) is held by the Colvy plugin.
    const wooId = Number(orderId)
    if (notify) await releaseCustomerNotice(db, companyId, wooId, quiet)
    else {
      await holdCustomerNotice(db, companyId, wooId, quiet)
      payload.meta_data = [{ key: QUIET_META_KEY, value: quietMetaValue(quiet) }]
    }

    let result: { ok: boolean; order?: any; error?: string }
    try {
      const res = await fetch(`${integ.store_url}/wp-json/wc/v3/orders/${orderId}`, {
        method: 'PUT',
        headers: { 'Authorization': `Basic ${Buffer.from(`${integ.consumer_key}:${integ.consumer_secret}`).toString('base64')}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await readStoreJson(res, { provider: 'woocommerce', store: integ.store_url })
      forgetWooOrders(integ.store_url)
      result = res.ok ? { ok: true, order: data } : { ok: false, error: data?.message || `Update failed (${res.status})` }
    } catch (e: any) { result = { ok: false, error: e.message } }

    if (!result.ok || !result.order) {
      if (!notify) await releaseCustomerNotice(db, companyId, wooId, quiet)
      return NextResponse.json({ error: result.error }, { status: 502 })
    }

    // Post a system note in the conversation — but only once. A double-click or a
    // retriggered status change was inserting the same pill twice, so postNote
    // skips it if an identical system line landed in the last 10 minutes.
    await postNote(String(result.order.number || orderId))

    return NextResponse.json({ ok: true, status: result.order.status, notified: notify })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
