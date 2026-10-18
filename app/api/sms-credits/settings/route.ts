import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { smsCreditsAccess } from '@/lib/sms-credits-access'
import { getWallet } from '@/lib/sms-credits'
import { validateAutoTopUp } from '@/lib/sms-credits-core'

export const dynamic = 'force-dynamic'

// POST /api/sms-credits/settings
//   { companyId, enabled, thresholdCents, amountCents }  auto top-up settings
//   { companyId, removeCard: true }                      forget the saved card
// Owner / admin only. Turning auto top-up on needs a saved card: the first one
// is saved by a top-up with "Top up automatically" ticked (./topup). Turning it
// on (again) clears the failure count.

const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const companyId = body?.companyId ? String(body.companyId) : null
    const db: any = admin()
    const access = await smsCreditsAccess(req, db, companyId, 'manage')
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })
    const id = String(companyId)
    const wallet = await getWallet(db, id)
    if (!wallet.ready) return NextResponse.json({ error: 'SMS credits aren’t set up yet. Try again later.', notReady: true }, { status: 409 })

    const now = new Date().toISOString()
    let patch: Record<string, any>
    if (body.removeCard) {
      patch = { stripe_payment_method_id: null, card_brand: null, card_last4: null, auto_topup_enabled: false, updated_at: now }
    } else {
      const v = validateAutoTopUp(body.thresholdCents, body.amountCents)
      if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
      const enabled = !!body.enabled
      if (enabled && !wallet.card) {
        return NextResponse.json({ error: 'Save a card first: top up once with “Top up automatically” ticked.', needsCard: true }, { status: 409 })
      }
      patch = {
        auto_topup_enabled: enabled, auto_topup_threshold_cents: v.thresholdCents, auto_topup_amount_cents: v.amountCents, updated_at: now,
        ...(enabled && !wallet.autoTopUp.enabled ? { auto_topup_failures: 0, auto_topup_last_error: null } : {}),
      }
    }
    // The account row may not exist yet (no top-up so far): create it without
    // touching the balance, which only the database functions change.
    const { error } = await db.from('sms_credit_accounts').upsert({ company_id: id, ...patch }, { onConflict: 'company_id' })
    if (error) throw error
    return NextResponse.json({ ok: true, wallet: { ...(await getWallet(db, id)), stripeCustomerId: undefined } })
  } catch (e: any) {
    console.error('[sms-credits/settings] failed', e?.message)
    return NextResponse.json({ error: 'Couldn’t save that. Try again in a minute.' }, { status: 500 })
  }
}
