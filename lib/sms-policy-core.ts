// SMS billing policy: the pure parts (no database), shared by the server
// resolver (lib/sms-policy.ts), the super admin screens and the tests. Safe to
// import in the browser.
//
// How a company pays for texts is decided per field, most specific first:
//
//   1. the company's own override (company_sms_policy, V398; a null field
//      means "inherit"). A super admin's older company_entitlements override
//      of smsPerMonth still counts here, under the new table;
//   2. the plan's default (platform_settings key 'sms_plan_policies');
//   3. the code default, which is exactly how sending worked before plan
//      policies existed: Enterprise unlimited, Inbox / Everything / trial /
//      pro 3,000 a month then prepaid credit, Free and Feedback no SMS.
//
// Modes:
//   unlimited              free, never charged, the wallet is skipped
//   allowance_then_credit  the monthly allowance first, then prepaid credit
//   credit_only            no free allowance: every text uses credit
//   allowance_only         the allowance, then blocked (never charged)
//   disabled               no SMS sending at all

import { PLAN_LIMITS, PLAN_NAMES, normalizePlan, type Plan } from '@/lib/plan'
import { normaliseLimit } from '@/lib/sms-credits-core'

export const SMS_MODES = ['unlimited', 'allowance_then_credit', 'credit_only', 'allowance_only', 'disabled'] as const
export type SmsMode = typeof SMS_MODES[number]
export const isSmsMode = (v: any): v is SmsMode => (SMS_MODES as readonly string[]).includes(v)

export const SMS_MODE_LABEL: Record<SmsMode, string> = {
  unlimited: 'Unlimited (free)',
  allowance_then_credit: 'Allowance, then credit',
  credit_only: 'Credit only',
  allowance_only: 'Allowance only',
  disabled: 'No SMS',
}
export const SMS_MODE_HINT: Record<SmsMode, string> = {
  unlimited: 'Texts are free and never use credit.',
  allowance_then_credit: 'The monthly allowance is free; texts beyond it use prepaid credit.',
  credit_only: 'No free allowance: every text uses prepaid credit.',
  allowance_only: 'The monthly allowance is free; beyond it texts stop until next month.',
  disabled: 'SMS sending is switched off.',
}

/** The plans a super admin sets a policy for (suspended always sends nothing). */
export const POLICY_PLANS = ['free', 'feedback', 'omnichannel', 'everything', 'trial', 'pro', 'enterprise'] as const
export type PolicyPlan = typeof POLICY_PLANS[number]
export const isPolicyPlan = (p: any): p is PolicyPlan => (POLICY_PLANS as readonly string[]).includes(p)

/** Used when a mode with an allowance has none set and the plan has no finite one (Enterprise). */
export const DEFAULT_SMS_ALLOWANCE = 3000
/** Biggest monthly allowance a super admin can type. */
export const MAX_SMS_ALLOWANCE = 10_000_000

/** One level's settings. Every field is optional: absent / null = inherit. */
export type PolicyFields = {
  mode?: SmsMode | null
  monthly_allowance?: number | null
  topup_enabled?: boolean | null
  auto_topup_allowed?: boolean | null
}
export type PlanPolicies = Partial<Record<PolicyPlan, PolicyFields>>

/** A company_sms_policy row (V398). */
export type CompanyPolicyRow = {
  company_id?: string
  sms_mode?: SmsMode | null
  monthly_allowance?: number | null
  topup_enabled?: boolean | null
  auto_topup_allowed?: boolean | null
  note?: string | null
  updated_by?: string | null
  updated_at?: string | null
}

export type PolicySource = 'company' | 'plan' | 'default'
export type BlockReason = 'plan' | 'sms_disabled'

export type SmsPolicy = {
  plan: Plan
  mode: SmsMode
  /** Free parts a month: Infinity when unlimited, 0 for credit_only / disabled. */
  allowance: number
  /** The setting as stored (shown in the super admin, used by allowance modes). */
  topupEnabled: boolean
  autoTopupAllowed: boolean
  /** Texts beyond the allowance are paid from credit (allowance_then_credit, credit_only). */
  chargesCredit: boolean
  /** The business may buy credit itself on the Billing page. */
  canTopUp: boolean
  /** …and may switch auto top-up on (never without canTopUp). */
  canAutoTopUp: boolean
  /** Any SMS at all. */
  entitled: boolean
  /** Why nothing can be sent: 'plan' (not on the plan, as before) or 'sms_disabled' (switched off by Colvy). */
  blockReason: BlockReason | null
  source: { mode: PolicySource; allowance: PolicySource; topupEnabled: PolicySource; autoTopupAllowed: PolicySource }
  /** What the plan level gives, before the company's own override (for "inherit" in the super admin). */
  planLevel: { mode: SmsMode; allowance: number; topupEnabled: boolean; autoTopupAllowed: boolean; source: { mode: PolicySource; allowance: PolicySource; topupEnabled: PolicySource; autoTopupAllowed: PolicySource } }
  override: CompanyPolicyRow | null
  /** company_sms_policy exists (V398 has run). */
  tableReady: boolean
}

