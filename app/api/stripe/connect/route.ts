import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function stripe() {
  const secret = (process.env.STRIPE_SECRET_KEY || '').trim()
  if (!secret.startsWith('sk_')) throw new Error('Stripe not configured — add STRIPE_SECRET_KEY.')
  return new Stripe(secret, { apiVersion: '2024-06-20' as any })
}

// Creates (or reuses) a Stripe Connect account for the company and returns an
// onboarding link. Lets businesses connect their own Stripe to receive payments.
export async function POST(req: NextRequest) {
  try {
    const { companyId } = await req.json()
    if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })

    const db = admin()
    const s = stripe()
    const origin = req.headers.get('origin') || process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com'

    const { data: company } = await db.from('companies').select('*').eq('id', companyId).maybeSingle()
    let accountId = company?.stripe_account_id

    // Create an Express connected account if none exists
    if (!accountId) {
      const account = await s.accounts.create({
        type: 'express',
        country: 'AU',
        email: company?.business_email || undefined,
        business_profile: { name: company?.name || undefined },
        capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
      })
      accountId = account.id
      await db.from('companies').update({ stripe_account_id: accountId }).eq('id', companyId)
    }

    // Create an account onboarding link
    const link = await s.accountLinks.create({
      account: accountId,
      refresh_url: `${origin}/admin/integrations/stripe?refresh=1`,
      return_url: `${origin}/admin/integrations/stripe?connected=1`,
      type: 'account_onboarding',
    })

    return NextResponse.json({ url: link.url })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// GET: check connection status (and mark connected if charges are enabled)
export async function GET(req: NextRequest) {
  try {
    const companyId = req.nextUrl.searchParams.get('companyId')
    if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })
    const db = admin()
    const { data: company } = await db.from('companies').select('stripe_account_id, stripe_connected, business_email').eq('id', companyId).maybeSingle()
    if (!company?.stripe_account_id) return NextResponse.json({ connected: false })

    const s = stripe()
    const account = await s.accounts.retrieve(company.stripe_account_id)
    const connected = !!account.charges_enabled
    if (connected !== company.stripe_connected) {
      await db.from('companies').update({ stripe_connected: connected }).eq('id', companyId)
    }
    return NextResponse.json({ connected, chargesEnabled: account.charges_enabled, detailsSubmitted: account.details_submitted, accountId: company.stripe_account_id })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
