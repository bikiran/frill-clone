import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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
      return NextResponse.json({ error: 'Webhook signature failed' }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object
        const meta = session.metadata || {}

        // In-chat payment (on a connected account) — mark paid + confirm in chat
        if (meta.kind === 'chat_payment' && meta.conversationId) {
          const receiptUrl = session.receipt_url || null
          await (supabase as any).from('chat_payments').update({
            status: 'paid', paid_at: new Date().toISOString(),
            stripe_payment_intent: session.payment_intent || null,
            receipt_url: receiptUrl,
          }).eq('stripe_session_id', session.id)
          // Update the payment message's payload to 'paid'
          const { data: pay } = await (supabase as any).from('chat_payments').select('message_id, amount_cents').eq('stripe_session_id', session.id).maybeSingle()
          if (pay?.message_id) {
            const { data: m } = await (supabase as any).from('messages').select('message_payload').eq('id', pay.message_id).maybeSingle()
            await (supabase as any).from('messages').update({ message_payload: { ...(m?.message_payload || {}), status: 'paid' } }).eq('id', pay.message_id)
          }
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
          // Post a confirmation system message
          await (supabase as any).from('messages').insert({
            conversation_id: meta.conversationId, company_id: meta.companyId,
            sender_type: 'system',
            content: `✅ Payment received${pay?.amount_cents ? ` — $${(pay.amount_cents / 100).toFixed(2)} AUD` : ''}. A receipt has been emailed to the customer.`,
          })
          break
        }
        const { userId, tier } = meta
        if (userId && tier) {
          await (supabase as any).from('subscriptions').upsert({
            user_id: userId,
            stripe_customer_id: session.customer,
            stripe_subscription_id: session.subscription,
            tier,
            status: 'active',
            current_period_start: new Date().toISOString(),
            current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          }, { onConflict: 'user_id' })
        }
        // Phone number purchase — provision the number now that payment is set up
        if (meta.kind === 'phone_number' && meta.companyId) {
          try {
            const origin = process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com'
            await fetch(`${origin}/api/telnyx/number`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                companyId: meta.companyId,
                phoneNumber: meta.phoneNumber || undefined,
                stripeSubscriptionId: session.subscription,
              }),
            })
          } catch (e) {
            console.error('Post-payment number provisioning failed:', e)
          }
        }
        break
      }
      case 'customer.subscription.updated': {
        const sub = event.data.object
        await (supabase as any).from('subscriptions').update({
          status: sub.status,
          current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
        }).eq('stripe_subscription_id', sub.id)
        break
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object
        await (supabase as any).from('subscriptions').update({
          status: 'canceled',
          tier: 'free',
        }).eq('stripe_subscription_id', sub.id)
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
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
