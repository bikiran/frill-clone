import { requireCompanyAccess } from '@/lib/company-access'
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import { platformTwilio, platformTwilioConfigured, TWILIO_MASTER, colvyBaseUrl } from '@/lib/twilio-platform'
import { consumeFreeCredit, refundFreeCredit } from '@/lib/free-number-credits'
import { startNumberPurchase, finishNumberOrderFrom, cancelNumberOrder, LIVE_SUBSCRIPTION, CANCELLED_CHECKOUT, type HeldOrder } from '@/lib/number-orders'
import { cleanNumberKind, monthlyPriceAud, bundleSidFor, NO_TOLLFREE } from '@/lib/number-types'
import { numberWebhooks, recordPlatformNumber } from '@/lib/platform-number'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Called by the Get-a-number page after returning from Stripe checkout for a
// Twilio-backed number. Verifies the session is paid, then provisions the number
// DIRECTLY against the platform Twilio account (no dependence on the webhook).
// Idempotent. Mirrors /api/telnyx/number-finalize.
//
// A paid checkout is claimed (lib/number-orders) before anything is bought, so
// this call and the Stripe webhook never both buy a number for it; how the
// purchase ended is recorded against the claim. That record is also what the
// setup checklist reads for "setting up your number" / "needs attention".
export async function POST(req: NextRequest) {
  const track: { held: HeldOrder | null } = { held: null }
  const res = await finalize(req, track)
  if (track.held) await finishNumberOrderFrom(admin(), track.held, res)
  return res
}

