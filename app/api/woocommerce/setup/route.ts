import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { WooCommerceService } from '@/lib/woocommerce-service'

/**
 * POST /api/woocommerce/setup
 * Configure WooCommerce integration for a company
 */
export async function POST(req: NextRequest) {
  try {
    const { companyId, storeUrl, consumerKey, consumerSecret, isUpdate } = await req.json()

    // Always require company ID and store URL
    if (!companyId || !storeUrl) {
      return NextResponse.json(
        { error: 'Missing company ID or store URL' },
        { status: 400 }
      )
    }

    // For new integrations, require both keys
    // For updates, only test if new keys are provided
    if (!isUpdate && (!consumerKey || !consumerSecret)) {
      return NextResponse.json(
        { error: 'Consumer Key and Secret are required for new integrations' },
        { status: 400 }
      )
    }

    // Normalize store URL (remove trailing slash)
    const normalizedUrl = storeUrl.replace(/\/$/, '')

    // If updating credentials, test with new ones; otherwise fetch existing
    let keysToUse = { consumerKey, consumerSecret }
    
    if (isUpdate && (!consumerKey || !consumerSecret)) {
      // Updating but not changing credentials - fetch existing ones
      const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL || '',
        process.env.SUPABASE_SERVICE_ROLE_KEY || ''
      )
      
      const { data: existing } = await sb
        .from('woocommerce_integrations')
        .select('consumer_key, consumer_secret')
        .eq('company_id', companyId)
        .single()
      
      if (existing) {
        keysToUse = {
          consumerKey: consumerKey || existing.consumer_key,
          consumerSecret: consumerSecret || existing.consumer_secret
        }
      }
    }

    // Test the credentials
    const woo = new WooCommerceService({
      storeUrl: normalizedUrl,
      consumerKey: keysToUse.consumerKey,
      consumerSecret: keysToUse.consumerSecret,
      companyId
    })

    const isConnected = await woo.testConnection()
    if (!isConnected) {
      return NextResponse.json(
        { error: 'Failed to connect with provided credentials. Check your store URL and API keys.' },
        { status: 401 }
      )
    }

    // Lazy load Supabase
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    )

    // Build update payload - only include provided fields
    const updatePayload: any = {
      company_id: companyId,
      store_url: normalizedUrl,
      is_active: true
    }

    // Only update credentials if provided
    if (consumerKey) updatePayload.consumer_key = consumerKey
    if (consumerSecret) updatePayload.consumer_secret = consumerSecret

    // Save integration settings
    const { data, error } = await supabase
      .from('woocommerce_integrations')
      .upsert(
        updatePayload,
        { onConflict: 'company_id' }
      )
      .select()
      .single()

    if (error) {
      console.error('Failed to save WooCommerce integration:', error)
      return NextResponse.json(
        { error: 'Failed to save integration settings' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'WooCommerce integration configured successfully',
      data
    })
  } catch (error: any) {
    console.error('[WooCommerce Setup] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Setup failed' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/woocommerce/setup
 * Get current WooCommerce integration settings (without secrets)
 */
export async function GET(req: NextRequest) {
  try {
    const companyId = req.nextUrl.searchParams.get('companyId')

    if (!companyId) {
      return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })
    }

    // Lazy load Supabase
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    )

    const { data, error } = await supabase
      .from('woocommerce_integrations')
      .select('id, company_id, store_url, is_active, last_synced_at, sync_frequency_minutes')
      .eq('company_id', companyId)
      .single()

    if (error) {
      return NextResponse.json({ data: null }, { status: 200 })
    }

    return NextResponse.json({ data })
  } catch (error: any) {
    console.error('[WooCommerce Setup] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch settings' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/woocommerce/setup
 * Disconnect WooCommerce integration
 */
export async function DELETE(req: NextRequest) {
  try {
    const { companyId } = await req.json()

    if (!companyId) {
      return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })
    }

    // Lazy load Supabase
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    )

    const { error } = await supabase
      .from('woocommerce_integrations')
      .delete()
      .eq('company_id', companyId)

    if (error) {
      return NextResponse.json(
        { error: 'Failed to disconnect' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, message: 'Disconnected from WooCommerce' })
  } catch (error: any) {
    console.error('[WooCommerce Setup] Delete error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to disconnect' },
      { status: 500 }
    )
  }
}
