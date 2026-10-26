import { NextRequest, NextResponse } from 'next/server'
import { shopifySmsBilling } from '@/lib/shopify-usage'
import { createClient } from '@supabase/supabase-js'
import { smsCreditsAccess } from '@/lib/sms-credits-access'
import { allowanceStatus, getWallet } from '@/lib/sms-credits'
import { getSmsPolicy } from '@/lib/sms-policy'
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
// `policy` says how this company pays for texts (lib/sms-policy): the card
// shows "Unlimited texts", "SMS isn't included", or hides top-ups when Colvy
// manages them; the topup / settings routes enforce the same.

const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })
const noStore = { 'Cache-Control': 'no-store' }

export async function GET(req: NextRequest) {
  try {
    const db: any = admin()
    const companyId = req.nextUrl.searchParams.get('companyId')
    const access = await smsCreditsAccess(req, db, companyId, 'read')
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status, headers: noStore })
    const id = String(companyId)

    const [wallet, pricing, policy] = await Promise.all([getWallet(db, id), resolveSmsPricing(db, id), getSmsPolicy(db, id)])
    const autoOn = wallet.autoTopUp.enabled && policy.canAutoTopUp
    const low = lowBalanceInfo(wallet.balanceCents, pricing, autoOn ? wallet.autoTopUp.thresholdCents : undefined)
    // A low balance only matters when texts are paid from credit (not on unlimited or allowance-only).
    const lowNow = wallet.ready && policy.chargesCredit && low.low
    const policyOut = {
      mode: policy.mode, allowance: policy.allowance === Infinity ? null : policy.allowance,
      topupEnabled: policy.topupEnabled, autoTopupAllowed: policy.autoTopupAllowed,
      canTopUp: policy.canTopUp, canAutoTopUp: policy.canAutoTopUp, chargesCredit: policy.chargesCredit,
      blockReason: policy.blockReason,
    }

    if (req.nextUrl.searchParams.get('summary')) {
      return NextResponse.json({ ready: wallet.ready, balanceCents: wallet.balanceCents, heldCents: wallet.heldCents, pricePerPart: pricing.price_per_part, low: lowNow, message: low.message, texts: low.texts, autoTopUp: autoOn, canTopUp: policy.canTopUp, mode: policy.mode }, { headers: noStore })
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

    const [allowance, shop] = await Promise.all([
      allowanceStatus(db, id, { policy }),
      shopifySmsBilling(db, id).catch(() => null),
    ])
    return NextResponse.json({
      ready: wallet.ready,
      canManage: access.canManage,
      billingAvailable: secretKeyOk(process.env),
      billedByShopify: !!shop,
      // Credit bought through the Shopify plan (lib/shopify-usage): ready, or why not.
      shopify: shop ? { ready: shop.ready, reason: shop.ready ? null : shop.reason, planUrl: shop.planUrl, usage: shop.ready ? shop.usage : null } : null,
      wallet: { ...wallet, stripeCustomerId: undefined, autoTopUp: { ...wallet.autoTopUp, enabled: autoOn } },
      policy: policyOut,
      allowance: { ...allowance, limit: allowance.unlimited ? null : allowance.limit, remaining: allowance.unlimited ? null : Math.max(0, allowance.limit - allowance.used) },
      pricing: { price_per_part: pricing.price_per_part, volume_tiers: pricing.volume_tiers, gst_inclusive: pricing.gst_inclusive },
      low: lowNow, lowMessage: low.message, texts: low.texts,
      packs: SMS_CREDIT_PACKS_CENTS, minTopUpCents: MIN_TOPUP_CENTS,
      ledger, campaigns,
    }, { headers: noStore })
  } catch (e: any) {
    console.error('[sms-credits] GET failed', e?.message)
    return NextResponse.json({ error: 'Couldn’t load SMS credits. Try again in a minute.' }, { status: 500, headers: noStore })
  }
}
