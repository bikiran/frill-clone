import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { shortenUrl } from '@/lib/short-link'
import { createClient } from '@supabase/supabase-js'
import { createChatCheckoutSession } from '@/lib/chat-checkout'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Creates a hosted Stripe Checkout session on the business's CONNECTED account,
// posts a payment card into the chat, and (for SMS) returns a pay link.
// Using hosted Checkout keeps card data off our servers (no PCI scope) while
// still feeling inline — the widget shows amount + a secure Pay button.
export async function POST(req: NextRequest) {
  try {
    const { companyId, conversationId, amount, description, senderName, orderId, integrationId, pageUrl, channel } = await req.json()
    // The customer's real channel, so the payment card is labelled correctly
    // (SMS/email/Messenger) instead of always reading "Live Chat". The caller
    // delivers the actual pay link over that channel.
    const deliveryChannel = ['sms', 'email', 'instagram', 'facebook', 'chat'].includes(channel) ? channel : 'chat'
    if (!companyId || !conversationId || !amount) {
      return NextResponse.json({ error: 'Missing companyId, conversationId or amount' }, { status: 400 })
    }
    const cents = Math.round(parseFloat(amount) * 100)
    if (!cents || cents < 100) return NextResponse.json({ error: 'Amount must be at least $1.00' }, { status: 400 })

    const db = admin()
    const { data: company } = await db.from('companies').select('*').eq('id', companyId).maybeSingle()
    // The customer's widget page URL is stored on the conversation when the chat
    // started — that's the trustworthy origin (the agent initiates payment, so
    // the request headers reflect the AGENT's location, not the customer's).
    const { data: convRow } = await db.from('conversations').select('page_url').eq('id', conversationId).maybeSingle()
    const convPageUrl = convRow?.page_url || null

    // Two modes: (1) Connect — charge on the connected account with the platform
    // key; (2) Keys — the business supplied their own Stripe secret key.
    const useOwnKeys = company?.stripe_mode === 'keys' && company?.stripe_secret_key
    if (!useOwnKeys && (!company?.stripe_account_id || !company.stripe_connected)) {
      return NextResponse.json({ error: 'Connect your Stripe account first (Integrations → Stripe), or add your Stripe keys.' }, { status: 400 })
    }

    const colvyBase = process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com'

    // ── Determine the safe return origin ────────────────────────────────────
    // The customer is on the BUSINESS website (e.g. roxyaquarium.com.au) with an
    // embedded widget. Checkout must return them there — NOT to the Colvy tenant
    // subdomain. We only trust an origin that matches the tenant's configured &
    // verified website_domains (both www and non-www).
    const verified: string[] = Array.isArray(company?.website_domains) ? company.website_domains : []
    const normalizeHost = (u: string | null): string | null => {
      if (!u) return null
      try { return new URL(u).hostname.replace(/^www\./, '').toLowerCase() } catch { return null }
    }
    const candidate = normalizeHost(convPageUrl) || normalizeHost(pageUrl) || normalizeHost(req.headers.get('origin')) || normalizeHost(req.headers.get('referer'))
    const isVerified = !!candidate && verified.some(d => (d || '').replace(/^www\./, '').toLowerCase() === candidate)

    // The customer-facing link is durable: it points at /pay/<id>, which mints a
    // fresh Checkout session whenever the previous one has expired (Stripe
    // Checkout sessions die after ~24h). So an SMS'd link keeps working for days
    // instead of dead-ending on Stripe's "session has timed out" page.
    const payId = randomUUID()
    const session = await createChatCheckoutSession(company, {
      cents, currency: 'aud', description, companyId, conversationId,
      orderId, integrationId, originHost: candidate, originVerified: isVerified, pageUrl,
    })

    // Post the payment message into the chat. Wrap the durable /pay/<id> URL
    // behind colvy.com/l/<code> so it's short in SMS and readable in chat.
    const payUrl = `${colvyBase}/pay/${payId}`
    const shortUrl = await shortenUrl(payUrl, {
      companyId, kind: 'payment', conversationId,
    })
    const custLink = shortUrl || payUrl

    const { data: msg } = await db.from('messages').insert({
      conversation_id: conversationId,
      company_id: companyId,
      sender_type: 'agent',
      sender_name: senderName || company.name,
      content: `💳 Payment request: $${(cents / 100).toFixed(2)} AUD${description ? ` — ${description}` : ''}`,
      message_type: 'payment',
      delivery_channel: deliveryChannel,
      message_payload: { amount_cents: cents, currency: 'aud', description: description || null, checkout_url: custLink, status: 'pending', order_id: orderId || null },
    }).select().maybeSingle()

    // Record the payment. checkout_url is the DURABLE customer link (/pay/<id>
    // behind the short link); stripe_session_id is the current live session,
    // which /pay/<id> refreshes on demand.
    await db.from('chat_payments').insert({
      id: payId,
      company_id: companyId, conversation_id: conversationId, message_id: msg?.id,
      amount_cents: cents, currency: 'aud', description: description || null,
      status: 'pending', stripe_session_id: session.id, checkout_url: custLink,
    })

    await db.from('conversations').update({
      last_message: `💳 Payment request: $${(cents / 100).toFixed(2)}`,
      last_message_at: new Date().toISOString(),
    }).eq('id', conversationId)

    return NextResponse.json({ ok: true, checkoutUrl: custLink, fullUrl: payUrl, messageId: msg?.id })
  } catch (err: any) {
    console.error('Chat payment error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
