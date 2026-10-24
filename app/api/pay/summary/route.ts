import { NextRequest, NextResponse, after } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { chatStripe } from '@/lib/chat-checkout'

export const dynamic = 'force-dynamic'

const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })
const uuid = (v: any) => (typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v) ? v : null)

// "jo.smith@gmail.com" → "j•••h@gmail.com" — enough to recognise, not to harvest.
const maskEmail = (e: string) => {
  const [user, domain] = String(e || '').split('@')
  if (!user || !domain) return null
  return `${user[0]}${user.length > 2 ? '•••' : '•'}${user.length > 1 ? user[user.length - 1] : ''}@${domain}`
}

/**
 * GET /api/pay/summary?c=<companyId>[&session_id=cs_…]
 *
 * Public: what the customer-facing thank-you / cancelled / card-saved pages
 * show — the business's name, logo and colour, and (with a Checkout session of
 * that business) the amount, what it was for, and the Stripe receipt link.
 * Only public business details; the session must belong to the business.
 */
export async function GET(req: NextRequest) {
  const sessionId = String(req.nextUrl.searchParams.get('session_id') || '')
  const db = admin()
  let companyId = uuid(req.nextUrl.searchParams.get('c'))
  // Links sent before ?c= existed: find the business from the payment itself.
  if (!companyId && /^cs_[A-Za-z0-9_]+$/.test(sessionId)) {
    const { data: pay } = await db.from('chat_payments').select('company_id').eq('stripe_session_id', sessionId).maybeSingle()
    companyId = pay?.company_id || null
  }
  if (!companyId) return NextResponse.json({ brand: null })
  const { data: company } = await db.from('companies').select('*').eq('id', companyId).maybeSingle()
  if (!company) return NextResponse.json({ brand: null })
  const brand = { name: company.name || null, logo_url: company.logo_url || null, accent_color: company.accent_color || null }
  if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) return NextResponse.json({ brand })

  try {
    const { s, connectOpts } = await chatStripe(company)
    const session: any = await s.checkout.sessions.retrieve(sessionId, { expand: ['payment_intent.latest_charge', 'line_items'] } as any, connectOpts as any)
    if (session?.metadata?.companyId && session.metadata.companyId !== companyId) return NextResponse.json({ brand })
    const charge = typeof session?.payment_intent === 'object' ? session.payment_intent?.latest_charge : null
    const receiptsOn = company.payment_settings?.paylink_receipt !== false
    const email = session?.customer_details?.email || null
    // The customer is looking at "payment received": make sure Colvy knows too
    // (card → PAID, "Payment received" in the thread, the customer and team
    // told). The webhook usually got there first; confirming twice is a no-op.
    if (session?.payment_status === 'paid' && (session?.metadata?.kind || 'chat_payment') === 'chat_payment') {
      after(async () => {
        try {
          const { data: pending } = await db.from('chat_payments').select('*').eq('stripe_session_id', sessionId).eq('company_id', companyId).eq('status', 'pending').limit(1)
          if (pending?.length) {
            const { reconcilePayments } = await import('@/lib/payment-links')
            await reconcilePayments(db, pending)
          }
        } catch (e: any) { console.warn('[pay/summary] confirm', e?.message || e) }
      })
    }
    return NextResponse.json({
      brand,
      payment: {
        paid: session?.payment_status === 'paid',
        amount: session?.amount_total != null ? session.amount_total / 100 : null,
        currency: String(session?.currency || 'aud').toUpperCase(),
        description: session?.line_items?.data?.[0]?.description || null,
        receipt_url: charge?.receipt_url || null,
        // Where the receipt goes (Stripe sends it; see lib/paylink-capture).
        receipt_to: receiptsOn && email ? maskEmail(email) : null,
        card_saved: session?.mode === 'setup',
      },
    })
  } catch {
    return NextResponse.json({ brand })
  }
}
