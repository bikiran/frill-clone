import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireCompanyAdmin } from '@/lib/company-access'
import { shopifyBillingStore, PAID_STATUSES } from '@/lib/shopify-billing'
import { COLVY_CONTACT } from '@/lib/colvy-contact'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// POST { companyId } — for a workspace now billed through Shopify that still
// has a Colvy card subscription from before: stop that subscription at the
// end of the period it's paid for, so it isn't billed twice. No Stripe page is
// shown (App Store rule 1.2.1: no off-Shopify billing screens); the plan the
// workspace has comes from Shopify from then on.
export async function POST(req: NextRequest) {
  const { companyId } = await req.json().catch(() => ({}))
  const db = admin()
  const access = await requireCompanyAdmin(req, db, companyId)
  if (!access.ok) return NextResponse.json({ error: 'Only the workspace owner or an admin can do this.' }, { status: 403 })
  if (!(await shopifyBillingStore(db, companyId))) return NextResponse.json({ error: 'This workspace isn’t billed through Shopify.' }, { status: 409 })
  const { data: co } = await db.from('companies').select('owner_id').eq('id', companyId).maybeSingle()
  const { data: subs } = co?.owner_id ? await db.from('subscriptions').select('stripe_subscription_id, status').eq('user_id', co.owner_id).limit(1) : { data: [] as any[] }
  const sub = subs?.[0]
  if (!sub?.stripe_subscription_id || !PAID_STATUSES.includes(String(sub.status))) return NextResponse.json({ ok: true, none: true })
  const secret = String(process.env.STRIPE_SECRET_KEY || '').trim()
  if (!secret.startsWith('sk_')) return NextResponse.json({ error: `This can’t be done online just now. Contact us at ${COLVY_CONTACT.email} and we’ll cancel it for you.` }, { status: 503 })
  try {
    const Stripe = (await import('stripe')).default
    const stripe = new Stripe(secret, { apiVersion: '2024-06-20' as any })
    const updated: any = await stripe.subscriptions.update(sub.stripe_subscription_id, { cancel_at_period_end: true })
    const endsAt = updated?.current_period_end ? new Date(updated.current_period_end * 1000).toISOString() : null
    return NextResponse.json({ ok: true, endsAt })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Couldn’t cancel the card subscription.' }, { status: 500 })
  }
}
