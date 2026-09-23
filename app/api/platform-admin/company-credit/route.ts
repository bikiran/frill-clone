import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'
import { creditBalanceCents, ensureReferralCode } from '@/lib/referrals'

export const dynamic = 'force-dynamic'

const SUPER_ADMIN = 'bishalstha76@gmail.com'
const SITE = (process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com').replace(/\/$/, '')

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function requireSuperAdmin(req: NextRequest, db: any): Promise<{ ok: boolean; email?: string }> {
  try {
    const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
    if (!token) return { ok: false }
    const { data } = await db.auth.getUser(token)
    const email = data?.user?.email
    return { ok: email === SUPER_ADMIN, email }
  } catch { return { ok: false } }
}

// GET ?companyId= — a company's account-credit balance + ledger, plus the
// referrals it has made (as the referrer) and its share link. Super-admin only.
export async function GET(req: NextRequest) {
  try {
    const db = admin()
    if (!(await requireSuperAdmin(req, db)).ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    const companyId = req.nextUrl.searchParams.get('companyId')
    if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 })

    const { data: company } = await db.from('companies').select('id, name, owner_id, referral_code, currency').eq('id', companyId).maybeSingle()
    if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 })

    const code = await ensureReferralCode(db, company).catch(() => null)
    const link = code ? `${SITE}/signup?ref=${encodeURIComponent(code)}` : null

    const [{ data: credits }, { data: refs }] = await Promise.all([
      db.from('account_credits').select('id, amount_cents, currency, reason, referral_id, created_at').eq('company_id', companyId).order('created_at', { ascending: false }).limit(200),
      db.from('referrals').select('id, referred_name, referred_email, status, credit_cents, currency, created_at, qualified_at').eq('referrer_company_id', companyId).order('created_at', { ascending: false }).limit(200),
    ])
    const balanceCents = (credits || []).reduce((s: number, r: any) => s + (r.amount_cents || 0), 0)
    const list = refs || []
    const currency = (company as any).currency || 'aud'

    // Does the owner have a live Stripe customer? (determines whether a grant
    // actually nets off a real invoice, or is ledger-only.)
    let hasStripe = false
    if (company.owner_id) {
      const { data: sub } = await db.from('subscriptions').select('stripe_customer_id').eq('user_id', company.owner_id).maybeSingle()
      hasStripe = !!sub?.stripe_customer_id
    }

    return NextResponse.json({
      companyId, currency, code, link, balanceCents, hasStripe,
      credits: credits || [],
      referrals: list,
      stats: {
        total: list.length,
        qualified: list.filter((r: any) => r.status === 'qualified').length,
        pending: list.filter((r: any) => r.status === 'pending').length,
      },
    })
  } catch (e: any) {
    if (/does not exist|schema cache/i.test(e?.message || '')) {
      return NextResponse.json({ needsMigration: true, error: 'Run COLVY_V314_REFERRALS.sql, then reload.' }, { status: 200 })
    }
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}

// POST { companyId, amountCents, reason, currency? } — grant (or claw back, with
// a negative amount) Colvy account credit. Records it in the ledger, applies it
// to the owner's Stripe balance when there is one, and writes an audit note.
export async function POST(req: NextRequest) {
  try {
    const db = admin()
    const who = await requireSuperAdmin(req, db)
    if (!who.ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })

    const body = await req.json().catch(() => ({}))
    const companyId = String(body.companyId || '')
    const amountCents = Math.round(Number(body.amountCents))
    const reason = String(body.reason || '').trim()
    if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 })
    if (!Number.isFinite(amountCents) || amountCents === 0) return NextResponse.json({ error: 'A non-zero amount is required.' }, { status: 400 })
    if (!reason) return NextResponse.json({ error: 'A reason is required (audited).' }, { status: 400 })
    if (Math.abs(amountCents) > 5_000_00) return NextResponse.json({ error: 'Amount looks too large (max $5,000 per grant).' }, { status: 400 })

    const { data: company } = await db.from('companies').select('id, name, owner_id, currency').eq('id', companyId).maybeSingle()
    if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 })
    const currency = String(body.currency || (company as any).currency || 'aud').toLowerCase()

    const { error: insErr } = await db.from('account_credits').insert({
      company_id: companyId, amount_cents: amountCents, currency,
      reason: `${reason} — by ${who.email}`,
    })
    if (insErr) {
      if (/does not exist|schema cache/i.test(insErr.message || '')) return NextResponse.json({ error: 'Run COLVY_V314_REFERRALS.sql, then reload.' }, { status: 400 })
      return NextResponse.json({ error: insErr.message }, { status: 500 })
    }

    // Net it off the owner's next real invoice when a Stripe customer exists.
    let appliedToStripe = false
    try {
      if (company.owner_id && process.env.STRIPE_SECRET_KEY) {
        const { data: sub } = await db.from('subscriptions').select('stripe_customer_id').eq('user_id', company.owner_id).maybeSingle()
        if (sub?.stripe_customer_id) {
          const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' as any })
          await stripe.customers.createBalanceTransaction(sub.stripe_customer_id, {
            amount: -amountCents, currency, description: `Colvy credit — ${reason}`,
          })
          appliedToStripe = true
        }
      }
    } catch (e: any) { console.error('[company-credit] stripe balance apply failed', e?.message || e) }

    // Audit trail (shows in the company's Notes / Audit Logs).
    try {
      await db.from('company_admin_notes').insert({
        company_id: companyId, author_email: who.email || null,
        body: `Account credit ${amountCents >= 0 ? '+' : ''}${(amountCents / 100).toFixed(2)} ${currency.toUpperCase()} — ${reason}${appliedToStripe ? ' (applied to Stripe balance)' : ''}`,
        category: 'billing',
      })
    } catch {}

    const balanceCents = await creditBalanceCents(db, companyId)
    return NextResponse.json({ ok: true, balanceCents, appliedToStripe })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}
