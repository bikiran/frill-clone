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
      if (res.status === 429) {
        // Pass the 429 back to the client so it can back off and retry
        const err = new Error('WooCommerce API rate limit hit — will retry') as any
        err.status = 429
        throw err
      }
      if (!res.ok) throw new Error(`WooCommerce API error: ${res.statusText}`)
      const totalPages = parseInt(res.headers.get('x-wp-totalpages') || '1') || 1
      const total = parseInt(res.headers.get('x-wp-total') || '0') || 0
      return { data: await res.json(), totalPages, total }
    }

    if (mode === 'customers') {
      const { data: customers, totalPages, total } = await wcFetch(`customers?per_page=${perPage}&page=${page}&orderby=id&order=asc`)

      const rows = (customers as any[])
        // Some WooCommerce customers (e.g. guest/incomplete accounts) have no
        // email — the DB requires one, so fall back to a placeholder built
        // from the billing name / customer id rather than failing the whole page.
        .map(c => {
          const email = c.email?.trim() || c.billing?.email?.trim() || `woo-customer-${c.id}@no-email.colvy.internal`
          return {
            company_id: companyId,
            woo_customer_id: c.id,
            email,
            first_name: c.first_name || c.billing?.first_name || '',
            last_name: c.last_name || c.billing?.last_name || '',
            phone: c.billing?.phone || '',
            address: c.billing,
            synced_at: new Date().toISOString(),
          }
        })

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
      // Fetch FIRST — only reset stats after a successful fetch, so a failed
      // API call can never leave every customer wiped to $0 (which is what
      // happened when the old code reset then crashed).
      const { data: orders, totalPages, total } = await wcFetch(`orders?per_page=${perPage}&page=${page}&orderby=id&order=asc&status=any`)

      if (page === 1) {
        await supabase
          .from('woocommerce_customers')
          .update({ total_spend: 0, total_orders: 0, average_order_value: 0, items_purchased: [] })
          .eq('company_id', companyId)
      }

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
        // NOTE: supabase query builders are thenable but have no .catch — must try/await
        try {
          await supabase.from('woocommerce_orders').upsert(orderRows, { onConflict: 'company_id,woo_order_id' })
        } catch {}
      }

      // 2. Aggregate this page's orders per customer — including the actual
      // 2. Aggregate this page's orders per customer by customer_id AND email.
      // Many WooCommerce orders are guest checkouts (customer_id 0) that still
      // have the registered customer's billing email — matching only on
      // customer_id missed all of these, leaving totals at 0.
      const agg: Record<number, { spend: number; orders: number; items: any[]; lastDate: string | null; firstDate: string | null }> = {}
      const aggByEmail: Record<string, { spend: number; orders: number; items: any[]; lastDate: string | null; firstDate: string | null }> = {}
      const mkEntry = () => ({ spend: 0, orders: 0, items: [] as any[], lastDate: null as string | null, firstDate: null as string | null })
      const addToEntry = (entry: any, o: any) => {
        entry.spend += parseFloat(o.total || '0') || 0
        entry.orders += 1
        for (const li of (o.line_items || [])) {
          entry.items.push({ name: li.name || 'Unnamed product', quantity: li.quantity || 1, price: li.total || null, image: li.image?.src || null })
        }
        const d = o.date_created
        if (d) {
          if (!entry.lastDate || d > entry.lastDate) entry.lastDate = d
          if (!entry.firstDate || d < entry.firstDate) entry.firstDate = d
        }
      }
      for (const o of orders as any[]) {
        const cid = o.customer_id
        const email = (o.billing?.email || '').toLowerCase().trim()
        if (cid) {
          if (!agg[cid]) agg[cid] = mkEntry()
          addToEntry(agg[cid], o)
        } else if (email) {
          if (!aggByEmail[email]) aggByEmail[email] = mkEntry()
          addToEntry(aggByEmail[email], o)
        }
      }

      const wooIds = Object.keys(agg).map(Number)
      let updated = 0
      // Combine customer-id matches and email matches into one set of updates.
      // Fetch customers matched by woo_customer_id OR by email.
      const emails = Object.keys(aggByEmail)
      let existing: any[] = []
      if (wooIds.length > 0) {
        const { data } = await supabase
          .from('woocommerce_customers')
          .select('id, woo_customer_id, email, total_spend, total_orders, items_purchased, last_order_date, first_order_date')
          .eq('company_id', companyId)
          .in('woo_customer_id', wooIds)
        existing = existing.concat(data || [])
      }
      if (emails.length > 0) {
        const { data } = await supabase
          .from('woocommerce_customers')
          .select('id, woo_customer_id, email, total_spend, total_orders, items_purchased, last_order_date, first_order_date')
          .eq('company_id', companyId)
          .in('email', emails)
        // Avoid duplicates already fetched by woo_customer_id
        const seenIds = new Set(existing.map((r: any) => r.id))
        for (const r of data || []) if (!seenIds.has(r.id)) existing.push(r)
      }

      if (existing.length > 0) {
        const updates = existing.map((row: any) => {
          // Contribution from customer_id match and/or email match
          const a = agg[row.woo_customer_id]
          const b = row.email ? aggByEmail[(row.email || '').toLowerCase().trim()] : null
          const contribOrders = (a?.orders || 0) + (b?.orders || 0)
          const contribSpend = (a?.spend || 0) + (b?.spend || 0)
          const contribItems = [...(a?.items || []), ...(b?.items || [])]
          const contribLast = [a?.lastDate, b?.lastDate].filter(Boolean).sort().pop() || null
          const contribFirst = [a?.firstDate, b?.firstDate].filter(Boolean).sort().shift() || null

          const totalOrders = (row.total_orders || 0) + contribOrders
          const totalSpend = (parseFloat(row.total_spend) || 0) + contribSpend
          let existingItems: any[] = []
          const ei = row.items_purchased
          if (Array.isArray(ei)) existingItems = ei.filter((x: any) => x && typeof x === 'object' && x.name)
          const seen = new Set(existingItems.map((x: any) => x.name))
          for (const item of contribItems) {
            if (!seen.has(item.name)) { existingItems.push(item); seen.add(item.name) }
          }
          if (existingItems.length > 300) existingItems = existingItems.slice(0, 300)
          return {
            id: row.id,
            company_id: companyId,
            woo_customer_id: row.woo_customer_id,
            // Always include email — upsert's insert path requires it (NOT NULL).
            // These are existing rows so email is present; fall back defensively.
            email: row.email || `woo-customer-${row.woo_customer_id}@no-email.colvy.internal`,
            total_spend: Math.round(totalSpend * 100) / 100,
            total_orders: totalOrders,
            items_purchased: existingItems,
            average_order_value: totalOrders > 0 ? Math.round((totalSpend / totalOrders) * 100) / 100 : 0,
            last_order_date: [row.last_order_date, contribLast].filter(Boolean).sort().pop() || null,
            first_order_date: [row.first_order_date, contribFirst].filter(Boolean).sort().shift() || null,
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
    const status = error.status === 429 ? 429 : 500
    return NextResponse.json(
      { error: error.message || 'Sync failed' },
      { status }
    )
  }
}
