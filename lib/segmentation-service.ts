/**
 * Customer Segmentation Service
 * Segments customers by value, frequency, products, etc.
 */

export interface CustomerSegment {
  id: string
  name: string
  description: string
  criteria: SegmentationCriteria
  customerCount?: number
}

export interface SegmentationCriteria {
  minSpend?: number
  maxSpend?: number
  minOrders?: number
  maxOrders?: number
  minFrequency?: number // orders per year
  maxFrequency?: number
  minDaysSinceOrder?: number // "inactive" customers
  maxDaysSinceOrder?: number
  products?: string[] // items purchased must include these
  orderStatuses?: string[] // filter by order status
}

export class SegmentationService {
  /**
   * Pre-defined segment templates
   */
  static getSegments(): CustomerSegment[] {
    return [
      {
        id: 'vip',
        name: 'VIP Customers',
        description: 'High-value, loyal customers',
        criteria: {
          minSpend: 1000,
          minOrders: 3
        }
      },
      {
        id: 'active',
        name: 'Active Buyers',
        description: 'Recently purchased',
        criteria: {
          maxDaysSinceOrder: 30
        }
      },
      {
        id: 'at-risk',
        name: 'At-Risk Customers',
        description: 'Haven\'t purchased in 3+ months',
        criteria: {
          minDaysSinceOrder: 90,
          minOrders: 1
        }
      },
      {
        id: 'frequent',
        name: 'Frequent Buyers',
        description: 'Buy 4+ times per year',
        criteria: {
          minFrequency: 4
        }
      },
      {
        id: 'new',
        name: 'New Customers',
        description: 'Single purchase in last 30 days',
        criteria: {
          maxOrders: 1,
          maxDaysSinceOrder: 30
        }
      },
      {
        id: 'high-volume',
        name: 'High Volume Spenders',
        description: 'Total spend > $5000',
        criteria: {
          minSpend: 5000
        }
      }
    ]
  }

  /**
   * Filter customers by segment
   */
  static filterBySegment(
    customers: any[],
    segment: CustomerSegment
  ): any[] {
    return customers.filter(customer => 
      this.matchesCriteria(customer, segment.criteria)
    )
  }

  /**
   * Check if customer matches criteria
   */
  private static matchesCriteria(
    customer: any,
    criteria: SegmentationCriteria
  ): boolean {
    // Spend
    if (criteria.minSpend && customer.total_spend < criteria.minSpend) {
      return false
    }
    if (criteria.maxSpend && customer.total_spend > criteria.maxSpend) {
      return false
    }

    // Orders
    if (criteria.minOrders && customer.total_orders < criteria.minOrders) {
      return false
    }
    if (criteria.maxOrders && customer.total_orders > criteria.maxOrders) {
      return false
    }

    // Frequency (orders per year)
    const daysSinceFirstOrder = customer.first_order_date
      ? Math.floor((Date.now() - new Date(customer.first_order_date).getTime()) / (1000 * 60 * 60 * 24))
      : 0
    const frequency = daysSinceFirstOrder > 0 
      ? (customer.total_orders / daysSinceFirstOrder) * 365 
      : 0

    if (criteria.minFrequency && frequency < criteria.minFrequency) {
      return false
    }
    if (criteria.maxFrequency && frequency > criteria.maxFrequency) {
      return false
    }

    // Days since last order
    if (customer.last_order_date) {
      const daysSinceLastOrder = Math.floor((Date.now() - new Date(customer.last_order_date).getTime()) / (1000 * 60 * 60 * 24))
      
      if (criteria.minDaysSinceOrder && daysSinceLastOrder < criteria.minDaysSinceOrder) {
        return false
      }
      if (criteria.maxDaysSinceOrder && daysSinceLastOrder > criteria.maxDaysSinceOrder) {
        return false
      }
    }

    // Products
    if (criteria.products && criteria.products.length > 0) {
      const hasProduct = criteria.products.some(product =>
        customer.items_purchased?.includes(product)
      )
      if (!hasProduct) return false
    }

    // Order statuses
    if (criteria.orderStatuses && criteria.orderStatuses.length > 0) {
      const hasStatus = criteria.orderStatuses.some(status =>
        customer.order_statuses?.[status] > 0
      )
      if (!hasStatus) return false
    }

    return true
  }

