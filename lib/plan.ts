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

// Features/limits the super admin can override per-company (a curated subset of
// the plan matrix — the base features every plan has are always on). Keys match
// PLAN_FEATURES / PLAN_LIMITS above.
export const OVERRIDABLE_FEATURES: { key: string; label: string }[] = [
  { key: 'polls', label: 'Polls' },
  { key: 'surveys', label: 'Surveys' },
  { key: 'apiAccess', label: 'API access' },
  { key: 'webhooks', label: 'Webhooks' },
  { key: 'advancedAnalytics', label: 'Advanced analytics' },
  { key: 'customFields', label: 'Custom fields' },
  { key: 'segments', label: 'Segments' },
  { key: 'boostAnnouncements', label: 'Boosted announcements' },
  { key: 'whiteListing', label: 'White-labelling' },
  { key: 'removesBranding', label: 'Remove Colvy branding' },
  { key: 'customDomain', label: 'Custom domain' },
  { key: 'prioritySupport', label: 'Priority support' },
]
export const OVERRIDABLE_LIMITS: { key: string; label: string }[] = [
  { key: 'teamMembers', label: 'Team members' },
  { key: 'ideas', label: 'Ideas' },
  { key: 'surveys', label: 'Surveys' },
  { key: 'apiCalls', label: 'API calls / period' },
]

export interface EffectiveEntitlements {
  features: Record<string, boolean>
  limits: Record<string, any>
  overrides: { features?: Record<string, boolean>; limits?: Record<string, any>; reason?: string } | null
}

/**
 * The effective features and limits for a company: the plan defaults, with any
 * per-company overrides from company_entitlements applied on top. A feature/limit
 * key absent from the overrides means "use the plan default". Accepts any
 * supabase-like client (browser or service).
 */
export async function resolveEntitlements(db: any, companyId: string, plan: Plan): Promise<EffectiveEntitlements> {
  const planFeatures = PLAN_FEATURES[plan] || []
  const featureOn = (k: string) => plan === 'enterprise' || planFeatures.includes('*') || planFeatures.includes(k)
  const baseFeatures: Record<string, boolean> = {}
  OVERRIDABLE_FEATURES.forEach(f => { baseFeatures[f.key] = featureOn(f.key) })
  const baseLimits: Record<string, any> = { ...(PLAN_LIMITS[plan] || {}) }
  let overrides: any = null
  try {
    const { data } = await db.from('company_entitlements').select('*').eq('company_id', companyId).maybeSingle()
    overrides = data || null
  } catch { /* table may not exist yet */ }
  return {
    features: { ...baseFeatures, ...(overrides?.features || {}) },
    limits: { ...baseLimits, ...(overrides?.limits || {}) },
    overrides,
  }
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
