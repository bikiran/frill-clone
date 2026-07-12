import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// Verifies pending payments straight from Stripe, rather than relying on the
// webhook. If the Stripe webhook isn't configured (or a delivery was missed),
// payments would sit as "pending" in the chat forever — this reconciles them.
//
// Called with a conversationId (checks that chat's payments) or a paymentId.
export async function POST(req: NextRequest) {
  try {
    const { conversationId, paymentId, companyId } = await req.json()
    const db = admin()

    let q = db.from('chat_payments').select('*').eq('status', 'pending')
    if (paymentId) q = q.eq('id', paymentId)
    else if (conversationId) q = q.eq('conversation_id', conversationId)
    else if (companyId) q = q.eq('company_id', companyId)
    else return NextResponse.json({ error: 'conversationId, paymentId or companyId required' }, { status: 400 })

    const { data: pending } = await q.limit(25)
    if (!pending || pending.length === 0) return NextResponse.json({ ok: true, checked: 0, updated: 0 })

    let updated = 0
    const results: any[] = []

    for (const pay of pending) {
      try {
        const { data: company } = await db.from('companies').select('*').eq('id', pay.company_id).maybeSingle()
        const useOwnKeys = company?.stripe_mode === 'keys' && company?.stripe_secret_key
        const key = useOwnKeys ? company.stripe_secret_key : process.env.STRIPE_SECRET_KEY
        if (!key) { results.push({ id: pay.id, error: 'No Stripe key' }); continue }

        const s = new Stripe(String(key).trim(), { apiVersion: '2024-06-20' as any })
        const opts: any = useOwnKeys ? undefined : (company?.stripe_account_id ? { stripeAccount: company.stripe_account_id } : undefined)

        // We stored the Checkout Session id when the payment was created.
        const sessionId = pay.stripe_session_id || pay.session_id
        if (!sessionId) { results.push({ id: pay.id, error: 'No Stripe session id stored' }); continue }

        const session: any = await s.checkout.sessions.retrieve(sessionId, opts)
        const isPaid = session?.payment_status === 'paid' || session?.status === 'complete'

        if (!isPaid) { results.push({ id: pay.id, status: session?.payment_status || 'unpaid' }); continue }

        // Mark paid + post the confirmation into the chat (same as the webhook).
        await db.from('chat_payments').update({
          status: 'paid', paid_at: new Date().toISOString(),
        }).eq('id', pay.id)

        if (pay.message_id) {
          const { data: m } = await db.from('messages').select('message_payload').eq('id', pay.message_id).maybeSingle()
          await db.from('messages').update({
            message_payload: { ...((m as any)?.message_payload || {}), status: 'paid' },
          }).eq('id', pay.message_id)
        }

        if (pay.conversation_id) {
          await db.from('messages').insert({
            conversation_id: pay.conversation_id,
            company_id: pay.company_id,
            sender_type: 'system',
            content: `✅ Payment received${pay.amount_cents ? ` — $${(pay.amount_cents / 100).toFixed(2)} AUD` : ''}.`,
            metadata: { payment_confirmed: true, payment_id: pay.id },
          })
        }

        updated++
        results.push({ id: pay.id, status: 'paid' })
      } catch (e: any) {
        results.push({ id: pay.id, error: e.message })
      }
    }

    return NextResponse.json({ ok: true, checked: pending.length, updated, results })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
