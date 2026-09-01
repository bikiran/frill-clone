import Stripe from 'stripe'

// Shared Stripe Checkout logic for customer "pay by link" payments, used by both
// the send endpoint (/api/stripe/chat-payment) and the durable pay resolver
// (/pay/[id]). Kept in one place so the money path can't drift between the two.

export function platformStripe(): Stripe {
  const secret = (process.env.STRIPE_SECRET_KEY || '').trim()
  if (!secret.startsWith('sk_')) throw new Error('Stripe not configured — add STRIPE_SECRET_KEY.')
  return new Stripe(secret, { apiVersion: '2024-06-20' as any })
}

// The Stripe client + Connect options for a company's chat payments. Two modes:
// the business's own keys, or the platform key charging their connected account.
export function chatStripe(company: any): { s: Stripe; connectOpts: Stripe.RequestOptions | undefined; useOwnKeys: boolean } {
  const useOwnKeys = company?.stripe_mode === 'keys' && !!company?.stripe_secret_key
  const s = useOwnKeys
    ? new Stripe(String(company.stripe_secret_key || '').trim(), { apiVersion: '2024-06-20' as any })
    : platformStripe()
  const connectOpts = useOwnKeys ? undefined : (company?.stripe_account_id ? { stripeAccount: company.stripe_account_id } : undefined)
  return { s, connectOpts, useOwnKeys }
}

function returnUrls(originHost: string | null, originVerified: boolean, colvyBase: string) {
  if (originVerified && originHost) {
    return { successBase: `https://${originHost}/payment-success`, cancelUrl: `https://${originHost}/payment-cancelled` }
  }
  return { successBase: `${colvyBase}/pay/success`, cancelUrl: `${colvyBase}/pay/cancelled` }
}

export type ChatCheckoutOpts = {
  cents: number
  currency?: string
  description?: string | null
  companyId: string
  conversationId: string
  orderId?: string | null
  integrationId?: string | null
  originHost?: string | null
  originVerified?: boolean
  pageUrl?: string | null
}

// Create a hosted Checkout session on the business's account. Card data stays
// off our servers. Metadata carries everything the webhook and a later
// regeneration need, so a fresh session can always be rebuilt from an old one.
export async function createChatCheckoutSession(company: any, opts: ChatCheckoutOpts): Promise<Stripe.Checkout.Session> {
  const { s, connectOpts, useOwnKeys } = chatStripe(company)
  const colvyBase = process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com'
  const { successBase, cancelUrl } = returnUrls(opts.originHost || null, !!opts.originVerified, colvyBase)
  const successUrl = `${successBase}?session_id={CHECKOUT_SESSION_ID}`

  const feePct = useOwnKeys ? 0 : parseFloat(process.env.COLVY_PAYMENT_FEE_PCT || '0')
  const applicationFee = feePct > 0 ? Math.round(opts.cents * (feePct / 100)) : 0

  return s.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    line_items: [{
      price_data: {
        currency: opts.currency || 'aud',
        product_data: { name: opts.description || `Payment to ${company.name}` },
        unit_amount: opts.cents,
      },
      quantity: 1,
    }],
    payment_intent_data: applicationFee > 0 ? { application_fee_amount: applicationFee } : undefined,
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      kind: 'chat_payment', companyId: opts.companyId, conversationId: opts.conversationId,
      orderId: opts.orderId ? String(opts.orderId) : '',
      integrationId: opts.integrationId ? String(opts.integrationId) : '',
      originHost: opts.originHost || '', originVerified: opts.originVerified ? '1' : '0',
      pageUrl: (opts.pageUrl || '').slice(0, 400),
    },
  }, connectOpts)
}
