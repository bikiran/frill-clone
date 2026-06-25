import { supabase } from './supabase'
import { getCompanyByOwner } from './board'

export type Plan = 'free' | 'trial' | 'pro' | 'enterprise'

export const PLAN_FEATURES: Record<Plan, string[]> = {
  free: [
    'ideas', 'roadmap', 'announcements', 'help',
    'basicAnalytics', 'guestVoting', '5teamMembers',
  ],
  trial: [
    'ideas', 'roadmap', 'announcements', 'help',
    'basicAnalytics', 'guestVoting', 'polls', 'surveys',
    'whiteListing', 'apiAccess', 'advancedAnalytics',
    'unlimitedTeam', 'customFields', 'segments', 'boostAnnouncements',
  ],
  pro: [
    'ideas', 'roadmap', 'announcements', 'help',
    'basicAnalytics', 'guestVoting', 'polls', 'surveys',
    'whiteListing', 'apiAccess', 'advancedAnalytics',
    'unlimitedTeam', 'customFields', 'segments', 'boostAnnouncements',
    'webhooks', 'removesBranding', 'customDomain', 'prioritySupport',
  ],
  enterprise: ['*'],
}

export const PLAN_LIMITS: Record<Plan, Record<string, any>> = {
  free:       { teamMembers: 5,        ideas: 50,       surveys: 0,   apiCalls: 0 },
  trial:      { teamMembers: Infinity, ideas: Infinity, surveys: Infinity, apiCalls: 100 },
  pro:        { teamMembers: Infinity, ideas: Infinity, surveys: Infinity, apiCalls: 1000 },
  enterprise: { teamMembers: Infinity, ideas: Infinity, surveys: Infinity, apiCalls: 10000 },
}

export const PLAN_NAMES: Record<Plan, string> = {
  free: 'Free', trial: '14-Day Trial', pro: 'Pro', enterprise: 'Enterprise',
}

export const PLAN_PRICES: Record<Plan, number | null> = {
  free: 0, trial: 0, pro: 99, enterprise: null,
}

let _cachedPlan: Plan | null = null
let _cacheTime = 0
const CACHE_TTL = 5 * 60 * 1000

export async function getUserPlan(userId?: string): Promise<Plan> {
  if (!userId) return 'free'
  if (_cachedPlan && Date.now() - _cacheTime < CACHE_TTL) return _cachedPlan
  try {
    const company = await getCompanyByOwner(userId)
    if (company?.plan) {
      _cachedPlan = company.plan as Plan
      _cacheTime = Date.now()
      return _cachedPlan
    }
  } catch {}
  return 'free'
}

export function canAccess(plan: Plan, feature: string): boolean {
  if (plan === 'enterprise') return true
  const features = PLAN_FEATURES[plan] || []
  return features.includes('*') || features.includes(feature)
}

export function isPro(plan: Plan): boolean {
  return plan === 'pro' || plan === 'enterprise' || plan === 'trial'
}

export function clearPlanCache() {
  _cachedPlan = null
  _cacheTime = 0
}
