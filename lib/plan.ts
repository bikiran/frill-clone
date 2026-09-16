import { supabase } from './supabase'
import { getCompanyByOwner } from './board'

// ─────────────────────────────────────────────────────────────────────────────
// Single source of truth for plan entitlements.
//
// Plan values mirror what the customer buys on the pricing page (`app/pricing`):
//   free · feedback · omnichannel (Inbox) · everything · enterprise
// plus two lifecycle states — `trial` (a full-access preview) and `suspended` —
// and the legacy value `pro` still stored on some rows / settable in the
// platform-admin console. Everything is normalised through `normalizePlan()`,
// so callers can pass whatever is stored on `companies.plan` and get correct
// entitlements. The feature keys and numeric caps below are kept in lockstep
// with the pricing page's TIERS / COMPARE tables.
// ─────────────────────────────────────────────────────────────────────────────

export type Plan =
  | 'free' | 'trial' | 'feedback' | 'omnichannel' | 'everything'
  | 'pro' | 'enterprise' | 'suspended'

// The full paid feature surface (Everything / legacy Pro / trial preview).
const EVERYTHING_FEATURES = [
  'feedbackSuite', 'polls', 'surveys', 'removeBranding',
  'inbox', 'channels', 'campaigns', 'reviewDashboard', 'ecommerceSync',
  'aiAutomation', 'aiWriting', 'whiteLabel', 'customDomain',
  'advancedAnalytics', 'prioritySupport',
]

export const PLAN_FEATURES: Record<Plan, string[]> = {
  free: ['feedbackSuite'],
  feedback: ['feedbackSuite', 'polls', 'surveys', 'removeBranding'],
  omnichannel: ['inbox', 'channels', 'campaigns', 'reviewDashboard', 'ecommerceSync', 'aiAutomation', 'prioritySupport'],
  everything: EVERYTHING_FEATURES,
  trial: EVERYTHING_FEATURES,
  pro: EVERYTHING_FEATURES,        // legacy full-paid alias
  enterprise: ['*'],
  suspended: [],
}

// Numeric caps. Infinity = unlimited. `smsPerMonth` is the included SMS
// allowance (metered beyond it); 0 means the plan cannot send SMS at all.
export const PLAN_LIMITS: Record<Plan, Record<string, any>> = {
  free:        { teamMembers: 2,        smsPerMonth: 0,        polls: 1,        surveys: 1,        helpArticles: 10 },
  feedback:    { teamMembers: 5,        smsPerMonth: 0,        polls: Infinity, surveys: Infinity, helpArticles: Infinity },
  omnichannel: { teamMembers: 10,       smsPerMonth: 3000,     polls: 0,        surveys: 0,        helpArticles: 0 },
  everything:  { teamMembers: Infinity, smsPerMonth: 3000,     polls: Infinity, surveys: Infinity, helpArticles: Infinity },
  trial:       { teamMembers: Infinity, smsPerMonth: 3000,     polls: Infinity, surveys: Infinity, helpArticles: Infinity },
  pro:         { teamMembers: Infinity, smsPerMonth: 3000,     polls: Infinity, surveys: Infinity, helpArticles: Infinity },
  enterprise:  { teamMembers: Infinity, smsPerMonth: Infinity, polls: Infinity, surveys: Infinity, helpArticles: Infinity },
  suspended:   { teamMembers: 0,        smsPerMonth: 0,        polls: 0,        surveys: 0,        helpArticles: 0 },
}

export const PLAN_NAMES: Record<Plan, string> = {
  free: 'Free', trial: '14-Day Trial', feedback: 'Feedback', omnichannel: 'Inbox',
  everything: 'Everything', pro: 'Pro', enterprise: 'Enterprise', suspended: 'Suspended',
}

// Monthly list price (USD), for display only. null = contact sales.
export const PLAN_PRICES: Record<Plan, number | null> = {
  free: 0, trial: 0, feedback: 39, omnichannel: 179, everything: 259,
  pro: 259, enterprise: null, suspended: 0,
}

// Features/limits a super admin can override per-company (company_entitlements).
export const OVERRIDABLE_FEATURES: { key: string; label: string }[] = [
  { key: 'removeBranding', label: 'Remove Colvy branding' },
  { key: 'whiteLabel', label: 'White-label branding' },
  { key: 'customDomain', label: 'Custom domain' },
  { key: 'inbox', label: 'Live chat inbox & CRM' },
  { key: 'channels', label: 'Channels (SMS / WhatsApp / voice)' },
  { key: 'campaigns', label: 'Broadcast & scheduled campaigns' },
  { key: 'reviewDashboard', label: 'Review dashboard' },
  { key: 'ecommerceSync', label: 'WooCommerce / Shopify sync' },
  { key: 'aiAutomation', label: 'AI flow automation' },
  { key: 'aiWriting', label: 'AI writing assistant' },
  { key: 'advancedAnalytics', label: 'Advanced analytics' },
  { key: 'polls', label: 'Polls' },
  { key: 'surveys', label: 'Surveys' },
  { key: 'prioritySupport', label: 'Priority support' },
]
export const OVERRIDABLE_LIMITS: { key: string; label: string }[] = [
  { key: 'teamMembers', label: 'Team members' },
  { key: 'smsPerMonth', label: 'SMS included / month' },
  { key: 'polls', label: 'Polls' },
  { key: 'surveys', label: 'Surveys' },
  { key: 'helpArticles', label: 'Help center articles' },
]

