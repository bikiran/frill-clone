// The SMS billing policy for a company: one resolver every SMS path asks
// (lib/sms-quota, lib/sms-credits, lib/campaign-credits, lib/sms-provider's
// payForText and the Billing API). Server only (service-role client).
//
//   getSmsPolicy(db, companyId) → { mode, allowance, topupEnabled,
//     autoTopupAllowed, canTopUp, canAutoTopUp, entitled, blockReason,
//     source: { mode: 'company' | 'plan' | 'default', … } }
//
// Company override (company_sms_policy, V398), else the plan default
// (platform_settings 'sms_plan_policies'), else the code default, which is
// exactly how texting was paid for before policies existed. The rules live in
// lib/sms-policy-core.ts.
//
// Before V398 runs the company table is missing: it reads as "no override",
// so the plan defaults (and, with none saved, today's behaviour) apply.
//
// Caching: the plan defaults are platform-wide and change rarely, so they're
// kept for 30 seconds (saving them clears this instance's copy). A company's
// policy is read once per burst: checks made at the same moment (a quote and
// its allowance) share one read, and every new request reads it fresh, so a
// change by the super admin applies to the very next send.

import { companyHasFeature, effectivePlan, type Plan } from '@/lib/plan'
import { COLVY_CONTACT } from '@/lib/colvy-contact'
import { cleanPlanPolicies, resolvePolicy, type CompanyPolicyRow, type PlanPolicies, type SmsPolicy } from '@/lib/sms-policy-core'

export * from '@/lib/sms-policy-core'

const PLANS_TTL_MS = 30_000
let plansCache: { at: number; p: Promise<PlanPolicies> } | null = null
const inflight = new WeakMap<object, Map<string, Promise<SmsPolicy & { companyId: string }>>>()

const isMissing = (e: any) => /does not exist|schema cache|Could not find|PGRST20[45]|42P01/i.test(String(e?.message || e?.code || e || ''))

/** Forget the cached plan defaults (after the super admin saves them). */
export function clearSmsPolicyCache() { plansCache = null }

/** The plan defaults saved by the super admin (platform_settings 'sms_plan_policies'), checked. */
export async function readPlanPolicies(db: any, opts: { fresh?: boolean } = {}): Promise<PlanPolicies> {
  if (!opts.fresh && plansCache && Date.now() - plansCache.at < PLANS_TTL_MS) return plansCache.p
  const p = (async (): Promise<PlanPolicies> => {
    try {
      const { data, error } = await db.from('platform_settings').select('value').eq('key', 'sms_plan_policies').maybeSingle()
      if (error) return {}
      return cleanPlanPolicies(data?.value)
    } catch { return {} }
  })()
  plansCache = { at: Date.now(), p }
  return p
}

/** The company's own override row, or null; ready:false before V398. */
export async function readCompanyPolicy(db: any, companyId: string): Promise<{ ready: boolean; row: CompanyPolicyRow | null }> {
  try {
    const { data, error } = await db.from('company_sms_policy').select('*').eq('company_id', companyId).maybeSingle()
    if (error) return { ready: !isMissing(error), row: null }
    return { ready: true, row: data || null }
  } catch (e) { return { ready: !isMissing(e), row: null } }
}

async function readPlanAndEntitlement(db: any, companyId: string): Promise<{ plan: Plan; entitlementLimit: any }> {
  let plan: Plan = 'free'
  let entitlementLimit: any = undefined
  try {
    const { data } = await db.from('companies').select('plan, trial_ends_at').eq('id', companyId).maybeSingle()
    plan = effectivePlan(data?.plan, data?.trial_ends_at)
  } catch {}
  try {
    const { data } = await db.from('company_entitlements').select('*').eq('company_id', companyId).maybeSingle()
    const v = data?.limits?.smsPerMonth
    if (v !== undefined && v !== null && v !== '') entitlementLimit = v
  } catch {}
  return { plan, entitlementLimit }
}

/** The effective SMS billing policy for a company. Never throws. */
export async function getSmsPolicy(db: any, companyId: string, opts: { fresh?: boolean } = {}): Promise<SmsPolicy & { companyId: string }> {
  const key = db && typeof db === 'object' ? db : inflight
  let m = inflight.get(key)
  if (!m) { m = new Map(); inflight.set(key, m) }
  const hit = m.get(companyId)
  if (!opts.fresh && hit) return hit
  const p = (async () => {
    const [{ plan, entitlementLimit }, planPolicies, own] = await Promise.all([
      readPlanAndEntitlement(db, companyId),
      readPlanPolicies(db, opts),
      readCompanyPolicy(db, companyId),
    ])
    const channels = await companyHasFeature(db, companyId, 'channels', plan).catch(() => false)
    return { companyId, ...resolvePolicy({ plan, channels, entitlementLimit, planPolicies, company: own.row, tableReady: own.ready }) }
  })()
  m.set(companyId, p)
  const done = () => { if (m!.get(companyId) === p) m!.delete(companyId) }
  p.then(done, done)
  return p
}

/** The words for a blocked send, as the composer, campaigns and Billing show them. */
export function blockedText(reason: 'plan' | 'sms_disabled' | null | undefined): string {
  if (reason === 'sms_disabled') return 'Texting is switched off for your account. Contact Colvy to turn it back on.'
  return 'SMS is not included in this plan. Upgrade to the Inbox or Everything plan to send text messages.'
}

/** Why this company can't buy credit itself (or auto top-up), else null. */
export function topUpRefusal(policy: SmsPolicy, wantsAuto: boolean): string | null {
  if (!policy.entitled) return policy.blockReason === 'sms_disabled' ? 'Texting is switched off for your account, so SMS credit can’t be bought. Contact Colvy to turn it back on.' : 'SMS isn’t included in your plan, so SMS credit can’t be bought.'
  if (policy.mode === 'unlimited') return 'Your plan includes unlimited texts, so you don’t need SMS credit.'
  if (!policy.chargesCredit) return 'Your plan includes a monthly SMS allowance without SMS credit, so credit can’t be bought. Contact Colvy to change this.'
  if (!policy.canTopUp) return `Top-ups are managed by Colvy for your account. Contact us at ${COLVY_CONTACT.email} or ${COLVY_CONTACT.phoneDisplay} to add credit.`
  if (wantsAuto && !policy.canAutoTopUp) return `Auto top-up isn’t available for your account. Top up without it, or contact us at ${COLVY_CONTACT.email}.`
  return null
}