/** The code default for a plan: today's behaviour, from lib/plan's limits. */
export function codeDefault(plan: Plan): { mode: SmsMode; allowance: number | null } {
  const limit = normaliseLimit(PLAN_LIMITS[plan]?.smsPerMonth)
  if (limit === Infinity) return { mode: 'unlimited', allowance: null }
  if (limit > 0) return { mode: 'allowance_then_credit', allowance: limit }
  return { mode: 'disabled', allowance: null }
}

/** The code defaults for every plan, in the platform_settings shape. */
export function defaultPlanPolicies(): Record<PolicyPlan, Required<PolicyFields>> {
  const out: any = {}
  for (const p of POLICY_PLANS) {
    const d = codeDefault(p)
    out[p] = { mode: d.mode, monthly_allowance: d.allowance, topup_enabled: true, auto_topup_allowed: true }
  }
  return out
}

const cleanAllowance = (v: any): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? Math.min(MAX_SMS_ALLOWANCE, Math.floor(n)) : null
}
const cleanBool = (v: any): boolean | null => (v === true || v === false ? v : null)

/** One level's fields, checked (junk → inherit). */
export function cleanFields(raw: any): PolicyFields {
  if (!raw || typeof raw !== 'object') return {}
  return {
    mode: isSmsMode(raw.mode) ? raw.mode : isSmsMode(raw.sms_mode) ? raw.sms_mode : null,
    monthly_allowance: cleanAllowance(raw.monthly_allowance),
    topup_enabled: cleanBool(raw.topup_enabled),
    auto_topup_allowed: cleanBool(raw.auto_topup_allowed),
  }
}

/** platform_settings 'sms_plan_policies' value, checked: only known plans and fields. */
export function cleanPlanPolicies(raw: any): PlanPolicies {
  const out: PlanPolicies = {}
  if (!raw || typeof raw !== 'object') return out
  for (const p of POLICY_PLANS) if (raw[p]) out[p] = cleanFields(raw[p])
  return out
}

/** The allowance a mode actually gives. */
function allowanceFor(mode: SmsMode, configured: number | null, plan: Plan): number {
  if (mode === 'unlimited') return Infinity
  if (mode === 'credit_only' || mode === 'disabled') return 0
  if (configured != null) return configured
  const d = normaliseLimit(PLAN_LIMITS[plan]?.smsPerMonth)
  return Number.isFinite(d) && d > 0 ? d : DEFAULT_SMS_ALLOWANCE
}

/**
 * The effective policy.
 *   channels: the plan (with company_entitlements) includes SMS channels.
 *   entitlementLimit: a company_entitlements smsPerMonth override, when set.
 */
export function resolvePolicy(o: {
  plan: Plan | string | null | undefined
  channels: boolean
  entitlementLimit?: any
  planPolicies?: PlanPolicies | null
  company?: CompanyPolicyRow | null
  tableReady?: boolean
}): SmsPolicy {
  const plan = normalizePlan(o.plan as any)
  const def = codeDefault(plan)
  const pp: PolicyFields = isPolicyPlan(plan) ? (o.planPolicies?.[plan] || {}) : {}

  // ── Plan level: platform setting, else code default.
  const pick = <T,>(v: T | null | undefined, d: T): [T, PolicySource] => (v != null ? [v, 'plan'] : [d, 'default'])
  let [pMode, sMode] = pick<SmsMode>(pp.mode ?? null, def.mode)
  let [pAllow, sAllow] = pick<number | null>(pp.monthly_allowance ?? null, def.allowance)
  if (pp.monthly_allowance == null && pp.mode != null) sAllow = 'default'
  const [pTop, sTop] = pick<boolean>(pp.topup_enabled ?? null, true)
  const [pAuto, sAuto] = pick<boolean>(pp.auto_topup_allowed ?? null, true)
  // Suspended (no policy row) never sends.
  if (!isPolicyPlan(plan)) { pMode = 'disabled'; sMode = 'default' }
  const planLevel = {
    mode: pMode, allowance: allowanceFor(pMode, pAllow, plan), topupEnabled: pTop, autoTopupAllowed: pAuto,
    source: { mode: sMode, allowance: sAllow, topupEnabled: sTop, autoTopupAllowed: sAuto },
  }

  // ── Company level: the older entitlements override first, then V398's row.
  let mode = pMode, allowance = pAllow, topup = pTop, auto = pAuto
  const src = { mode: sMode, allowance: sAllow, topupEnabled: sTop, autoTopupAllowed: sAuto }
  let legacyDisabled = false
  if (o.entitlementLimit !== undefined && o.entitlementLimit !== null && o.entitlementLimit !== '') {
    const lim = normaliseLimit(o.entitlementLimit)
    if (lim === Infinity) { mode = 'unlimited'; src.mode = 'company' }
    else if (lim <= 0) { mode = 'disabled'; src.mode = 'company'; legacyDisabled = true }
    else {
      allowance = lim; src.allowance = 'company'
      if (mode === 'unlimited' || mode === 'disabled') { mode = 'allowance_then_credit'; src.mode = 'company' }
    }
  }
  const c = o.company ? cleanFields(o.company) : {}
  if (c.mode != null) { mode = c.mode; src.mode = 'company'; legacyDisabled = false }
  if (c.monthly_allowance != null) { allowance = c.monthly_allowance; src.allowance = 'company' }
  if (c.topup_enabled != null) { topup = c.topup_enabled; src.topupEnabled = 'company' }
  if (c.auto_topup_allowed != null) { auto = c.auto_topup_allowed; src.autoTopupAllowed = 'company' }

  // ── SMS channels are the prerequisite (Free / Feedback don't have them).
  let blockReason: BlockReason | null = null
  if (!o.channels) { mode = 'disabled'; blockReason = 'plan' }
  else if (mode === 'disabled') blockReason = src.mode === 'default' || legacyDisabled ? 'plan' : 'sms_disabled'

  // Unlimited / credit only / no SMS decide the allowance themselves.
  if (mode !== 'allowance_then_credit' && mode !== 'allowance_only') src.allowance = src.mode
  const chargesCredit = mode === 'allowance_then_credit' || mode === 'credit_only'
  const canTopUp = chargesCredit && topup
  return {
    plan, mode,
    allowance: allowanceFor(mode, allowance, plan),
    topupEnabled: topup, autoTopupAllowed: auto,
    chargesCredit, canTopUp, canAutoTopUp: canTopUp && auto,
    entitled: mode !== 'disabled', blockReason,
    source: src, planLevel,
    override: o.company || null,
    tableReady: o.tableReady !== false,
  }
}

