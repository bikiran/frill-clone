import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { WooCommerceService } from '@/lib/woocommerce-service'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
)

/**
 * POST /api/woocommerce/sync
 * Manually trigger a sync of customers and orders from WooCommerce
 */
export async function POST(req: NextRequest) {
  try {
    const { companyId } = await req.json()

    if (!companyId) {
      return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })
    }

    // Get WooCommerce integration settings
    const { data: integration, error: integrationError } = await supabase
      .from('woocommerce_integrations')
      .select('*')
      .eq('company_id', companyId)
      .single()

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

    // Fetch and sync customers
    const customers = await woo.getCustomers()
    let syncedCount = 0

    for (const customer of customers) {
      try {
        // Get customer stats
        const stats = await woo.getCustomerStats(customer.id)

        // Upsert customer to database
        const { error: upsertError } = await supabase
          .from('woocommerce_customers')
          .upsert(
            {
              company_id: companyId,
              woo_customer_id: customer.id,
              email: customer.email,
              first_name: customer.first_name,
              last_name: customer.last_name,
              phone: customer.phone || '',
              address: customer.billing,
              total_spend: stats.totalSpend,
              total_orders: stats.totalOrders,
              average_order_value: stats.averageOrderValue,
              last_order_date: stats.lastOrderDate,
              first_order_date: stats.firstOrderDate,
              items_purchased: stats.itemsPurchased,
              order_statuses: stats.orderStatuses,
              synced_at: new Date().toISOString()
            },
            { onConflict: 'company_id,woo_customer_id' }
          )

        if (!upsertError) syncedCount++
      } catch (error) {
        console.error(`Failed to sync customer ${customer.id}:`, error)
      }
    }

    // Update last synced timestamp
    await supabase
      .from('woocommerce_integrations')
      .update({ last_synced_at: new Date().toISOString() })
      .eq('company_id', companyId)

    return NextResponse.json({
      success: true,
      message: `Synced ${syncedCount} customers from WooCommerce`,
      syncedCount,
      totalCustomers: customers.length
    })
  } catch (error: any) {
    console.error('[WooCommerce Sync] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Sync failed' },
      { status: 500 }
    )
  }
}
