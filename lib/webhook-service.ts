/**
 * WooCommerce Webhook Handler Service
 * Processes real-time events from WooCommerce
 */

import { createClient } from '@supabase/supabase-js'
import { WooCommerceService } from './woocommerce-service'

interface WebhookPayload {
  event: string
  data: any
  timestamp: number
}

interface WebhookEvent {
  id: string
  action: string
  resource: string
  resource_id: number
  date_created: string
  date_created_gmt: string
}

export class WebhookService {
  private supabase: any

  constructor(supabase: any) {
    this.supabase = supabase
  }

  /**
   * Register webhook with WooCommerce store
   */
  async registerWebhook(
    storeUrl: string,
    consumerKey: string,
    consumerSecret: string,
    topic: 'customer.created' | 'customer.updated' | 'order.created' | 'order.updated'
  ) {
    try {
      const credentials = `${consumerKey}:${consumerSecret}`
      const basicAuth = Buffer.from(credentials).toString('base64')

      const response = await fetch(
        `${storeUrl}/wp-json/wc/v3/webhooks`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${basicAuth}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            name: `Colvy - ${topic}`,
            topic: topic,
            delivery_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/woocommerce`,
            active: true,
            resource: topic.split('.')[0],
            event: topic.split('.')[1]
          })
        }
      )

      return response.ok
    } catch (error) {
      console.error('Failed to register webhook:', error)
      return false
    }
  }

  /**
   * Process incoming webhook from WooCommerce
   */
  async processWebhook(companyId: string, payload: any) {
    try {
      const resource = payload.resource
      const action = payload.action

      switch (resource) {
        case 'customer':
          await this.handleCustomerEvent(companyId, action, payload.id)
          break
        case 'order':
          // Pass the full webhook payload through — order topics deliver the
          // whole order (billing, line_items, totals), so we can persist it
          // without a REST round-trip that would fail if creds are missing.
          await this.handleOrderEvent(companyId, action, payload.id, payload)
          break
        default:
          console.log(`Unknown resource: ${resource}`)
      }

      return { success: true }
    } catch (error) {
      console.error('Webhook processing error:', error)
      throw error
    }
  }

  /**
   * Handle customer events (created/updated)
   */
  private async handleCustomerEvent(companyId: string, action: string, customerId: number) {
    try {
      const { data: integration } = await this.supabase
        .from('woocommerce_integrations')
        .select('*')
        .eq('company_id', companyId)
        .single()

      if (!integration) return

      const woo = new WooCommerceService({
        storeUrl: integration.store_url,
        consumerKey: integration.consumer_key,
        consumerSecret: integration.consumer_secret,
        companyId
      })

      // Fetch and sync single customer
      const response = await fetch(
        `${integration.store_url}/wp-json/wc/v3/customers/${customerId}`,
        {
          headers: {
            'Authorization': `Basic ${Buffer.from(`${integration.consumer_key}:${integration.consumer_secret}`).toString('base64')}`
          }
        }
      )

      if (!response.ok) return

      const customer = await response.json()
      const stats = await woo.getCustomerStats(customer.id)

      // Upsert customer
      await this.supabase
        .from('woocommerce_customers')
        .upsert({
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
        })

      console.log(`Customer ${customerId} ${action}d`)
    } catch (error) {
      console.error(`Failed to handle customer event:`, error)
    }
  }

  /**
   * Handle order events (created/updated)
   */
  private async handleOrderEvent(companyId: string, action: string, orderId: number, payloadOrder?: any) {
    try {
      const { data: integration } = await this.supabase
        .from('woocommerce_integrations')
        .select('*')
        .eq('company_id', companyId)
        .single()

      if (!integration) return

      // Prefer the order object delivered with the webhook — it already carries
      // billing, line_items and totals. Only call back to the REST API when the
      // payload is a bare notification without those fields (so a missing/invalid
      // key can't silently stop orders from being recorded).
      let order: any = payloadOrder && (payloadOrder.line_items || payloadOrder.billing)
        ? payloadOrder
        : null
      if (!order) {
        const basicAuth = Buffer.from(`${integration.consumer_key}:${integration.consumer_secret}`).toString('base64')
        const response = await fetch(
          `${integration.store_url}/wp-json/wc/v3/orders/${orderId}`,
          { headers: { 'Authorization': `Basic ${basicAuth}` } }
        )
        if (!response.ok) return
        order = await response.json()
      }

      // Upsert the order using the ACTUAL columns the Order History panel reads
      // (customer_email, status, total, line_items, billing …). The previous
      // upsert wrote order_total/order_status/items/billing_address/synced_at —
      // none of which exist on this table — so every sync silently failed; and
      // it never wrote customer_email, so even a row that did land was invisible
      // to the email-keyed lookup. Keyed on the UNIQUE(company_id, woo_order_id).
      const orderRow: any = {
        company_id: companyId,
        woo_order_id: order.id,
        woo_customer_id: order.customer_id ?? null,
        customer_email: (order.billing?.email || '').trim().toLowerCase() || null,
        status: (order.status || '').toLowerCase() || null,
        total: parseFloat(order.total) || 0,
        shipping_total: parseFloat(order.shipping_total || '0') || 0,
        currency: order.currency || 'AUD',
        order_date: order.date_created ? new Date(order.date_created).toISOString() : new Date().toISOString(),
        line_items: order.line_items || [],
        billing: order.billing || {},
      }
      const { error: upsertErr } = await this.supabase
        .from('woocommerce_orders')
        .upsert(orderRow, { onConflict: 'company_id,woo_order_id' })
      if (upsertErr) console.error('[WebhookService] woocommerce_orders upsert failed:', upsertErr)

      // Re-sync customer stats (best-effort; guest orders have customer_id 0).
      if (!order.customer_id) { console.log(`Order ${orderId} ${action}d`); return }
      const { data: customer } = await this.supabase
        .from('woocommerce_customers')
        .select('*')
        .eq('woo_customer_id', order.customer_id)
        .single()

      if (customer) {
        const woo = new WooCommerceService({
          storeUrl: integration.store_url,
          consumerKey: integration.consumer_key,
          consumerSecret: integration.consumer_secret,
          companyId
        })

        const stats = await woo.getCustomerStats(order.customer_id)

        await this.supabase
          .from('woocommerce_customers')
          .update({
            total_spend: stats.totalSpend,
            total_orders: stats.totalOrders,
            average_order_value: stats.averageOrderValue,
            last_order_date: stats.lastOrderDate,
            order_statuses: stats.orderStatuses,
            synced_at: new Date().toISOString()
          })
          .eq('id', customer.id)
      }

      console.log(`Order ${orderId} ${action}d`)
    } catch (error) {
      console.error(`Failed to handle order event:`, error)
    }
  }

  /**
   * Verify webhook signature
   */
  verifySignature(payload: string, signature: string, secret: string): boolean {
    const crypto = require('crypto')
    const hash = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('base64')
    return hash === signature
  }
}
