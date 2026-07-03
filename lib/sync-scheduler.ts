/**
 * Scheduled WooCommerce Sync Service
 * Uses API calls to trigger syncs on a schedule
 * In production, use a job queue service (Bull, Agenda, etc)
 */

import { createClient } from '@supabase/supabase-js'
import { WooCommerceService } from './woocommerce-service'

interface SyncJob {
  companyId: string
  frequency: number // minutes
  lastSync?: Date
}

export class SyncScheduler {
  private jobs: Map<string, NodeJS.Timeout> = new Map()
  private supabase: any

  constructor(supabase: any) {
    this.supabase = supabase
  }

  /**
   * Start scheduled sync for a company
   */
  async startSchedule(companyId: string, frequencyMinutes: number = 60) {
    try {
      // Stop existing job if running
      this.stopSchedule(companyId)

      const interval = frequencyMinutes * 60 * 1000 // Convert to milliseconds

      // Run immediately
      await this.runSync(companyId)

      // Then schedule for future
      const timeoutId = setInterval(async () => {
        await this.runSync(companyId)
      }, interval)

      this.jobs.set(companyId, timeoutId)
      console.log(`Sync scheduled for company ${companyId} every ${frequencyMinutes} minutes`)
    } catch (error) {
      console.error(`Failed to start schedule for ${companyId}:`, error)
    }
  }

  /**
   * Stop scheduled sync for a company
   */
  stopSchedule(companyId: string) {
    const timeoutId = this.jobs.get(companyId)
    if (timeoutId) {
      clearInterval(timeoutId)
      this.jobs.delete(companyId)
      console.log(`Sync stopped for company ${companyId}`)
    }
  }

  /**
   * Run sync now
   */
  private async runSync(companyId: string) {
    try {
      const { data: integration } = await this.supabase
        .from('woocommerce_integrations')
        .select('*')
        .eq('company_id', companyId)
        .single()

      if (!integration || !integration.is_active) return

      const woo = new WooCommerceService({
        storeUrl: integration.store_url,
        consumerKey: integration.consumer_key,
        consumerSecret: integration.consumer_secret,
        companyId
      })

      // Test connection
      const isConnected = await woo.testConnection()
      if (!isConnected) return

      // Fetch and sync customers
      const customers = await woo.getCustomers()
      let syncedCount = 0

      for (const customer of customers) {
        try {
          const stats = await woo.getCustomerStats(customer.id)

          await this.supabase
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

          syncedCount++
        } catch (error) {
          console.error(`Failed to sync customer ${customer.id}:`, error)
        }
      }

      // Update timestamp
      await this.supabase
        .from('woocommerce_integrations')
        .update({ last_synced_at: new Date().toISOString() })
        .eq('company_id', companyId)

      console.log(`Scheduled sync complete for ${companyId}: ${syncedCount} customers`)
    } catch (error) {
      console.error(`Scheduled sync failed for ${companyId}:`, error)
    }
  }

  /**
   * Get all active schedules (for monitoring)
   */
  getActiveSchedules(): string[] {
    return Array.from(this.jobs.keys())
  }
}

// Global instance for server
let schedulerInstance: SyncScheduler | null = null

export function getSyncScheduler(supabase: any): SyncScheduler {
  if (!schedulerInstance) {
    schedulerInstance = new SyncScheduler(supabase)
  }
  return schedulerInstance
}
