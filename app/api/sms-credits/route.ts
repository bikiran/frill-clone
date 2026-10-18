import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { smsCreditsAccess } from '@/lib/sms-credits-access'
import { allowanceStatus, getWallet } from '@/lib/sms-credits'
import { ledgerToCsv, lowBalanceInfo, SMS_CREDIT_PACKS_CENTS, MIN_TOPUP_CENTS, type LedgerRow } from '@/lib/sms-credits-core'
import { resolveSmsPricing } from '@/lib/sms-pricing'
import { secretKeyOk } from '@/lib/billing-config'

export const dynamic = 'force-dynamic'

// GET /api/sms-credits?companyId=…            the Billing page's SMS credits card
// GET /api/sms-credits?companyId=…&summary=1  just the balance (low-balance banner)
// GET /api/sms-credits?companyId=…&format=csv the whole ledger as CSV
//
// Any staff member may read; topping up and settings are owner/admin only
// (./topup, ./settings). Service role, with the caller checked explicitly.

const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })
const noStore = { 'Cache-Control': 'no-store' }

export async function GET(req: NextRequest) {
  try {
    const db: any = admin()
    const companyId = req.nextUrl.searchParams.get('companyId')
    const access = await smsCreditsAccess(req, db, companyId, 'read')
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status, headers: noStore })
    const id = String(companyId)

    const [wallet, pricing] = await Promise.all([getWallet(db, id), resolveSmsPricing(db, id)])
    const low = lowBalanceInfo(wallet.balanceCents, pricing, wallet.autoTopUp.enabled ? wallet.autoTopUp.thresholdCents : undefined)

    if (req.nextUrl.searchParams.get('summary')) {
      return NextResponse.json({ ready: wallet.ready, balanceCents: wallet.balanceCents, heldCents: wallet.heldCents, pricePerPart: pricing.price_per_part, low: wallet.ready && low.low, message: low.message, texts: low.texts, autoTopUp: wallet.autoTopUp.enabled }, { headers: noStore })
    }

    const csv = req.nextUrl.searchParams.get('format') === 'csv'
    let ledger: LedgerRow[] = []
    if (wallet.ready) {
      try {
        const { data } = await db.from('sms_credit_ledger').select('*').eq('company_id', id).order('created_at', { ascending: false }).limit(csv ? 10000 : 100)
        ledger = data || []
      } catch {}
    }
    const campaignIds = Array.from(new Set(ledger.map(r => r.campaign_id).filter(Boolean))) as string[]
    const campaigns: Record<string, string> = {}
    if (campaignIds.length) {
      try {
        const { data } = await db.from('campaigns').select('id, name').in('id', campaignIds.slice(0, 500))
        for (const c of data || []) campaigns[c.id] = c.name || 'Campaign'
      } catch {}
    }
    if (csv) {
      return new NextResponse(ledgerToCsv(ledger, campaigns), {
        headers: { ...noStore, 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="sms-credits-${new Date().toISOString().slice(0, 10)}.csv"` },
      })
    }

    const [allowance, co] = await Promise.all([
      allowanceStatus(db, id),
      Promise.resolve(db.from('companies').select('billing_provider').eq('id', id).maybeSingle()).catch(() => ({ data: null })),
    ])
    return NextResponse.json({
      ready: wallet.ready,
      canManage: access.canManage,
      billingAvailable: secretKeyOk(process.env),
      billedByShopify: (co as any)?.data?.billing_provider === 'shopify',
      wallet: { ...wallet, stripeCustomerId: undefined },
      allowance: { ...allowance, limit: allowance.unlimited ? null : allowance.limit, remaining: allowance.unlimited ? null : Math.max(0, allowance.limit - allowance.used) },
      pricing: { price_per_part: pricing.price_per_part, volume_tiers: pricing.volume_tiers, gst_inclusive: pricing.gst_inclusive },
      low: wallet.ready && low.low, lowMessage: low.message, texts: low.texts,
      packs: SMS_CREDIT_PACKS_CENTS, minTopUpCents: MIN_TOPUP_CENTS,
      ledger, campaigns,
    }, { headers: noStore })
  } catch (e: any) {
    console.error('[sms-credits] GET failed', e?.message)
    return NextResponse.json({ error: 'Couldn’t load SMS credits. Try again in a minute.' }, { status: 500, headers: noStore })
  }
}
