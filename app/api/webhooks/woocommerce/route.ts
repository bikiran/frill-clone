import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { WebhookService } from '@/lib/webhook-service'

/**
 * POST /api/webhooks/woocommerce
 * Receive real-time events from WooCommerce
 * Automatically syncs customer and order data
 */
export async function POST(req: NextRequest) {
  try {
    const payload = await req.text()
    const signature = req.headers.get('x-wc-webhook-signature') || ''
    const deliveryId = req.headers.get('x-wc-webhook-delivery-id') || ''
    
    const data = JSON.parse(payload)
    const resource = data.resource
    const resourceId = data.id
    
    // Company ID should be sent in header when webhook is registered
    const companyId = req.headers.get('x-company-id')
    if (!companyId) {
      return NextResponse.json(
        { error: 'Missing company ID header' },
        { status: 400 }
      )
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    )

    const webhookService = new WebhookService(supabase)
    await webhookService.processWebhook(companyId, {
      resource,
      id: resourceId,
      action: 'updated',
      ...data
    })

    return NextResponse.json({
      success: true,
      message: 'Webhook processed',
      deliveryId
    })
  } catch (error: any) {
    console.error('[Webhook] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Webhook processing failed' },
      { status: 500 }
    )
  }
}
