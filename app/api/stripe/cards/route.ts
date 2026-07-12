import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// Resolve the right Stripe client + account options for a company.
async function stripeFor(db: any, companyId: string) {
  const { data: company } = await db.from('companies').select('*').eq('id', companyId).maybeSingle()
  const useOwnKeys = company?.stripe_mode === 'keys' && company?.stripe_secret_key
  const key = useOwnKeys ? company.stripe_secret_key : process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('Stripe is not configured.')
  if (!useOwnKeys && (!company?.stripe_account_id || !company.stripe_connected)) {
    throw new Error('Connect your Stripe account first (Integrations → Stripe).')
  }
  const s = new Stripe(String(key).trim(), { apiVersion: '2024-06-20' as any })
  const opts: any = useOwnKeys ? undefined : { stripeAccount: company.stripe_account_id }
  return { s, opts, company }
}

// Find-or-create the Stripe customer for a contact.
async function ensureCustomer(db: any, s: Stripe, opts: any, companyId: string, contact: any) {
  if (contact?.stripe_customer_id) return contact.stripe_customer_id
  const cust = await s.customers.create({
    email: contact?.email || undefined,
    name: contact?.name || undefined,
    phone: contact?.phone || undefined,
    metadata: { colvy_contact_id: contact?.id || '', colvy_company_id: companyId },
  }, opts)
  if (contact?.id) {
    await db.from('contacts').update({ stripe_customer_id: cust.id }).eq('id', contact.id)
  }
  return cust.id
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { action, companyId, conversationId } = body
    if (!companyId || !action) return NextResponse.json({ error: 'companyId and action required' }, { status: 400 })

    const db = admin()
    const { s, opts } = await stripeFor(db, companyId)

    // The customer this is for.
    const { data: conv } = await db.from('conversations').select('*').eq('id', conversationId).maybeSingle()
    const { data: contact } = conv?.contact_id
      ? await db.from('contacts').select('*').eq('id', conv.contact_id).maybeSingle()
      : { data: null as any }

    // ── SAVE CARD ────────────────────────────────────────────────────────────
    // Sends the customer a secure Stripe page to store their card. We never see
    // the card details — Stripe holds them and gives us a payment-method id.
    if (action === 'save_card') {
      if (!contact) return NextResponse.json({ error: 'This chat has no customer details yet.' }, { status: 400 })
      const customerId = await ensureCustomer(db, s, opts, companyId, contact)
      const base = process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com'

      const session = await s.checkout.sessions.create({
        mode: 'setup',
        payment_method_types: ['card'],
        customer: customerId,
        success_url: `${base}/pay/card-saved?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${base}/pay/cancelled`,
        metadata: { kind: 'save_card', companyId, conversationId: conversationId || '', contactId: contact.id },
      }, opts)

      // Post the link into the chat.
      const { data: msg } = await db.from('messages').insert({
        conversation_id: conversationId, company_id: companyId,
        sender_type: 'agent', sender_name: 'System',
        content: 'Please save your card securely with Stripe — we\'ll never see your card details.',
        message_type: 'save_card',
        message_payload: { kind: 'save_card', url: session.url, status: 'pending' },
      }).select().maybeSingle()

      return NextResponse.json({ ok: true, url: session.url, messageId: msg?.id })
    }

    // ── LIST SAVED CARDS ─────────────────────────────────────────────────────
    if (action === 'list_cards') {
      if (!contact?.id) return NextResponse.json({ cards: [] })
      const { data: cards } = await db.from('saved_cards')
        .select('*').eq('company_id', companyId).eq('contact_id', contact.id)
        .order('created_at', { ascending: false })
      return NextResponse.json({ cards: cards || [] })
    }

    // ── CHARGE SAVED CARD ────────────────────────────────────────────────────
    // Charges a card the customer already saved, without asking them again.
    if (action === 'charge_card') {
      const { amount, description, cardId } = body
      const cents = Math.round(parseFloat(amount) * 100)
      if (!cents || cents < 100) return NextResponse.json({ error: 'Amount must be at least $1.00' }, { status: 400 })
      if (!contact?.id) return NextResponse.json({ error: 'This chat has no customer details yet.' }, { status: 400 })

      // Which card?
      let card: any = null
      if (cardId) {
        const { data } = await db.from('saved_cards').select('*').eq('id', cardId).maybeSingle()
        card = data
      } else {
        const { data } = await db.from('saved_cards').select('*')
          .eq('company_id', companyId).eq('contact_id', contact.id)
          .order('is_default', { ascending: false }).order('created_at', { ascending: false }).limit(1)
        card = data?.[0]
      }
      if (!card) return NextResponse.json({ error: 'No saved card for this customer. Use "Save Card" first.' }, { status: 400 })

      // Off-session charge. If the bank demands authentication, Stripe throws and
      // we tell the agent to send a payment link instead — we never silently fail.
      let intent: Stripe.PaymentIntent
      try {
        intent = await s.paymentIntents.create({
          amount: cents,
          currency: 'aud',
          customer: card.stripe_customer_id,
          payment_method: card.stripe_payment_method_id,
          off_session: true,
          confirm: true,
          description: description || `Payment to ${'your business'}`,
          metadata: { kind: 'chat_charge', companyId, conversationId: conversationId || '', contactId: contact.id },
        }, opts)
      } catch (e: any) {
        const needsAuth = e?.code === 'authentication_required'
        return NextResponse.json({
          error: needsAuth
            ? 'The bank requires the customer to authenticate this payment. Send a payment link instead.'
            : (e?.message || 'The card was declined.'),
        }, { status: 402 })
      }

      const succeeded = intent.status === 'succeeded'

      const { data: pay } = await db.from('payments').insert({
        company_id: companyId, conversation_id: conversationId,
        amount_cents: cents, currency: 'aud',
        status: succeeded ? 'paid' : 'pending',
        paid_at: succeeded ? new Date().toISOString() : null,
        payment_method: 'saved_card', saved_card_id: card.id,
        stripe_payment_intent_id: intent.id,
      }).select().maybeSingle()

      await db.from('messages').insert({
        conversation_id: conversationId, company_id: companyId,
        sender_type: 'system',
        content: succeeded
          ? `✅ Charged $${(cents / 100).toFixed(2)} AUD to the saved ${card.brand || 'card'} ending ${card.last4}.`
          : `Charge of $${(cents / 100).toFixed(2)} is ${intent.status}.`,
        metadata: { charge: true, payment_id: pay?.id, status: intent.status },
      })

      return NextResponse.json({ ok: true, status: intent.status, paid: succeeded })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