// Map any stored/marketing value onto a canonical Plan. Legacy paid ids collapse
// onto their closest current tier so an existing customer never loses access.
export function normalizePlan(raw: string | null | undefined): Plan {
  switch ((raw || '').toLowerCase()) {
    case 'free': return 'free'
    case 'trial': return 'trial'
    case 'suspended': return 'suspended'
    case 'feedback': return 'feedback'
    case 'omnichannel': return 'omnichannel'
    case 'everything': return 'everything'
    case 'enterprise': return 'enterprise'
    case 'pro':
    case 'business':
    case 'growth': return 'pro'          // legacy full-paid → Everything-equivalent
    case 'startup': return 'omnichannel' // legacy entry paid → Inbox
    default: return 'free'
  }
}

// The plan that actually applies right now. A trial whose window has passed is
// automatically treated as Free (the chosen downgrade-on-expiry behaviour).
export function effectivePlan(raw: string | null | undefined, trialEndsAt?: string | null): Plan {
  const p = normalizePlan(raw)
  if (p === 'trial' && trialEndsAt) {
    const ends = Date.parse(trialEndsAt)
    if (!Number.isNaN(ends) && ends < Date.now()) return 'free'
  }
  return p
}

export interface EffectiveEntitlements {
  features: Record<string, boolean>
  limits: Record<string, any>
  overrides: { features?: Record<string, boolean>; limits?: Record<string, any>; reason?: string } | null
}

/**
 * The effective features and limits for a company: the plan defaults, with any
 * per-company overrides from company_entitlements applied on top. Accepts any
 * supabase-like client (browser or service). `plan` should already be the
 * effective plan (see `effectivePlan`); it is normalised defensively here.
 */
export async function resolveEntitlements(db: any, companyId: string, plan: Plan): Promise<EffectiveEntitlements> {
  const p = normalizePlan(plan)
  const planFeatures = PLAN_FEATURES[p] || []
  const featureOn = (k: string) => p === 'enterprise' || planFeatures.includes('*') || planFeatures.includes(k)
  const baseFeatures: Record<string, boolean> = {}
  OVERRIDABLE_FEATURES.forEach(f => { baseFeatures[f.key] = featureOn(f.key) })
  const baseLimits: Record<string, any> = { ...(PLAN_LIMITS[p] || {}) }
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

// Read a company's effective plan (honouring trial expiry) from the DB.
async function readEffectivePlan(db: any, companyId: string): Promise<Plan> {
  try {
    const { data } = await db.from('companies').select('plan, trial_ends_at').eq('id', companyId).maybeSingle()
    return effectivePlan(data?.plan, data?.trial_ends_at)
  } catch { return 'free' }
}

/**
 * Server-side one-liners for API routes: does this company have a feature /
 * what's its effective limit, honouring per-company overrides AND trial expiry.
 * Pass a service-role supabase client. The plan is read if not supplied.
 */
export async function companyHasFeature(db: any, companyId: string, feature: string, plan?: Plan): Promise<boolean> {
  try {
    const p = plan ? normalizePlan(plan) : await readEffectivePlan(db, companyId)
    const eff = await resolveEntitlements(db, companyId, p)
    if (feature in eff.features) return !!eff.features[feature]
    return canAccess(p, feature)
  } catch { return false }
}
export async function companyLimit(db: any, companyId: string, key: string, plan?: Plan): Promise<any> {
  try {
    const p = plan ? normalizePlan(plan) : await readEffectivePlan(db, companyId)
    const eff = await resolveEntitlements(db, companyId, p)
    return eff.limits[key]
  } catch { return undefined }
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
      _cachedPlan = effectivePlan(company.plan, (company as any).trial_ends_at)
      _cacheTime = Date.now()
      return _cachedPlan
    }
  } catch {}
  return 'free'
}

// Marketing tier id (pricing page + Stripe checkout metadata) → the plan value
// persisted on companies.plan. We now persist the tier itself (normalised), so
// entitlements line up exactly with what was purchased.
export function internalPlanForTier(tier: string | null | undefined): Plan {
  return normalizePlan(tier)
}

export function canAccess(plan: Plan, feature: string): boolean {
  const p = normalizePlan(plan)
  if (p === 'enterprise') return true
  const features = PLAN_FEATURES[p] || []
  return features.includes('*') || features.includes(feature)
}

export function isPro(plan: Plan): boolean {
  const p = normalizePlan(plan)
  return p === 'feedback' || p === 'omnichannel' || p === 'everything' || p === 'pro' || p === 'enterprise' || p === 'trial'
}

export function clearPlanCache() {
  _cachedPlan = null
  _cacheTime = 0
}
