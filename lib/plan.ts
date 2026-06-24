import { supabase } from './supabase'

export type Plan = 'free' | 'pro' | 'enterprise'

export const PLAN_FEATURES: Record<Plan, string[]> = {
  free: ['ideas', 'roadmap', 'announcements', 'help', 'polls', 'surveys', 'basicAnalytics'],
  pro: ['ideas', 'roadmap', 'announcements', 'help', 'polls', 'surveys', 'basicAnalytics',
        'whiteListing', 'apiAccess', 'customDomain', 'advancedAnalytics', 'webhooks',
        'boostAnnouncements', 'customFields', 'segments', 'removesBranding'],
  enterprise: ['*'], // all features
}

let _cachedPlan: Plan | null = null
let _cacheTime = 0

export async function getUserPlan(userId?: string): Promise<Plan> {
  if (!userId) return 'free'
  
  // Cache for 5 minutes
  if (_cachedPlan && Date.now() - _cacheTime < 5 * 60 * 1000) return _cachedPlan

  try {
    const { data } = await (supabase as any)
      .from('subscriptions')
      .select('tier, status')
      .eq('user_id', userId)
      .single()
    
    if (data?.status === 'active' && data?.tier) {
      _cachedPlan = data.tier as Plan
      _cacheTime = Date.now()
      return _cachedPlan
    }
  } catch {}

  return 'free'
}

export function canAccess(plan: Plan, feature: string): boolean {
  if (plan === 'enterprise') return true
  return PLAN_FEATURES[plan]?.includes(feature) || false
}

export function isPro(plan: Plan): boolean {
  return plan === 'pro' || plan === 'enterprise'
}

export const PLAN_LIMITS: Record<Plan, Record<string, number | boolean>> = {
  free:       { teamMembers: 5,         ideas: Infinity, apiCalls: 0,    customDomain: false },
  pro:        { teamMembers: Infinity,   ideas: Infinity, apiCalls: 1000, customDomain: true },
  enterprise: { teamMembers: Infinity,   ideas: Infinity, apiCalls: 10000, customDomain: true },
}
