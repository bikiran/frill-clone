import { supabase } from '@/lib/supabase'

// Only publishable key is safe on client side
const STRIPE_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
// NEVER use STRIPE_SECRET_KEY here — only use it in API routes

// Tier features mapping
export const TIER_FEATURES = {
  free: {
    name: 'Free',
    price: 0,
    features: ['Ideas board', 'Public feedback', '5 team members', 'Basic analytics'],
    limits: { guestVoting: true, whiteListing: false, apiAccess: false },
  },
  pro: {
    name: 'Pro',
    price: 99,
    features: ['Everything in Free', 'White labeling', 'Guest voting control', 'API access', 'Advanced analytics', 'Unlimited team members'],
    limits: { guestVoting: true, whiteListing: true, apiAccess: true },
  },
  enterprise: {
    name: 'Enterprise',
    price: 299,
    features: ['Everything in Pro', 'SSO (Google, GitHub, SAML)', 'Priority support', 'Custom integration', 'Dedicated account manager'],
    limits: { guestVoting: true, whiteListing: true, apiAccess: true, sso: true },
  },
}

export async function getUserSubscription(userId: string) {
  try {
    const { data } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .single()
    return data || { tier: 'free' }
  } catch {
    return { tier: 'free' }
  }
}

export async function canAccessFeature(userId: string, feature: 'whiteListing' | 'guestVoting' | 'apiAccess' | 'sso') {
  const sub = await getUserSubscription(userId)
  const limits = TIER_FEATURES[sub.tier as keyof typeof TIER_FEATURES]?.limits || {}
  return limits[feature as keyof typeof limits] === true
}

export async function createCheckoutSession(userId: string, tier: 'pro' | 'enterprise', returnUrl: string) {
  try {
    // Call backend to create Stripe session
    const response = await fetch('/api/stripe/create-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, tier, returnUrl }),
    })
    const { sessionId } = await response.json()
    return sessionId
  } catch (err) {
    throw new Error('Checkout failed: ' + (err as any).message)
  }
}

export async function cancelSubscription(userId: string) {
  try {
    await fetch('/api/stripe/cancel-subscription', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    })
  } catch (err) {
    throw new Error('Cancellation failed: ' + (err as any).message)
  }
}

export async function upgradeSubscription(userId: string, newTier: 'pro' | 'enterprise') {
  try {
    const response = await fetch('/api/stripe/upgrade-subscription', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, newTier }),
    })
    return await response.json()
  } catch (err) {
    throw new Error('Upgrade failed: ' + (err as any).message)
  }
}
