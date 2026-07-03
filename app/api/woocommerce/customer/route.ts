import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * GET /api/woocommerce/customer?email=user@example.com&companyId=...
 * Look up customer by email and return their purchase history
 */
export async function GET(req: NextRequest) {
  try {
    const email = req.nextUrl.searchParams.get('email')
    const companyId = req.nextUrl.searchParams.get('companyId')

    if (!email || !companyId) {
      return NextResponse.json(
        { error: 'Missing email or companyId' },
        { status: 400 }
      )
    }

    // Lazy load Supabase inside handler
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    )

    // Look up customer in synced data
    const { data: customer, error: customerError } = await supabase
      .from('woocommerce_customers')
      .select('*')
      .eq('company_id', companyId)
      .eq('email', email)
      .single()

    if (customerError || !customer) {
      return NextResponse.json(
        { data: null, message: 'Customer not found' },
        { status: 200 }
      )
    }

    // Get their orders
    const { data: orders } = await supabase
      .from('woocommerce_orders')
      .select('*')
      .eq('company_id', companyId)
      .eq('woo_customer_id', customer.woo_customer_id)
      .order('order_date', { ascending: false })

    return NextResponse.json({
      customer: {
        id: customer.id,
        wooId: customer.woo_customer_id,
        name: `${customer.first_name} ${customer.last_name}`.trim(),
        email: customer.email,
        phone: customer.phone,
        address: customer.address,
        totalSpend: customer.total_spend,
        totalOrders: customer.total_orders,
        averageOrderValue: customer.average_order_value,
        lastOrderDate: customer.last_order_date,
        firstOrderDate: customer.first_order_date,
        itemsPurchased: customer.items_purchased,
        orderStatuses: customer.order_statuses
      },
      orders: orders || [],
      found: true
    })
  } catch (error: any) {
    console.error('[WooCommerce Customer Lookup] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch customer' },
      { status: 500 }
    )
  }
}