async function finalize(req: NextRequest, track: { held: HeldOrder | null }) {
  let freeConsumed = false
  let freeCompanyId: string | undefined
  try {
    const body = await req.json()
    const { companyId, sessionId, free } = body
    if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })

    const db = admin()
    // Workspace members only.
    if (!(await requireCompanyAccess(req, db, companyId)).ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })

    let paid = false
    let phoneNumberWanted: string | undefined
    let subscriptionId: string | undefined
    let locationId: string | undefined
    let numberType: string | undefined

    // Free path: an admin granted this company a free number. Consume a credit
    // (authoritative check) instead of verifying a Stripe payment. The number
    // details come straight from the request since there's no checkout session.
    if (free && !sessionId) {
      const ok = await consumeFreeCredit(db, companyId)
      if (!ok) return NextResponse.json({ error: 'No free number credits available for this business.' }, { status: 403 })
      freeConsumed = true
      freeCompanyId = companyId
      phoneNumberWanted = body.phoneNumber || undefined
      numberType = body.numberType || 'local'
      locationId = body.locationId || undefined
    }

    if (sessionId) {
      const secret = (process.env.STRIPE_SECRET_KEY || '').trim()
      if (secret.startsWith('sk_')) {
        const stripe = new Stripe(secret, { apiVersion: '2024-06-20' as any })
        const session = await stripe.checkout.sessions.retrieve(sessionId)
        paid = session.payment_status === 'paid' || session.status === 'complete'
        phoneNumberWanted = (session.metadata?.phoneNumber as string) || undefined
        locationId = (session.metadata?.locationId as string) || undefined
        numberType = (session.metadata?.numberType as string) || 'local'
        subscriptionId = (session.subscription as string) || undefined
        if (!paid) return NextResponse.json({ error: 'Payment not completed yet', pending: true }, { status: 202 })
        // The checkout must be this workspace's own number purchase…
        if (session.metadata?.kind !== 'phone_number' || session.metadata?.companyId !== companyId) {
          return NextResponse.json({ error: 'This payment is for a different purchase.' }, { status: 403 })
        }
        // …and each paid checkout buys one number, once — even with the Stripe
        // webhook provisioning it at the same moment.
        const start = await startNumberPurchase(db, { sessionId, companyId, provider: 'twilio' }, subscriptionId)
        track.held = start.held
        if (start.answer) return NextResponse.json(start.answer.body, { status: start.answer.status })
        // A checkout support has since refunded still reads as paid; its
        // subscription says otherwise. Nothing is bought for it, and setup
        // stops asking for it to be finished.
        if (subscriptionId) {
          const sub = await stripe.subscriptions.retrieve(subscriptionId)
          if (!LIVE_SUBSCRIPTION.includes(String(sub?.status))) {
            if (track.held) await cancelNumberOrder(db, track.held, `Subscription ${sub?.status || 'gone'}`)
            track.held = null
            return NextResponse.json({ error: CANCELLED_CHECKOUT, cancelled: true }, { status: 409 })
          }
        }
      } else {
        return NextResponse.json({ error: 'Payments are not configured on the server.' }, { status: 500 })
      }
    }

    // A number is only provisioned against a verified payment or a free credit.
    // (paid used to start as true, so a request with neither bought one free.)
    if (!freeConsumed && !paid) {
      return NextResponse.json({ error: 'Payment required.' }, { status: 402 })
    }

    // Idempotency: already provisioned this number?
    // This workspace's own only: another workspace holding it isn't this purchase
    // done (buying it fails, and an equivalent number is bought instead).
    if (phoneNumberWanted) {
      const { data: dupe } = await db.from('phone_numbers').select('id, phone_number').eq('company_id', companyId).eq('phone_number', phoneNumberWanted).maybeSingle()
      if (dupe) {
        if (freeConsumed) { await refundFreeCredit(db, companyId); freeConsumed = false } // nothing was provisioned
        return NextResponse.json({ ok: true, phoneNumber: dupe.phone_number, alreadyDone: true })
      }
    }

    if (!platformTwilioConfigured()) {
      if (freeConsumed) { await refundFreeCredit(db, companyId); freeConsumed = false }
      return NextResponse.json({ error: 'Provisioning not configured: TWILIO_MASTER_ACCOUNT_SID / TWILIO_MASTER_AUTH_TOKEN missing on the server.' }, { status: 503 })
    }
    const svc = platformTwilio()!
    const base = colvyBaseUrl()

    // Pick / substitute the number.
    const wantedType = cleanNumberKind(numberType)
    let numberToBuy = phoneNumberWanted
    let substituted = false
    if (!numberToBuy) {
      const available = await svc.searchAvailableNumbers({ country: 'AU', type: wantedType, limit: 1 })
      numberToBuy = available?.[0]?.phone_number
      if (!numberToBuy) {
        if (freeConsumed) { await refundFreeCredit(db, companyId); freeConsumed = false }
        return NextResponse.json({ error: wantedType === 'tollfree' ? `${NO_TOLLFREE} Your payment is safe — please contact support.` : 'No Australian numbers available right now — please contact support; your payment is safe.' }, { status: 502 })
      }
    }

    // Regulatory bundle + address, if the company has one. Twilio refuses to
    // sell an AU number without an AddressSid ("Phone Number Requires an
    // Address"). Prefer a pre-created platform address (env); otherwise build
    // one from the company's regulatory bundle. A toll-free number takes the
    // company's toll-free bundle (lib/number-types bundleSidFor).
    let bundleSid: string | undefined
    let addressSid: string | undefined = TWILIO_MASTER.addressSid || undefined
    try {
      const picked = await bundleSidFor(db, companyId, wantedType)
      const reg = picked.row
      bundleSid = picked.bundleSid
      if (!addressSid && reg?.address_line1 && reg?.city && reg?.state && reg?.postal_code) {
        try {
          addressSid = (await svc.createAddress({
            customerName: reg.business_name || `${reg.first_name || ''} ${reg.last_name || ''}`.trim() || 'Colvy Customer',
            street: reg.address_line1,
            streetSecondary: reg.address_line2 || undefined,
            city: reg.city,
            region: reg.state,
            postalCode: reg.postal_code,
            isoCountry: reg.country || 'AU',
          })) || undefined
        } catch (e) { console.warn('Twilio address create warning:', e) }
      }
    } catch {}

    let bought: { sid: string | null }
    try {
      bought = await svc.buyNumber({
        phoneNumber: numberToBuy,
        friendlyName: `Colvy ${String(companyId).slice(0, 8)}`,
        ...numberWebhooks(base),
        bundleSid, addressSid,
      })
    } catch (e: any) {
      // The exact number may have been taken while paying — substitute an
      // equivalent one so a paid customer always ends up with a working number.
      try {
        const alt = await svc.searchAvailableNumbers({ country: 'AU', type: wantedType, limit: 5 })
        const pick = (alt || []).map((a: any) => a.phone_number).find((p: string) => p && p !== numberToBuy)
        if (!pick) throw e
        bought = await svc.buyNumber({
          phoneNumber: pick,
          friendlyName: `Colvy ${String(companyId).slice(0, 8)}`,
          ...numberWebhooks(base),
          bundleSid, addressSid,
        })
        numberToBuy = pick
        substituted = true
      } catch (e2: any) {
        if (freeConsumed) { await refundFreeCredit(db, companyId); freeConsumed = false }
        return NextResponse.json({ error: e2.message }, { status: 502 })
      }
    }

    // Free numbers cost the customer nothing and carry no Stripe subscription.
    const monthly = freeConsumed ? 0 : monthlyPriceAud(wantedType)

    // Platform config on the company's Twilio integration, Twilio routing, and
    // the phone_numbers row (lib/platform-number, shared with completed ports).
    await recordPlatformNumber(db, {
      companyId, phoneNumber: numberToBuy!, numberSid: bought.sid || null, monthly,
      isFree: freeConsumed, subscriptionId, locationId,
    })

    return NextResponse.json({
      ok: true, phoneNumber: numberToBuy, substituted,
      ...(substituted ? { notice: `The number you picked was taken while payment completed, so we provisioned ${numberToBuy} for you instead.` } : {}),
    })
  } catch (err: any) {
    console.error('Twilio number finalize error:', err)
    // Don't let an unexpected failure eat a granted credit.
    if (freeConsumed && freeCompanyId) { try { await refundFreeCredit(admin(), freeCompanyId) } catch {} }
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
