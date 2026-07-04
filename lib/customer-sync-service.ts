/**
 * Customer Sync Service - Automatically sync customers from WooCommerce
 */

import { createClient } from '@supabase/supabase-js'

interface SyncResult {
  success: boolean
  newCount: number
  updatedCount: number
  totalCount: number
  message: string
}

export async function autoSyncWooCommerceCustomers(
  companyId: string,
  forceSync: boolean = false
): Promise<SyncResult> {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    )

    // Get WooCommerce integration
    const { data: integration } = await supabase
      .from('woocommerce_integrations')
      .select('*')
      .eq('company_id', companyId)
      .single()

    if (!integration || !integration.is_active) {
      return {
        success: false,
        newCount: 0,
        updatedCount: 0,
        totalCount: 0,
        message: 'WooCommerce integration not configured'
      }
    }

    // Check if we should sync based on last sync time
    if (!forceSync && integration.last_synced_at) {
      const lastSync = new Date(integration.last_synced_at).getTime()
      const now = Date.now()
      const hoursSinceSync = (now - lastSync) / (1000 * 60 * 60)

      // Skip if synced less than 1 hour ago (unless forced)
      if (hoursSinceSync < 1) {
        return {
          success: true,
          newCount: 0,
          updatedCount: 0,
          totalCount: 0,
          message: `Last synced ${Math.round(hoursSinceSync * 60)} minutes ago`
        }
      }
    }

    // Fetch customers from WooCommerce
    const wooCustomers = await fetchWooCommerceCustomers(integration)

    if (!wooCustomers || wooCustomers.length === 0) {
      return {
        success: true,
        newCount: 0,
        updatedCount: 0,
        totalCount: 0,
        message: 'No customers found in WooCommerce'
      }
    }

    // Get existing customers
    const { data: existingCustomers } = await supabase
      .from('woocommerce_customers')
      .select('woo_customer_id')
      .eq('company_id', companyId)

    const existingIds = new Set((existingCustomers || []).map(c => c.woo_customer_id))

    // Separate new and existing customers
    const newCustomers = wooCustomers.filter(c => !existingIds.has(c.id))
    const existingCustomersToUpdate = wooCustomers.filter(c => existingIds.has(c.id))

    // Insert new customers
    let newCount = 0
    if (newCustomers.length > 0) {
      const { error } = await supabase
        .from('woocommerce_customers')
        .insert(
          newCustomers.map(c => ({
            company_id: companyId,
            woo_customer_id: c.id,
            email: c.email,
            first_name: c.first_name,
            last_name: c.last_name,
            phone: c.billing?.phone || '',
            address: c.billing,
            total_spend: parseFloat(c.total_spent || '0'),
            total_orders: 0,
            average_order_value: 0,
            last_order_date: null,
            first_order_date: null,
            items_purchased: [],
            order_statuses: {},
            synced_at: new Date().toISOString()
          }))
        )

      if (!error) {
        newCount = newCustomers.length
      }
    }

    // Update existing customers
    let updatedCount = 0
    for (const customer of existingCustomersToUpdate) {
      const { error } = await supabase
        .from('woocommerce_customers')
        .update({
          email: customer.email,
          first_name: customer.first_name,
          last_name: customer.last_name,
          phone: customer.billing?.phone || '',
          address: customer.billing,
          total_spend: parseFloat(customer.total_spent || '0'),
          synced_at: new Date().toISOString()
        })
        .eq('woo_customer_id', customer.id)
        .eq('company_id', companyId)

      if (!error) {
        updatedCount++
      }
    }

    // Update last sync time
    await supabase
      .from('woocommerce_integrations')
      .update({ last_synced_at: new Date().toISOString() })
      .eq('company_id', companyId)

    return {
      success: true,
      newCount,
      updatedCount,
      totalCount: wooCustomers.length,
      message: `Synced ${newCount} new and ${updatedCount} updated customers`
    }
  } catch (error: any) {
    console.error('Customer sync error:', error)
    return {
      success: false,
      newCount: 0,
      updatedCount: 0,
      totalCount: 0,
      message: error.message || 'Sync failed'
    }
  }
}

/**
 * Fetch all customers from WooCommerce with pagination
 */
async function fetchWooCommerceCustomers(integration: any): Promise<any[]> {
  try {
    const credentials = `${integration.consumer_key}:${integration.consumer_secret}`
    const basicAuth = Buffer.from(credentials).toString('base64')

    const allCustomers: any[] = []
    let page = 1
    let hasMore = true
    const perPage = 100

    while (hasMore) {
      const response = await fetch(
        `${integration.store_url}/wp-json/wc/v3/customers?per_page=${perPage}&page=${page}`,
        {
          headers: {
            'Authorization': `Basic ${basicAuth}`,
            'Content-Type': 'application/json'
          }
        }
      )

      if (!response.ok) {
        throw new Error(`WooCommerce API error: ${response.statusText}`)
      }

      const customers = await response.json()
      allCustomers.push(...customers)

      const totalPages = response.headers.get('x-wp-totalpages')
      if (totalPages && page < parseInt(totalPages)) {
        page++
      } else {
        hasMore = false
      }
    }

    return allCustomers
  } catch (error) {
    console.error('Failed to fetch WooCommerce customers:', error)
    throw error
  }
}
