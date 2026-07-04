import { NextRequest, NextResponse } from 'next/server'
import { SyncProgressService } from '@/lib/sync-progress'

export async function GET(req: NextRequest) {
  try {
    const companyId = req.nextUrl.searchParams.get('companyId')

    if (!companyId) {
      return NextResponse.json(
        { error: 'Missing companyId' },
        { status: 400 }
      )
    }

    const progress = SyncProgressService.getProgress(companyId)

    if (!progress) {
      return NextResponse.json({
        status: 'idle',
        message: 'No sync in progress',
        progress: null
      })
    }

    return NextResponse.json({
      status: progress.status,
      customersProcessed: progress.customersProcessed,
      totalCustomers: progress.totalCustomers,
      ordersProcessed: progress.ordersProcessed,
      currentCustomer: progress.currentCustomer,
      percentComplete: progress.percentComplete,
      estimatedTimeRemaining: progress.estimatedTimeRemaining,
      error: progress.error
    })
  } catch (error: any) {
    console.error('[Sync Progress] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to get sync progress' },
      { status: 500 }
    )
  }
}
