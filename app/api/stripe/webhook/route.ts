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
