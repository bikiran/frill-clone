import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { WooCommerceService } from '@/lib/woocommerce-service'

/**
 * POST /api/woocommerce/sync
 * Manually trigger a sync of customers and orders from WooCommerce
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { companyId } = body

    if (!companyId) {
      return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })
    }

    // Lazy load Supabase inside handler
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    )

    // Get WooCommerce integration settings
    const { data: integration, error: integrationError } = await supabase
      .from('woocommerce_integrations')
      .select('*')
      .eq('company_id', companyId)
      .maybeSingle()

    if (integrationError || !integration) {
      return NextResponse.json(
        { error: 'WooCommerce integration not configured' },
        { status: 404 }
      )
    }

    if (!integration.is_active) {
      return NextResponse.json(
        { error: 'WooCommerce integration is disabled' },
        { status: 403 }
      )
    }

    // Create WooCommerce service
    const woo = new WooCommerceService({
      storeUrl: integration.store_url,
      consumerKey: integration.consumer_key,
      consumerSecret: integration.consumer_secret,
      companyId
    })

    // Test connection
    const isConnected = await woo.testConnection()
    if (!isConnected) {
      return NextResponse.json(
        { error: 'Failed to connect to WooCommerce store' },
        { status: 503 }
      )
    }

    // ============================================================
    // RESUMABLE PAGE-BY-PAGE SYNC
    // The old sync fetched EVERY customer then made one stats API
    // call PER customer — 12,000 sequential round-trips guaranteed a
    // serverless timeout after ~100 customers. Now each request
    // handles ONE page (100 records) and the client loops:
    //   mode: 'customers' — upsert one page of customer basics
    //   mode: 'orders'    — aggregate one page of orders into stats
    // ============================================================
    const mode = body.mode || 'customers'
    const page = Math.max(1, parseInt(body.page) || 1)
    const perPage = 100
    const auth = Buffer.from(`${integration.consumer_key}:${integration.consumer_secret}`).toString('base64')
    const wcFetch = async (path: string) => {
      const res = await fetch(`${integration.store_url}/wp-json/wc/v3/${path}`, {
        headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json' }
      })
      if (!res.ok) throw new Error(`WooCommerce API error: ${res.statusText}`)
      const totalPages = parseInt(res.headers.get('x-wp-totalpages') || '1') || 1
      const total = parseInt(res.headers.get('x-wp-total') || '0') || 0
      return { data: await res.json(), totalPages, total }
    }

    if (mode === 'customers') {
      const { data: customers, totalPages, total } = await wcFetch(`customers?per_page=${perPage}&page=${page}&orderby=id&order=asc`)

      const rows = (customers as any[]).map(c => ({
        company_id: companyId,
        woo_customer_id: c.id,
        email: c.email,
        first_name: c.first_name,
        last_name: c.last_name,
        phone: c.billing?.phone || '',
        address: c.billing,
        synced_at: new Date().toISOString(),
      }))

      let syncedCount = 0
      if (rows.length > 0) {
        const { error: upsertError } = await supabase
          .from('woocommerce_customers')
          .upsert(rows, { onConflict: 'company_id,woo_customer_id' })
        if (upsertError) throw new Error(upsertError.message)
        syncedCount = rows.length
      }

      const done = page >= totalPages
      if (done) {
        await supabase
          .from('woocommerce_integrations')
          .update({ last_synced_at: new Date().toISOString() })
          .eq('company_id', companyId)
      }

      return NextResponse.json({
        success: true, mode, page, totalPages, total, syncedCount, done,
        message: `Customers page ${page}/${totalPages} synced (${syncedCount})`,
      })
    }

    if (mode === 'orders') {
      // On the first orders page, reset previously aggregated stats so re-syncs don't double count
      if (page === 1) {
        await supabase
          .from('woocommerce_customers')
          .update({ total_spend: 0, total_orders: 0, average_order_value: 0, items_purchased: 0 })
          .eq('company_id', companyId)
      }

      const { data: orders, totalPages, total } = await wcFetch(`orders?per_page=${perPage}&page=${page}&orderby=id&order=asc&status=any`)

      // 1. Upsert individual order rows for the order history view
      const orderRows = (orders as any[]).map((o: any) => ({
        company_id: companyId,
        woo_order_id: o.id,
        woo_customer_id: o.customer_id,
        customer_email: o.billing?.email || '',
        status: o.status,
        total: parseFloat(o.total || '0') || 0,
        currency: o.currency || 'AUD',
        order_date: o.date_created,
        line_items: (o.line_items || []).map((li: any) => ({
          product_id: li.product_id,
          name: li.name,
          quantity: li.quantity,
          total: li.total,
          image: li.image?.src || null,
        })),
        billing: o.billing || {},
      })).filter((r: any) => r.woo_customer_id) // skip guest orders without customer id
      if (orderRows.length > 0) {
        await supabase.from('woocommerce_orders').upsert(orderRows, { onConflict: 'company_id,woo_order_id' }).catch(() => {})
      }

      // 2. Aggregate this page's orders per customer
      const agg: Record<number, { spend: number; orders: number; items: number; lastDate: string | null; firstDate: string | null }> = {}
      for (const o of orders as any[]) {
        const cid = o.customer_id
        if (!cid) continue
        if (!agg[cid]) agg[cid] = { spend: 0, orders: 0, items: 0, lastDate: null, firstDate: null }
        agg[cid].spend += parseFloat(o.total || '0') || 0
        agg[cid].orders += 1
        agg[cid].items += (o.line_items || []).reduce((n: number, li: any) => n + (li.quantity || 0), 0)
        const d = o.date_created
        if (d) {
          if (!agg[cid].lastDate || d > agg[cid].lastDate!) agg[cid].lastDate = d
          if (!agg[cid].firstDate || d < agg[cid].firstDate!) agg[cid].firstDate = d
        }
      }

      const wooIds = Object.keys(agg).map(Number)
      let updated = 0
      if (wooIds.length > 0) {
        // Read current totals, add this page's contribution, write back
        const { data: existing } = await supabase
          .from('woocommerce_customers')
          .select('id, woo_customer_id, total_spend, total_orders, items_purchased, last_order_date, first_order_date')
          .eq('company_id', companyId)
          .in('woo_customer_id', wooIds)

        const updates = (existing || []).map((row: any) => {
          const a = agg[row.woo_customer_id]
          const totalOrders = (row.total_orders || 0) + a.orders
          const totalSpend = (parseFloat(row.total_spend) || 0) + a.spend
          return {
            id: row.id,
            company_id: companyId,
            woo_customer_id: row.woo_customer_id,
            total_spend: Math.round(totalSpend * 100) / 100,
            total_orders: totalOrders,
            items_purchased: (row.items_purchased || 0) + a.items,
            average_order_value: totalOrders > 0 ? Math.round((totalSpend / totalOrders) * 100) / 100 : 0,
            last_order_date: [row.last_order_date, a.lastDate].filter(Boolean).sort().pop() || null,
            first_order_date: [row.first_order_date, a.firstDate].filter(Boolean).sort().shift() || null,
            synced_at: new Date().toISOString(),
          }
        })

        if (updates.length > 0) {
          const { error: upErr } = await supabase
            .from('woocommerce_customers')
            .upsert(updates, { onConflict: 'company_id,woo_customer_id' })
          if (upErr) throw new Error(upErr.message)
          updated = updates.length
        }
      }

      const done = page >= totalPages
      if (done) {
        await supabase
          .from('woocommerce_integrations')
          .update({ last_synced_at: new Date().toISOString() })
          .eq('company_id', companyId)
      }

      return NextResponse.json({
        success: true, mode, page, totalPages, total, updated, done,
        message: `Orders page ${page}/${totalPages} aggregated (${updated} customers updated)`,
      })
    }

    return NextResponse.json({ error: `Unknown sync mode: ${mode}` }, { status: 400 })
  } catch (error: any) {
    console.error('[WooCommerce Sync] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Sync failed' },
      { status: 500 }
    )
  }
}
