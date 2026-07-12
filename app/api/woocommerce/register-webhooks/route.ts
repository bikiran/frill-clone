import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { WooCommerceService } from '@/lib/woocommerce-service'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// Registers (or reconciles) the WooCommerce order webhooks that Colvy needs so a
// new order opens a chat. Without these, orders never reach Colvy and no chat is
// created — which is exactly the bug this fixes.
export async function POST(req: NextRequest) {
  try {
    const { companyId } = await req.json()
    if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 })
    const db = admin()

    const { data: integs } = await db
      .from('integrations')
      .select('*')
      .eq('company_id', companyId)
      .eq('type', 'woocommerce')
      .eq('is_active', true)

    if (!integs || integs.length === 0) {
      return NextResponse.json({ error: 'No active WooCommerce integration found. Connect your store first.' }, { status: 400 })
    }

    const base = process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com'
    const summary: any[] = []

    for (const integ of integs) {
      const deliveryUrl = `${base}/api/webhooks/woocommerce?company=${companyId}&integration=${integ.id}`
      try {
        const woo = new WooCommerceService({
          storeUrl: (integ.store_url || '').replace(/\/$/, ''),
          consumerKey: integ.consumer_key,
          consumerSecret: integ.consumer_secret,
        })
        const results = await woo.ensureColvyWebhooks(deliveryUrl)
        summary.push({ store: integ.store_url, deliveryUrl, results })
      } catch (e: any) {
        summary.push({ store: integ.store_url, error: e.message })
      }
    }

    return NextResponse.json({ ok: true, summary })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
