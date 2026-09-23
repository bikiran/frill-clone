import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { logWebhookEvent } from '@/lib/webhook-log'
import { confirmChatPayment } from '@/lib/chat-payment-confirm'
import { internalPlanForTier } from '@/lib/plan'

const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || ''

export async function POST(req: NextRequest) {
  try {
    const body = await req.text()
    const sig = req.headers.get('stripe-signature') || ''

    if (!process.env.STRIPE_SECRET_KEY?.startsWith('sk_')) {
      return NextResponse.json({ error: 'Stripe not configured' }, { status: 400 })
    }

    const Stripe = (await import('stripe')).default
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-06-20' as any })

    let event: any
    try {
      event = STRIPE_WEBHOOK_SECRET
        ? stripe.webhooks.constructEvent(body, sig, STRIPE_WEBHOOK_SECRET)
        : JSON.parse(body)
    } catch (err: any) {
      await logWebhookEvent({ source: 'stripe', status: 'rejected', error: 'signature verification failed' })
      return NextResponse.json({ error: 'Webhook signature failed' }, { status: 400 })
    }

    // Record the event for the Super Admin webhook explorer (best-effort).
    logWebhookEvent({ source: 'stripe', eventType: event?.type, companyId: event?.data?.object?.metadata?.companyId || null, payload: event })

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object
        const meta = session.metadata || {}

        // Card saved for later (Stripe 'setup' mode) — store the payment method
        // so the business can charge it from the chat. We only ever keep the
        // Stripe ids and the last 4 digits; card data stays with Stripe.
        if (meta.kind === 'save_card' && meta.companyId) {
          try {
            const setupIntentId = session.setup_intent as string
            if (setupIntentId) {
              const { data: company } = await (supabase as any).from('companies').select('*').eq('id', meta.companyId).maybeSingle()
              const useOwnKeys = company?.stripe_mode === 'keys' && company?.stripe_secret_key
              const key = useOwnKeys ? company.stripe_secret_key : process.env.STRIPE_SECRET_KEY
              const sc = new (require('stripe'))(String(key).trim(), { apiVersion: '2024-06-20' })
              const opts = useOwnKeys ? undefined : (company?.stripe_account_id ? { stripeAccount: company.stripe_account_id } : undefined)

              const si = await sc.setupIntents.retrieve(setupIntentId, opts)
              const pmId = si.payment_method
              if (pmId) {
                const pm = await sc.paymentMethods.retrieve(pmId, opts)
                const row = {
                  company_id: meta.companyId,
                  contact_id: meta.contactId || null,
                  stripe_customer_id: String(session.customer),
                  stripe_payment_method_id: String(pmId),
                  brand: pm.card?.brand || null,
                  last4: pm.card?.last4 || null,
                  exp_month: pm.card?.exp_month || null,
                  exp_year: pm.card?.exp_year || null,
                  is_default: true,
                }
                const { data: existing } = await (supabase as any).from('saved_cards')
                  .select('id').eq('company_id', meta.companyId).eq('stripe_payment_method_id', String(pmId)).maybeSingle()
                if (!existing) await (supabase as any).from('saved_cards').insert(row)

                if (meta.conversationId) {
                  await (supabase as any).from('messages').insert({
                    conversation_id: meta.conversationId, company_id: meta.companyId,
                    sender_type: 'system',
                    content: `✅ Card saved — ${pm.card?.brand || 'card'} ending ${pm.card?.last4}. You can charge it from the chat.`,
                    metadata: { card_saved: true },
                  })
                }
              }
            }
          } catch (e) { console.error('[webhook] save_card failed', e) }
        }

        // Form payment (no conversation) — confirm the chat_payments row through
        // the shared helper, which is null-safe on conversation_id. The form's
        // return page also verifies, so whichever wins confirms exactly once.
        if (meta.kind === 'form_payment') {
          const { data: pay } = await (supabase as any).from('chat_payments')
            .select('id, company_id, conversation_id, message_id, amount_cents').eq('stripe_session_id', session.id).maybeSingle()
          let cardBrand: string | null = null, cardLast4: string | null = null
          try {
            const piId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id
            if (piId) {
              const acctOpt: any = event.account ? { stripeAccount: event.account } : undefined
              const pi: any = await stripe.paymentIntents.retrieve(piId, { expand: ['latest_charge'] }, acctOpt)
              const card = pi?.latest_charge?.payment_method_details?.card || null
              cardBrand = card?.brand || null; cardLast4 = card?.last4 || null
            }
          } catch {}
          if (pay) {
            await confirmChatPayment(supabase, pay, { receiptUrl: session.receipt_url || null, paymentIntent: (typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id) || null, cardBrand, cardLast4 })
          }
          break
        }

        // In-chat payment (on a connected account) — mark paid + confirm in chat
        if (meta.kind === 'chat_payment' && meta.conversationId) {
          const receiptUrl = session.receipt_url || null
          // Load the row, then confirm through the shared helper (claims the
          // pending→paid transition once, flips the card, posts the confirmation
          // and pushes a notification). If verify-payment already confirmed it,
          // confirmChatPayment returns confirmed:false and we skip the rest.
          const { data: pay } = await (supabase as any).from('chat_payments')
            .select('id, company_id, conversation_id, message_id, amount_cents').eq('stripe_session_id', session.id).maybeSingle()
          // Card brand + last-4 for the Payments list (best-effort). Connected
          // accounts need the account context on the retrieve.
          let cardBrand: string | null = null, cardLast4: string | null = null
          try {
            const piId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id
            if (piId) {
              const acctOpt: any = event.account ? { stripeAccount: event.account } : undefined
              const pi: any = await stripe.paymentIntents.retrieve(piId, { expand: ['latest_charge'] }, acctOpt)
              const card = pi?.latest_charge?.payment_method_details?.card || null
              cardBrand = card?.brand || null; cardLast4 = card?.last4 || null
            }
          } catch {}
          const confirmRes = pay
            ? await confirmChatPayment(supabase, pay, { receiptUrl, paymentIntent: (typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id) || null, orderId: meta.orderId || null, orderNumber: meta.orderId ? String(meta.orderId) : null, cardBrand, cardLast4 })
            : { confirmed: false }
          if (!confirmRes.confirmed) break
          // If this payment was for a WooCommerce order, mark it processing.
          if (meta.orderId) {
            try {
              let integ: any = null
              if (meta.integrationId) {
                const r = await (supabase as any).from('woocommerce_integrations').select('*').eq('id', meta.integrationId).maybeSingle()
                integ = r.data
              }
              if (!integ) {
                const r = await (supabase as any).from('woocommerce_integrations').select('*').eq('company_id', meta.companyId).eq('is_active', true).order('created_at', { ascending: true }).limit(1)
                integ = r.data?.[0] || null
              }
              if (integ?.store_url) {
                await fetch(`${integ.store_url}/wp-json/wc/v3/orders/${meta.orderId}`, {
                  method: 'PUT',
                  headers: { 'Authorization': `Basic ${Buffer.from(`${integ.consumer_key}:${integ.consumer_secret}`).toString('base64')}`, 'Content-Type': 'application/json' },
                  body: JSON.stringify({ status: 'processing', set_paid: true }),
                })
              }
            } catch {}
          }
          // (Card flip, confirmation message, push notification AND the Link
          // Reports revenue credit are all handled by confirmChatPayment above,
          // so both this webhook and the verify-payment poll attribute the
          // payment identically — whichever confirms it first.)
          break
        }
        const { userId, tier } = meta
        if (userId && tier) {
          // Fetch the real subscription to capture the actual billed amount.
          let amountCents = 0, currency = 'aud', interval = 'month', periodEnd = new Date(Date.now() + 30 * 86400000).toISOString()
          try {
            if (session.subscription) {
              const sub = await stripe.subscriptions.retrieve(session.subscription as string)
              const item = sub.items?.data?.[0]
              amountCents = item?.price?.unit_amount || 0
              currency = (item?.price?.currency || 'aud')
              interval = (item?.price?.recurring?.interval || 'month')
              if ((sub as any).current_period_end) periodEnd = new Date((sub as any).current_period_end * 1000).toISOString()
            }
          } catch {}
          await (supabase as any).from('subscriptions').upsert({
            user_id: userId,
            stripe_customer_id: session.customer,
            stripe_subscription_id: session.subscription,
            tier,
            status: 'active',
            amount_cents: amountCents,
            currency,
            billing_interval: interval,
            current_period_start: new Date().toISOString(),
            current_period_end: periodEnd,
            synced_at: new Date().toISOString(),
          }, { onConflict: 'user_id' })
          // Reflect the paid plan on the company so the trial ends: clears the
          // in-app trial countdown/wall and counts them as paying in the metrics.
          // Map the marketing tier (feedback/omnichannel/everything/…) to the
          // internal entitlement plan (pro/enterprise) that feature checks and the
          // entitlement matrix understand — the subscription row above keeps the
          // marketing tier for billing/analytics.
          try {
            await (supabase as any).from('companies').update({ plan: internalPlanForTier(tier), trial_ends_at: null }).eq('owner_id', userId)
          } catch {}
        }
        // Phone number purchase — provision the number now that payment is set up
        if (meta.kind === 'phone_number' && meta.companyId) {
          try {
            const origin = process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com'
            // Provision on whichever carrier this purchase was for. Both endpoints
            // take the same shape; the customer never learns which one ran.
            const prov = meta.provider === 'twilio' ? 'twilio' : 'telnyx'
            await fetch(`${origin}/api/${prov}/number`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                companyId: meta.companyId,
                phoneNumber: meta.phoneNumber || undefined,
                numberType: meta.numberType || undefined,
                locationId: meta.locationId || undefined,
                stripeSubscriptionId: session.subscription,
              }),
            })
          } catch (e) {
            console.error('Post-payment number provisioning failed:', e)
          }
        }
        break
      }
      // A subscription invoice was PAID. This is the real "paid their first
      // month" signal (checkout.session.completed fires at trial start, before
      // any money changes hands). When the paying account was referred, mark the
      // referral qualified and credit the referrer $100 in Colvy account credit.
      case 'invoice.paid':
      case 'invoice.payment_succeeded': {
        try {
          const invoice = event.data.object
          const subId = typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id
          const custId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id
          if (!subId || (invoice.amount_paid || 0) <= 0) break   // not a real subscription payment

          // Who paid? Resolve the owner via the subscriptions table.
          const ors = [subId ? `stripe_subscription_id.eq.${subId}` : '', custId ? `stripe_customer_id.eq.${custId}` : ''].filter(Boolean).join(',')
          const { data: payerSub } = await (supabase as any).from('subscriptions').select('user_id').or(ors).maybeSingle()
          const payerUserId = payerSub?.user_id
          if (!payerUserId) break

          // A pending referral for this referred owner?
          const { data: ref } = await (supabase as any).from('referrals')
            .select('*').eq('referred_user_id', payerUserId).eq('status', 'pending').maybeSingle()
          if (!ref) break

          // Claim it exactly once (guarded update).
          const { data: claimed } = await (supabase as any).from('referrals')
            .update({ status: 'qualified', qualified_at: new Date().toISOString(), first_invoice_id: invoice.id })
            .eq('id', ref.id).eq('status', 'pending').select('id').maybeSingle()
          if (!claimed) break

          const cents = ref.credit_cents || 10000
          const cur = ref.currency || 'aud'
          // Colvy account-credit ledger (source of truth). Unique index on
          // referral_id makes this idempotent.
          try {
            await (supabase as any).from('account_credits').insert({
              company_id: ref.referrer_company_id, amount_cents: cents, currency: cur,
              reason: 'Referral reward', referral_id: ref.id,
            })
          } catch {}
          // Also apply it to the referrer's Stripe balance so it nets off their
          // next invoice (negative balance = credit). Best-effort.
          try {
            const { data: refSub } = await (supabase as any).from('subscriptions').select('stripe_customer_id').eq('user_id', ref.referrer_user_id).maybeSingle()
            if (refSub?.stripe_customer_id) {
              await stripe.customers.createBalanceTransaction(refSub.stripe_customer_id, {
                amount: -cents, currency: cur, description: 'Colvy referral reward',
              })
            }
          } catch (e: any) { console.error('[referral] stripe balance credit failed', e?.message || e) }
        } catch (e: any) { console.error('[referral] invoice.paid handler failed', e?.message || e) }
        break
      }
      case 'customer.subscription.updated': {
        const sub = event.data.object
        const item = sub.items?.data?.[0]
        await (supabase as any).from('subscriptions').update({
          status: sub.status,
          amount_cents: item?.price?.unit_amount || 0,
          currency: item?.price?.currency || 'aud',
          billing_interval: item?.price?.recurring?.interval || 'month',
          current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
          synced_at: new Date().toISOString(),
        }).eq('stripe_subscription_id', sub.id)
        break
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object
        await (supabase as any).from('subscriptions').update({
          status: 'canceled',
          tier: 'free',
        }).eq('stripe_subscription_id', sub.id)
        // Revert the company to free so it stops counting as a paying customer.
        try {
          const { data: subRow } = await (supabase as any).from('subscriptions').select('user_id').eq('stripe_subscription_id', sub.id).maybeSingle()
          if (subRow?.user_id) await (supabase as any).from('companies').update({ plan: 'free' }).eq('owner_id', subRow.user_id)
        } catch {}
        break
      }
    }

    // Log event
    try {
      await (supabase as any).from('stripe_events').insert({
        stripe_event_id: event.id,
        event_type: event.type,
        event_data: event.data.object,
        processed: true,
      })
    } catch {}

    return NextResponse.json({ received: true })
  } catch (err: any) {
    await logWebhookEvent({ source: 'stripe', status: 'error', error: err?.message })
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
