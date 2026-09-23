import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { ensureReferralCode, creditBalanceCents, REFERRAL_CREDIT_CENTS } from '@/lib/referrals'

export const dynamic = 'force-dynamic'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com').replace(/\/$/, '')

// GET — the caller's referral link, credit balance and referral history.
// Resolves the caller's owned company (referrals & credit are company-scoped).
export async function GET(req: NextRequest) {
  try {
    const db = admin()
    const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
    if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    const { data: auth } = await db.auth.getUser(token)
    const uid = auth?.user?.id
    if (!uid) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    // The company the referral link belongs to = the one they own (oldest first).
    const { data: company } = await db.from('companies')
      .select('id, name, referral_code').eq('owner_id', uid)
      .order('created_at', { ascending: true }).limit(1).maybeSingle()
    if (!company?.id) return NextResponse.json({ error: 'No workspace found for this account.' }, { status: 404 })

    const code = await ensureReferralCode(db, company)
    const link = code ? `${SITE}/signup?ref=${encodeURIComponent(code)}` : null

    const { data: refs } = await db.from('referrals')
      .select('id, referred_name, referred_email, status, credit_cents, currency, created_at, qualified_at')
      .eq('referrer_company_id', company.id).order('created_at', { ascending: false }).limit(200)
    const list = refs || []
    const pending = list.filter((r: any) => r.status === 'pending').length
    const qualified = list.filter((r: any) => r.status === 'qualified').length
    const balanceCents = await creditBalanceCents(db, company.id)

    return NextResponse.json({
      code, link,
      rewardCents: REFERRAL_CREDIT_CENTS,
      currency: 'aud',
      balanceCents,
      stats: { pending, qualified, total: list.length },
      referrals: list,
    })
  } catch (e: any) {
    // Tables missing (migration V314 not run yet) → return an empty, non-erroring shape.
    if (/does not exist|schema cache/i.test(e?.message || '')) {
      return NextResponse.json({ code: null, link: null, rewardCents: REFERRAL_CREDIT_CENTS, currency: 'aud', balanceCents: 0, stats: { pending: 0, qualified: 0, total: 0 }, referrals: [], needsMigration: true })
    }
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}
