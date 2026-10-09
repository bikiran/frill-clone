import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isShopDomain } from '@/lib/shopify-auth'
import { adoptShopifyBilling, syncShopifyBilling } from '@/lib/shopify-billing'
import { workspacePage } from '@/lib/shopify-install'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const billingPage = (integrationsPage: string) => integrationsPage.replace(/\/admin\/integrations\/shopify$/, '/admin/billing')

/**
 * GET /api/shopify/billing/return?plan_handle&shop — the "welcome link" on each
 * Colvy plan in the Partner Dashboard. Shopify sends the merchant here after
 * they pick a plan. The parameters aren't signed, so they only say which store
 * to look at: the plan itself is re-read from Shopify's Partner API.
 */
export async function GET(req: NextRequest) {
  const shop = (req.nextUrl.searchParams.get('shop') || '').toLowerCase()
  const hint = req.nextUrl.searchParams.get('plan_handle')
  const fallback = 'https://colvy.com/admin/billing'
  if (!isShopDomain(shop)) return NextResponse.redirect(fallback)

  const db = admin()
  const { data: integs } = await db.from('shopify_integrations').select('id, company_id')
    .eq('store_domain', shop).eq('is_active', true).eq('auth_type', 'oauth').order('updated_at', { ascending: false }).limit(1)
  const integ = integs?.[0]
  if (!integ) return NextResponse.redirect(fallback)

  let status = 'updated'
  try {
    // A store connected before Shopify billing existed may pick a plan from
    // Shopify directly; it follows that subscription from now on if eligible.
    await adoptShopifyBilling(db, integ.company_id, integ.id)
    const res = await syncShopifyBilling(db, integ.company_id, { hint })
    if (!res) status = 'pending'
  } catch { status = 'pending' }

  const u = new URL(billingPage(await workspacePage(db, integ.company_id)))
  u.searchParams.set('shopify_plan', status)
  return NextResponse.redirect(u.toString())
}
