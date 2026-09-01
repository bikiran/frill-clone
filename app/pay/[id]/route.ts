import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { chatStripe, createChatCheckoutSession } from '@/lib/chat-checkout'

export const dynamic = 'force-dynamic'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

// Durable customer pay link. The link we SMS points here (behind /l/<code>), not
// at a raw Stripe Checkout URL — because Checkout sessions expire after ~24h and
// a customer opening the link a day later would hit Stripe's "session timed out"
// dead end. On each open we reuse the existing session if it's still open, and
// otherwise mint a fresh one from the stored amount + the old session's
// metadata, so the same link keeps working until the payment is made.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const colvyBase = process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com'
  try {
    const db = admin()
    const { data: pay } = await db.from('chat_payments').select('*').eq('id', id).maybeSingle()
    if (!pay) return new NextResponse('Payment not found', { status: 404 })

    // Already settled — send them to the success page rather than a new checkout.
    if (pay.status === 'paid' || pay.status === 'refunded') {
      return NextResponse.redirect(`${colvyBase}/pay/success`)
    }

    const { data: company } = await db.from('companies').select('*').eq('id', pay.company_id).maybeSingle()
    if (!company) return new NextResponse('Business unavailable', { status: 404 })

    const { s, connectOpts } = chatStripe(company)

    // Reuse the current session while it's still open; otherwise regenerate.
    let url: string | null = null
    let meta: any = {}
    if (pay.stripe_session_id) {
      try {
        const old = await s.checkout.sessions.retrieve(pay.stripe_session_id, connectOpts as any)
        meta = old?.metadata || {}
        if (old?.status === 'complete' || old?.payment_status === 'paid') {
          // Paid, but our webhook hasn't caught up yet — don't offer another charge.
          return NextResponse.redirect(`${colvyBase}/pay/success`)
        }
        if (old?.status === 'open' && old.url) url = old.url
      } catch { /* session gone/unretrievable — fall through and make a fresh one */ }
    }

    if (!url) {
      const fresh = await createChatCheckoutSession(company, {
        cents: pay.amount_cents, currency: pay.currency || 'aud', description: pay.description,
        companyId: pay.company_id, conversationId: pay.conversation_id,
        orderId: meta.orderId || null, integrationId: meta.integrationId || null,
        originHost: meta.originHost || null, originVerified: meta.originVerified === '1',
        pageUrl: meta.pageUrl || null,
      })
      if (!fresh.url) return new NextResponse('Could not start checkout', { status: 502 })
      url = fresh.url
      // Point the record at the new live session; keep checkout_url (the durable
      // /pay link) untouched so Copy/Resend keep working.
      try { await db.from('chat_payments').update({ stripe_session_id: fresh.id }).eq('id', id) } catch {}
    }

    return NextResponse.redirect(url)
  } catch {
    return new NextResponse('Error', { status: 500 })
  }
}
