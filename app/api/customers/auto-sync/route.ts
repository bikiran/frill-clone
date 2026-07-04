import { NextRequest, NextResponse } from 'next/server'
import { autoSyncWooCommerceCustomers } from '@/lib/customer-sync-service'

/**
 * POST /api/customers/auto-sync
 * Automatically sync customers from WooCommerce
 * Can be called manually or by webhook/cron
 */
export async function POST(req: NextRequest) {
  try {
    const { companyId, force } = await req.json()

    if (!companyId) {
      return NextResponse.json(
        { error: 'Company ID required' },
        { status: 400 }
      )
    }

    const result = await autoSyncWooCommerceCustomers(
      companyId,
      force === true
    )

    return NextResponse.json(result)
  } catch (error: any) {
    console.error('[Auto Sync] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Sync failed' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/customers/auto-sync
 * Check sync status
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const companyId = searchParams.get('companyId')

    if (!companyId) {
      return NextResponse.json(
        { error: 'Company ID required' },
        { status: 400 }
      )
    }

    // Just trigger a sync without force
    const result = await autoSyncWooCommerceCustomers(companyId, false)

    return NextResponse.json(result)
  } catch (error: any) {
    console.error('[Auto Sync Check] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Check failed' },
      { status: 500 }
    )
  }
}
