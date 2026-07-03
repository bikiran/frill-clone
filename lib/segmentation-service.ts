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
   * Get customer RFM score (Recency, Frequency, Monetary)
   */
  static getRFMScore(customer: any): number {
    let score = 0

    // Recency (0-3 points)
    if (customer.last_order_date) {
      const daysSinceOrder = Math.floor((Date.now() - new Date(customer.last_order_date).getTime()) / (1000 * 60 * 60 * 24))
      if (daysSinceOrder < 30) score += 3
      else if (daysSinceOrder < 90) score += 2
      else if (daysSinceOrder < 180) score += 1
    }

    // Frequency (0-3 points)
    const daysSinceFirstOrder = customer.first_order_date
      ? Math.floor((Date.now() - new Date(customer.first_order_date).getTime()) / (1000 * 60 * 60 * 24))
      : 365
    const frequency = daysSinceFirstOrder > 0 
      ? (customer.total_orders / daysSinceFirstOrder) * 365 
      : 0

    if (frequency >= 12) score += 3
    else if (frequency >= 4) score += 2
    else if (frequency >= 1) score += 1

    // Monetary (0-3 points)
    if (customer.total_spend >= 5000) score += 3
    else if (customer.total_spend >= 1000) score += 2
    else if (customer.total_spend >= 100) score += 1

    return score // 0-9
  }

  /**
   * Categorize by RFM score
   */
  static getRFMCategory(score: number): string {
    if (score >= 8) return 'Champions'
    if (score >= 6) return 'Loyal Customers'
    if (score >= 4) return 'Potential Loyalists'
    if (score >= 2) return 'At Risk'
    return 'Lost'
  }
}
