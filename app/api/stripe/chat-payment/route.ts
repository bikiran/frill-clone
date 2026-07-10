import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function stripe() {
  const secret = (process.env.STRIPE_SECRET_KEY || '').trim()
  if (!secret.startsWith('sk_')) throw new Error('Stripe not configured — add STRIPE_SECRET_KEY.')
  return new Stripe(secret, { apiVersion: '2024-06-20' as any })
}

// Creates a hosted Stripe Checkout session on the business's CONNECTED account,
// posts a payment card into the chat, and (for SMS) returns a pay link.
// Using hosted Checkout keeps card data off our servers (no PCI scope) while
// still feeling inline — the widget shows amount + a secure Pay button.
export async function POST(req: NextRequest) {
  try {
    const { companyId, conversationId, amount, description, senderName } = await req.json()
    if (!companyId || !conversationId || !amount) {
      return NextResponse.json({ error: 'Missing companyId, conversationId or amount' }, { status: 400 })
    }
    const cents = Math.round(parseFloat(amount) * 100)
    if (!cents || cents < 100) return NextResponse.json({ error: 'Amount must be at least $1.00' }, { status: 400 })

    const db = admin()
    const { data: company } = await db.from('companies').select('*').eq('id', companyId).maybeSingle()

    // Two modes: (1) Connect — charge on the connected account with the platform
    // key; (2) Keys — the business supplied their own Stripe secret key.
    const useOwnKeys = company?.stripe_mode === 'keys' && company?.stripe_secret_key
    if (!useOwnKeys && (!company?.stripe_account_id || !company.stripe_connected)) {
      return NextResponse.json({ error: 'Connect your Stripe account first (Integrations → Stripe), or add your Stripe keys.' }, { status: 400 })
    }

    const s = useOwnKeys
      ? new Stripe((company.stripe_secret_key || '').trim(), { apiVersion: '2024-06-20' as any })
      : stripe()
    const origin = req.headers.get('origin') || process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com'

    // Optional platform fee (only applies to Connect mode; not when the
    // business uses their own keys — the money is already theirs).
    const feePct = useOwnKeys ? 0 : parseFloat(process.env.COLVY_PAYMENT_FEE_PCT || '0')
    const applicationFee = feePct > 0 ? Math.round(cents * (feePct / 100)) : 0

    const session = await s.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'aud',
          product_data: { name: description || `Payment to ${company.name}` },
          unit_amount: cents,
        },
        quantity: 1,
      }],
      payment_intent_data: applicationFee > 0 ? { application_fee_amount: applicationFee } : undefined,
      success_url: `${origin}/pay/success?cs={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/pay/cancelled`,
      metadata: { kind: 'chat_payment', companyId, conversationId },
    }, useOwnKeys ? undefined : { stripeAccount: company.stripe_account_id })

    // Post the payment message into the chat
    const { data: msg } = await db.from('messages').insert({
      conversation_id: conversationId,
      company_id: companyId,
      sender_type: 'agent',
      sender_name: senderName || company.name,
      content: `💳 Payment request: $${(cents / 100).toFixed(2)} AUD${description ? ` — ${description}` : ''}`,
      message_type: 'payment',
      message_payload: { amount_cents: cents, currency: 'aud', description: description || null, checkout_url: session.url, status: 'pending' },
    }).select().maybeSingle()

    // Record the payment
    await db.from('chat_payments').insert({
      company_id: companyId, conversation_id: conversationId, message_id: msg?.id,
      amount_cents: cents, currency: 'aud', description: description || null,
      status: 'pending', stripe_session_id: session.id, checkout_url: session.url,
    })

    await db.from('conversations').update({
      last_message: `💳 Payment request: $${(cents / 100).toFixed(2)}`,
      last_message_at: new Date().toISOString(),
    }).eq('id', conversationId)

    return NextResponse.json({ ok: true, checkoutUrl: session.url, messageId: msg?.id })
  } catch (err: any) {
    console.error('Chat payment error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
