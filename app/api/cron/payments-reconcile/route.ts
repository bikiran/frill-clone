import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cronOr401 } from '@/lib/cron-auth'
import { withJobLog } from '@/lib/job-log'
import { linkPaymentMessages, reconcilePayments } from '@/lib/payment-links'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * GET /api/cron/payments-reconcile — every 10 minutes (vercel.json).
 *
 * Payment links sent in conversations (lib/payment-links):
 *   1. links sent as text in an SMS / email reply become the payment's card;
 *   2. pending payments from the last 14 days are checked with Stripe, and
 *      paid ones confirmed — for when the webhook didn't arrive and the
 *      customer closed the page before the thank-you screen.
 * Confirming is once only, so running again changes nothing. Honours CRON_SECRET.
 */
async function getHandler(req: NextRequest) {
  const denied = cronOr401(req)
  if (denied) return denied
  try {
    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })
    const linked = await linkPaymentMessages(db, { sinceDays: 14 })
    const { data: pending, error } = await db.from('chat_payments').select('*')
      .eq('status', 'pending').not('stripe_session_id', 'is', null)
      .gte('created_at', new Date(Date.now() - 14 * 86_400_000).toISOString())
      .order('created_at', { ascending: false }).limit(100)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    const r = await reconcilePayments(db, pending || [])
    return NextResponse.json({ ok: true, linked, checked: r.checked, confirmed: r.updated, errors: r.results.filter(x => x.error).length })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Failed' }, { status: 500 })
  }
}

export const GET = withJobLog('payments-reconcile', getHandler)