/** "Unlimited", "3,000 texts a month", "No free allowance"… for a policy or a plan row. */
export function allowanceWords(mode: SmsMode, allowance: number): string {
  if (mode === 'unlimited') return 'Unlimited texts'
  if (mode === 'disabled') return 'No SMS'
  if (mode === 'credit_only') return 'No free allowance'
  return `${Number(allowance).toLocaleString('en-AU')} texts a month`
}

/** "from Enterprise plan" / "set for this company" / "Colvy default for Enterprise". */
export function sourceWords(s: PolicySource, plan: Plan): string {
  if (s === 'company') return 'set for this company'
  if (s === 'plan') return `from ${PLAN_NAMES[plan] || plan} plan`
  return `${PLAN_NAMES[plan] || plan} plan (Colvy default)`
}

/**
 * The line the super admin sees before saving a plan's policy: who it changes.
 *   'Enterprise: 3 companies will start using SMS credits beyond 3,000 texts/month (1 has its own override)'
 */
export function planChangePreview(o: {
  plan: PolicyPlan
  before: PolicyFields
  after: PolicyFields
  companies: number
  overridden: number
}): string | null {
  const plan = o.plan
  const name = PLAN_NAMES[plan] || plan
  const lvl = (f: PolicyFields) => resolvePolicy({ plan, channels: true, planPolicies: { [plan]: f } as PlanPolicies }).planLevel
  const a = lvl(o.before), b = lvl(o.after)
  const same = a.mode === b.mode && a.allowance === b.allowance && a.topupEnabled === b.topupEnabled && a.autoTopupAllowed === b.autoTopupAllowed
  if (same) return null
  const n = o.companies
  const who = `${n.toLocaleString('en-AU')} compan${n === 1 ? 'y' : 'ies'}`
  const ov = o.overridden ? ` (${o.overridden.toLocaleString('en-AU')} ${o.overridden === 1 ? 'has its' : 'have their'} own override)` : ''
  const allow = (x: number) => `${x.toLocaleString('en-AU')} texts/month`
  let what: string
  const charged = (m: SmsMode) => m === 'allowance_then_credit' || m === 'credit_only'
  if (b.mode === 'disabled') what = 'will stop sending SMS'
  else if (b.mode === 'unlimited') what = charged(a.mode) ? 'will stop being charged for SMS (unlimited texts)' : 'will get unlimited texts'
  else if (b.mode === 'credit_only') what = charged(a.mode) && a.mode === 'credit_only' ? 'will keep paying for every text from SMS credit' : 'will pay for every text from SMS credit (no free allowance)'
  else if (b.mode === 'allowance_then_credit') what = charged(a.mode) && a.allowance === b.allowance ? `will keep using SMS credits beyond ${allow(b.allowance)}` : charged(a.mode) ? `will use SMS credits beyond ${allow(b.allowance)}` : `will start using SMS credits beyond ${allow(b.allowance)}`
  else what = `will be limited to ${allow(b.allowance)}, with no SMS credits`
  const extras: string[] = []
  if (charged(b.mode)) {
    if (a.topupEnabled !== b.topupEnabled) extras.push(b.topupEnabled ? 'they can top up themselves' : 'top-ups are managed by Colvy')
    else if (!b.topupEnabled) extras.push('top-ups managed by Colvy')
    if (b.topupEnabled && a.autoTopupAllowed !== b.autoTopupAllowed) extras.push(b.autoTopupAllowed ? 'auto top-up allowed' : 'no auto top-up')
  }
  return `${name}: ${who} ${what}${extras.length ? `; ${extras.join(', ')}` : ''}${ov}`
}
