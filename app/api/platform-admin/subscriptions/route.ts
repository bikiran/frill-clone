import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SUPER_ADMIN = 'bishalstha76@gmail.com'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function requireSuperAdmin(req: NextRequest, db: any): Promise<boolean> {
  try {
    const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
    if (!token) return false
    const { data } = await db.auth.getUser(token)
    return data?.user?.email === SUPER_ADMIN
  } catch { return false }
}

// Normalise any interval's amount to a MONTHLY figure in cents.
function monthlyCents(amountCents: number, interval: string): number {
  if (interval === 'year') return Math.round(amountCents / 12)
  if (interval === 'week') return Math.round(amountCents * 52 / 12)
  if (interval === 'day') return Math.round(amountCents * 365 / 12)
  return amountCents // month
}

// GET: list synced subscriptions + computed MRR (reads the DB, fast).
export async function GET(req: NextRequest) {
  try {
    const db = admin()
    if (!(await requireSuperAdmin(req, db))) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })

    const { data: subs } = await db.from('subscriptions').select('*').in('status', ['active', 'trialing', 'past_due']).order('updated_at', { ascending: false })
    // Resolve owner → company name for display.
    const userIds = Array.from(new Set((subs || []).map((s: any) => s.user_id).filter(Boolean)))
    let companies: any[] = []
    if (userIds.length) { const { data } = await db.from('companies').select('id, name, slug, owner_id').in('owner_id', userIds); companies = data || [] }
    const coByOwner: Record<string, any> = {}; companies.forEach(c => { coByOwner[c.owner_id] = c })

    let mrrCents = 0
    const rows = (subs || []).map((s: any) => {
      const m = monthlyCents(s.amount_cents || 0, s.billing_interval || 'month')
      if (s.status === 'active') mrrCents += m
      return {
        id: s.id, tier: s.tier, status: s.status,
        amount: (s.amount_cents || 0) / 100, currency: (s.currency || 'aud').toUpperCase(),
        interval: s.billing_interval || 'month', monthly: m / 100,
        company: coByOwner[s.user_id] || null,
        current_period_end: s.current_period_end, synced_at: s.synced_at,
        stripe_subscription_id: s.stripe_subscription_id,
      }
    })

    return NextResponse.json({ subscriptions: rows, mrr: mrrCents / 100, arr: (mrrCents * 12) / 100, count: rows.length })
  } catch (err: any) {
    return NextResponse.json({ error: err.message, subscriptions: [] }, { status: 500 })
  }
}

// POST: pull all active subscriptions from Stripe and reconcile the DB. This is
// the "sync now" action — captures existing subs and heals any missed webhooks.
export async function POST(req: NextRequest) {
  try {
    const db = admin()
    if (!(await requireSuperAdmin(req, db))) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    if (!process.env.STRIPE_SECRET_KEY?.startsWith('sk_')) {
      return NextResponse.json({ error: 'Stripe is not configured (STRIPE_SECRET_KEY missing).' }, { status: 400 })
    }

    const Stripe = (await import('stripe')).default
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-06-20' as any })

    let synced = 0, skipped = 0
    let startingAfter: string | undefined = undefined
    for (let i = 0; i < 20; i++) {
      const page: any = await stripe.subscriptions.list({ status: 'all', limit: 100, starting_after: startingAfter, expand: ['data.customer'] })
      for (const sub of page.data) {
        const item = sub.items?.data?.[0]
        const amountCents = item?.price?.unit_amount || 0
        const currency = item?.price?.currency || 'aud'
        const interval = item?.price?.recurring?.interval || 'month'
        const customerEmail = (sub.customer as any)?.email || null

        // Match to an existing subscription row (by stripe id) or by user email.
        let userId: string | null = null
        const { data: existing } = await db.from('subscriptions').select('user_id').eq('stripe_subscription_id', sub.id).maybeSingle()
        if (existing?.user_id) userId = existing.user_id
        else if (customerEmail) {
          // Find the auth user with this email.
          for (let p = 1; p <= 20 && !userId; p++) {
            const { data: list } = await (db.auth.admin as any).listUsers({ page: p, perPage: 200 })
            const u = (list?.users || []).find((x: any) => (x.email || '').toLowerCase() === customerEmail.toLowerCase())
            if (u) userId = u.id
            if ((list?.users || []).length < 200) break
          }
        }
        if (!userId) { skipped++; continue }

        await db.from('subscriptions').upsert({
          user_id: userId,
          stripe_customer_id: typeof sub.customer === 'string' ? sub.customer : sub.customer?.id,
          stripe_subscription_id: sub.id,
          status: sub.status,
          amount_cents: amountCents,
          currency,
          billing_interval: interval,
          current_period_end: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
          synced_at: new Date().toISOString(),
        }, { onConflict: 'user_id' })
        synced++
      }
      if (!page.has_more) break
      startingAfter = page.data[page.data.length - 1]?.id
    }

    return NextResponse.json({ ok: true, synced, skipped })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
