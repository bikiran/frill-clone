import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { WooCommerceService } from '@/lib/woocommerce-service'

/**
 * POST /api/woocommerce/sync/schedule
 * Enable or update scheduled sync frequency for WooCommerce integration
 */
export async function POST(req: NextRequest) {
  try {
    const { companyId, frequencyMinutes } = await req.json()

    if (!companyId || !frequencyMinutes) {
      return NextResponse.json(
        { error: 'Missing companyId or frequencyMinutes' },
        { status: 400 }
      )
    }

    // Validate frequency (min 15 min, max 1440 min = 24 hours)
    if (frequencyMinutes < 15 || frequencyMinutes > 1440) {
      return NextResponse.json(
        { error: 'Frequency must be between 15 and 1440 minutes' },
        { status: 400 }
      )
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    )

    // Update integration with new sync frequency
    const { error: updateError } = await supabase
      .from('woocommerce_integrations')
      .update({ sync_frequency_minutes: frequencyMinutes })
      .eq('company_id', companyId)

    if (updateError) {
      return NextResponse.json(
        { error: 'Failed to update sync frequency' },
        { status: 500 }
      )
    }

    // In a production system, you would:
    // 1. Update a job queue (Bull, Agenda, etc)
    // 2. Or update a cron service (AWS EventBridge, GCP Cloud Scheduler, etc)
    // 3. Or use a serverless function trigger (Vercel Cron, AWS Lambda, etc)

    return NextResponse.json({
      success: true,
      message: `Sync scheduled every ${frequencyMinutes} minutes`,
      frequencyMinutes
    })
  } catch (error: any) {
    console.error('[Sync Schedule] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to schedule sync' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/woocommerce/sync/schedule
 * Get current sync schedule for a company
 */
export async function GET(req: NextRequest) {
  try {
    const companyId = req.nextUrl.searchParams.get('companyId')

    if (!companyId) {
      return NextResponse.json(
        { error: 'Missing companyId' },
        { status: 400 }
      )
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    )

    const { data: integration } = await supabase
      .from('woocommerce_integrations')
      .select('sync_frequency_minutes, last_synced_at')
      .eq('company_id', companyId)
      .single()

    if (!integration) {
      return NextResponse.json(
        { data: null, message: 'Integration not found' },
        { status: 200 }
      )
    }

    const nextSyncTime = integration.last_synced_at
      ? new Date(new Date(integration.last_synced_at).getTime() + integration.sync_frequency_minutes * 60 * 1000)
      : null

    return NextResponse.json({
      frequencyMinutes: integration.sync_frequency_minutes,
      lastSyncedAt: integration.last_synced_at,
      nextSyncTime: nextSyncTime?.toISOString()
    })
  } catch (error: any) {
    console.error('[Sync Schedule] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch schedule' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/woocommerce/sync/schedule
 * Stop scheduled sync for a company
 */
export async function DELETE(req: NextRequest) {
  try {
    const { companyId } = await req.json()

    if (!companyId) {
      return NextResponse.json(
        { error: 'Missing companyId' },
        { status: 400 }
      )
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    )

    // Set frequency to null to disable
    const { error } = await supabase
      .from('woocommerce_integrations')
      .update({ sync_frequency_minutes: null })
      .eq('company_id', companyId)

    if (error) {
      return NextResponse.json(
        { error: 'Failed to stop schedule' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Scheduled sync stopped'
    })
  } catch (error: any) {
    console.error('[Sync Schedule] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to stop schedule' },
      { status: 500 }
    )
  }
}
