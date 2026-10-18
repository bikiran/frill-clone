import { NextRequest, NextResponse } from 'next/server'
import { adminDb, superAdmin, isMissing, companyNames } from '../_lib/super-admin'
import { adjustBalance, getWallet } from '@/lib/sms-credits'
import { logSuperAdminAudit } from '@/lib/super-admin-audit'
import { resolveSmsPricing } from '@/lib/sms-pricing'
import { fmtCents } from '@/lib/sms-credits-core'

export const dynamic = 'force-dynamic'

// Super admin → SMS credits.
//   GET                 totals (credit outstanding = a liability; this month's
//                       credit consumed vs the estimated carrier cost) and every
//                       wallet.
//   GET ?companyId=     one company's wallet and ledger.
//   GET ?find=          companies by name / subdomain (any company, wallet or not).
//   POST { companyId, amountCents, reason }   a manual adjustment (audited).

const monthStart = () => { const d = new Date(); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString() }

export async function GET(req: NextRequest) {
  const db = adminDb()
  if (!(await superAdmin(req, db))) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  try {
    // Any company, wallet or not (to give credit to one that never topped up).
    const find = (req.nextUrl.searchParams.get('find') || '').trim().replace(/[%_,()*\\]/g, ' ').trim()
    if (find) {
      const { data } = await db.from('companies').select('id, name, slug').or(`name.ilike.%${find}%,slug.ilike.%${find}%`).order('name').limit(10)
      return NextResponse.json({ companies: data || [] })
    }
    const companyId = req.nextUrl.searchParams.get('companyId')
    if (companyId) {
      const wallet = await getWallet(db, companyId)
      if (!wallet.ready) return NextResponse.json({ ready: false })
      const [{ data: ledger }, names] = await Promise.all([
        db.from('sms_credit_ledger').select('*').eq('company_id', companyId).order('created_at', { ascending: false }).limit(300),
        companyNames(db, [companyId]),
      ])
      const ids = Array.from(new Set((ledger || []).map((r: any) => r.campaign_id).filter(Boolean))) as string[]
      const campaigns: Record<string, string> = {}
      if (ids.length) {
        const { data } = await db.from('campaigns').select('id, name').in('id', ids.slice(0, 500))
        for (const c of data || []) campaigns[c.id] = c.name || 'Campaign'
      }
      return NextResponse.json({ ready: true, company: names[companyId] || { id: companyId, name: 'Unknown', slug: '' }, wallet, ledger: ledger || [], campaigns })
    }

    const [acc, holds, month] = await Promise.all([
      db.from('sms_credit_accounts').select('company_id, balance_cents, auto_topup_enabled, auto_topup_failures, card_last4, updated_at').order('balance_cents', { ascending: false }).limit(2000),
      db.from('sms_credit_holds').select('company_id, held_cents').eq('status', 'held').limit(5000),
      db.from('sms_credit_ledger').select('company_id, kind, amount_cents, parts').gte('created_at', monthStart()).in('kind', ['spend', 'refund', 'topup', 'auto_topup']).limit(50000),
    ])
    if (acc.error) {
      if (isMissing(acc.error)) return NextResponse.json({ ready: false })
      throw acc.error
    }
    const heldBy: Record<string, number> = {}
    for (const h of holds.data || []) heldBy[h.company_id] = (heldBy[h.company_id] || 0) + (Number(h.held_cents) || 0)
    const accounts = (acc.data || []).map((a: any) => ({ ...a, held_cents: heldBy[a.company_id] || 0 }))
    const names = await companyNames(db, accounts.map((a: any) => a.company_id))

    const pricing = await resolveSmsPricing(db, null)
    let consumed = 0, parts = 0, toppedUp = 0
    for (const r of month.data || []) {
      const amt = Number(r.amount_cents) || 0
      if (r.kind === 'spend') { consumed += -amt; parts += Number(r.parts) || 0 }
      else if (r.kind === 'refund') consumed -= amt
      else toppedUp += amt
    }
    const consumedExGst = pricing.gst_inclusive ? consumed / (1 + (pricing.gst_rate ?? 0.1)) : consumed
    const carrierCents = Math.round(parts * ((pricing.carrier_cost || 0) / (pricing.fx_rate || 1)) * 100)
    const balance = accounts.reduce((s: number, a: any) => s + (Number(a.balance_cents) || 0), 0)
    const held = accounts.reduce((s: number, a: any) => s + (Number(a.held_cents) || 0), 0)
    return NextResponse.json({
      ready: true,
      totals: {
        outstandingCents: balance + held, balanceCents: balance, heldCents: held,
        consumedMonthCents: consumed, consumedMonthExGstCents: Math.round(consumedExGst),
        partsMonth: parts, carrierCostMonthCents: carrierCents,
        marginMonthCents: Math.round(consumedExGst) - carrierCents,
        toppedUpMonthCents: toppedUp,
        wallets: accounts.length,
      },
      carrier: { cost: pricing.carrier_cost, currency: pricing.carrier_currency, fx: pricing.fx_rate },
      accounts: accounts.map((a: any) => ({ ...a, name: names[a.company_id]?.name || 'Unknown', slug: names[a.company_id]?.slug || '' })),
    })
  } catch (e: any) {
    if (isMissing(e)) return NextResponse.json({ ready: false })
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const db = adminDb()
  const me = await superAdmin(req, db)
  if (!me) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  try {
    const body = await req.json().catch(() => ({}))
    const companyId = String(body.companyId || '')
    const amountCents = Math.round(Number(body.amountCents))
    const reason = String(body.reason || '').trim()
    if (!companyId) return NextResponse.json({ error: 'Choose a company.' }, { status: 400 })
    if (!Number.isFinite(amountCents) || amountCents === 0 || Math.abs(amountCents) > 1_000_000) return NextResponse.json({ error: 'Enter an amount between −A$10,000 and A$10,000 (not zero).' }, { status: 400 })
    if (reason.length < 3) return NextResponse.json({ error: 'Give a reason (it goes in the ledger and the audit log).' }, { status: 400 })
    const { data: co } = await db.from('companies').select('id, name').eq('id', companyId).maybeSingle()
    if (!co) return NextResponse.json({ error: 'Company not found' }, { status: 404 })
    const r = await adjustBalance(db, { companyId, amountCents, reason, adminId: me.id })
    if (!r.ok) {
      const msg = r.reason === 'insufficient' ? 'That would take the balance below zero.' : r.reason === 'not_set_up' ? 'Run COLVY_V395_SMS_CREDITS.sql first.' : 'Couldn’t apply the adjustment.'
      return NextResponse.json({ error: msg }, { status: r.reason === 'insufficient' ? 409 : 500 })
    }
    await logSuperAdminAudit(db, {
      adminId: me.id, adminEmail: me.email, companyId, action: 'sms_credit_adjustment',
      summary: `${amountCents > 0 ? 'Added' : 'Removed'} ${fmtCents(Math.abs(amountCents))} SMS credit for ${co.name || companyId}: ${reason}`,
      detail: { amountCents, reason, balanceAfterCents: r.balanceCents },
    })
    return NextResponse.json({ ok: true, balanceCents: r.balanceCents })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}