  /**
   * Normalise the inputs the RFM score needs from a customer record, tolerating
   * the many shapes they arrive in (the aggregate columns are often null on the
   * customer row while the real data lives in the order history). Callers that
   * have already computed the effective totals/dates (e.g. the profile page,
   * which derives them from the fetched orders) can pass them via `override`.
   */
  private static rfmInputs(customer: any, override?: RFMOverride) {
    const num = (v: any) => { const n = parseFloat(v); return isFinite(n) ? n : 0 }
    const spend = num(override?.totalSpend ?? customer?.total_spend ?? customer?.total_spent ?? customer?.lifetime_spend ?? 0)
    const orders = Math.round(num(override?.totalOrders ?? customer?.total_orders ?? customer?.orders_count ?? customer?.order_count ?? 0))
    const lastRaw = override?.lastOrderDate ?? customer?.last_order_date ?? customer?.last_order ?? null
    const firstRaw = override?.firstOrderDate ?? customer?.first_order_date ?? null
    const toDays = (raw: any): number | null => {
      if (!raw) return null
      const t = new Date(raw).getTime()
      return isFinite(t) ? Math.floor((Date.now() - t) / 86400000) : null
    }
    const hasData = orders > 0 || spend > 0
    return { spend, orders, daysSinceLast: toDays(lastRaw), hasData }
  }

  /**
   * RFM score. Each of Recency / Frequency / Monetary scores 1–3 whenever the
   * customer has *any* purchase history, so a real customer is never a raw 0/9.
   * Total ranges 3–9 with data, and only returns 0 when there is genuinely no
   * usable purchase data at all.
   */
  static getRFMScore(customer: any, override?: RFMOverride): number {
    const { spend, orders, daysSinceLast, hasData } = this.rfmInputs(customer, override)
    if (!hasData) return 0

    let score = 0
    // Recency (1–3): Recent / Moderate / Old. Unknown date → neutral (2) rather
    // than penalising a customer we simply lack a date for.
    if (daysSinceLast == null) score += 2
    else if (daysSinceLast < 60) score += 3
    else if (daysSinceLast < 180) score += 2
    else score += 1
    // Frequency (1–3): 1 purchase / 2–4 / 5+.
    if (orders >= 5) score += 3
    else if (orders >= 2) score += 2
    else score += 1
    // Monetary (1–3): Low / Medium / High.
    if (spend >= 1000) score += 3
    else if (spend >= 300) score += 2
    else score += 1

    return score // 3–9 (or 0 when there's no data)
  }

  /**
   * Canonical RFM category — used for FILTERING and segment buckets, so these
   * exact strings must stay stable (several pages match on them). For a
   * customer-facing label use getLifecycleLabel instead.
   *   8–9 Champions · 6–7 Loyal Customers · 4–5 Potential Loyalists ·
   *   2–3 At Risk · 0–1 Lost
   */
  static getRFMCategory(score: number): string {
    if (score >= 8) return 'Champions'
    if (score >= 6) return 'Loyal Customers'
    if (score >= 4) return 'Potential Loyalists'
    if (score >= 2) return 'At Risk'
    return 'Lost'
  }

  /**
   * Friendly, display-facing label for a customer profile.
   *   8–9 Champion · 6–7 Loyal · 4–5 Needs attention · 2–3 At risk · 0–1 Lost
   * A customer with a single, non-lapsed order is a "New customer" rather than
   * being mislabelled too early; with no purchase data at all it's "No orders".
   */
  static getLifecycleLabel(customer: any, override?: RFMOverride): string {
    const { orders, daysSinceLast, hasData } = this.rfmInputs(customer, override)
    if (!hasData) return 'No orders'
    if (orders === 1 && (daysSinceLast == null || daysSinceLast < 180)) return 'New customer'
    const s = this.getRFMScore(customer, override)
    if (s >= 8) return 'Champion'
    if (s >= 6) return 'Loyal'
    if (s >= 4) return 'Needs attention'
    if (s >= 2) return 'At risk'
    return 'Lost'
  }
}

/** Optional pre-computed RFM inputs a caller can pass to override the record. */
export type RFMOverride = {
  totalSpend?: number
  totalOrders?: number
  lastOrderDate?: any
  firstOrderDate?: any
}
