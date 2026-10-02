import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createChatCheckoutSession, chatStripe } from '@/lib/chat-checkout'
import { confirmChatPayment } from '@/lib/chat-payment-confirm'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// Payment for a public form's `payment` question. Reuses the chat-payments money
// path (chat_payments row + hosted Checkout + the shared confirm helper) with no
// conversation attached. The amount is ALWAYS read from the form definition
// server-side — never trusted from the client — so it can't be tampered with.
//
// POST { action: 'create', formId, questionId, origin }  → { checkoutUrl, paymentId }
// POST { action: 'verify', paymentId }                   → { status: 'paid' | 'pending', amountCents, currency }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { action } = body
    const db = admin()

    if (action === 'create') {
      const { formId, questionId, origin } = body
      if (!formId || !questionId) return NextResponse.json({ error: 'formId and questionId required' }, { status: 400 })

      const { data: form } = await db.from('forms').select('id, company_id, title, questions, is_published').eq('id', formId).maybeSingle()
      if (!form || !form.is_published) return NextResponse.json({ error: 'Form not found' }, { status: 404 })
      const q = (form.questions || []).find((x: any) => x.id === questionId && x.type === 'payment')
      if (!q) return NextResponse.json({ error: 'Payment question not found' }, { status: 404 })

      const cents = Math.round(Number(q.amountCents) || 0)
      if (!cents || cents < 50) return NextResponse.json({ error: 'This payment field has no valid amount set.' }, { status: 400 })
      const currency = (q.currency || 'aud').toLowerCase()
      const description = q.title || `Payment to ${form.title}`

      const { data: company } = await db.from('companies').select('*').eq('id', form.company_id).maybeSingle()
      if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 })
      const stripeReady = (company.stripe_mode === 'keys' && company.stripe_secret_key) || company.stripe_connected || company.stripe_account_id
      if (!stripeReady) return NextResponse.json({ error: 'Payments are not set up for this business yet.' }, { status: 400 })

      // The chat_payments row is the durable record the webhook + verify + admin
      // Payments page all key off. No conversation for a form payment.
      const { data: pay, error: perr } = await db.from('chat_payments').insert({
        company_id: form.company_id, conversation_id: null, message_id: null,
        amount_cents: cents, currency, description, status: 'pending',
      }).select('id').maybeSingle()
      if (perr || !pay?.id) return NextResponse.json({ error: 'Could not start the payment' }, { status: 500 })

      // Return the customer to the form itself so it can resume and record the
      // paid state. Only accept an https origin from the client for the return.
      const safeOrigin = typeof origin === 'string' && /^https:\/\/[a-z0-9.-]+$/i.test(origin) ? origin : (process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com')
      const successUrl = `${safeOrigin}/forms/${formId}?form_paid=${pay.id}&session_id={CHECKOUT_SESSION_ID}`
      const cancelUrl = `${safeOrigin}/forms/${formId}?form_pay_cancelled=1`

      try {
        const session = await createChatCheckoutSession(company, {
          cents, currency, description, companyId: form.company_id, conversationId: '',
          kind: 'form_payment', extraMetadata: { paymentId: pay.id, formId, questionId },
          successUrl, cancelUrl, pageUrl: successUrl,
        })
        await db.from('chat_payments').update({ stripe_session_id: session.id, checkout_url: session.url }).eq('id', pay.id)
        return NextResponse.json({ ok: true, checkoutUrl: session.url, paymentId: pay.id })
      } catch (e: any) {
        try { await db.from('chat_payments').update({ status: 'failed' }).eq('id', pay.id) } catch {}
        return NextResponse.json({ error: e?.message || 'Could not start the payment' }, { status: 502 })
      }
    }

    if (action === 'verify') {
      const { paymentId } = body
      if (!paymentId) return NextResponse.json({ error: 'paymentId required' }, { status: 400 })
      const { data: pay } = await db.from('chat_payments').select('*').eq('id', paymentId).maybeSingle()
      if (!pay) return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
      if (pay.status === 'paid') return NextResponse.json({ ok: true, status: 'paid', amountCents: pay.amount_cents, currency: pay.currency })
      if (!pay.stripe_session_id) return NextResponse.json({ ok: true, status: pay.status || 'pending', amountCents: pay.amount_cents, currency: pay.currency })

      const { data: company } = await db.from('companies').select('*').eq('id', pay.company_id).maybeSingle()
      const { s, connectOpts } = chatStripe(company)
      const session: any = await s.checkout.sessions.retrieve(pay.stripe_session_id, { expand: ['payment_intent.latest_charge'] } as any, connectOpts)
      const isPaid = session?.payment_status === 'paid' || session?.status === 'complete'
      if (!isPaid) return NextResponse.json({ ok: true, status: 'pending', amountCents: pay.amount_cents, currency: pay.currency })

      const card = session?.payment_intent?.latest_charge?.payment_method_details?.card || null
      await confirmChatPayment(db, {
        id: pay.id, company_id: pay.company_id, conversation_id: pay.conversation_id,
        message_id: pay.message_id, amount_cents: pay.amount_cents,
      }, {
        receiptUrl: session?.receipt_url || null,
        paymentIntent: (typeof session?.payment_intent === 'string' ? session.payment_intent : session?.payment_intent?.id) || null,
        cardBrand: card?.brand || null, cardLast4: card?.last4 || null,
      })
      return NextResponse.json({ ok: true, status: 'paid', amountCents: pay.amount_cents, currency: pay.currency })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
