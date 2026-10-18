import { NextRequest, NextResponse } from 'next/server'
import { adminDb, superAdmin } from '../_lib/super-admin'
import { logSuperAdminAudit } from '@/lib/super-admin-audit'
import { getWallet } from '@/lib/sms-credits'
import { effectivePlan, PLAN_NAMES } from '@/lib/plan'
import { resolveSmsPricing } from '@/lib/sms-pricing'
import {
  getSmsPolicy, readPlanPolicies, readCompanyPolicy, clearSmsPolicyCache,
  cleanFields, cleanPlanPolicies, defaultPlanPolicies, planChangePreview, resolvePolicy,
  POLICY_PLANS, SMS_MODE_LABEL, allowanceWords, isPolicyPlan, type PlanPolicies, type PolicyFields, type PolicyPlan,
} from '@/lib/sms-policy'

export const dynamic = 'force-dynamic'

// Super admin → SMS billing policies (lib/sms-policy).
//   GET                    every plan's policy (saved and effective), how many
//                          companies are on each plan, and how many of those
//                          have their own override.
//   GET ?companyId=        one company: its effective policy and where each
//                          value comes from, its override row, wallet and rate.
//   POST { plans }                              save the plan defaults
//   POST { companyId, override, note }          save a company's override
//   POST { companyId, reset: true }             back to the plan defaults
// Every change is written to the audit log. Plan defaults live in
// platform_settings ('sms_plan_policies'); overrides in company_sms_policy
// (V398, which this answers 409 for until it's run).

const isUuid = (v: any) => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v)
const isMissing = (e: any) => /does not exist|schema cache|Could not find|42P01|PGRST20[45]/i.test(String(e?.message || e?.code || e || ''))
const V398 = 'Run migrations/COLVY_V398_SMS_BILLING_POLICY.sql first: company overrides need its table.'

const hasOverride = (r: any) => r && (r.sms_mode != null || r.monthly_allowance != null || r.topup_enabled != null || r.auto_topup_allowed != null)

/** Companies per plan, and how many of them have their own SMS override. */
async function planCounts(db: any): Promise<{ counts: Record<string, { companies: number; overridden: number }>; tableReady: boolean }> {
  const counts: Record<string, { companies: number; overridden: number }> = {}
  for (const p of POLICY_PLANS) counts[p] = { companies: 0, overridden: 0 }
  const plans = new Map<string, string>()
  for (let from = 0; from < 50000; from += 1000) {
    const { data, error } = await db.from('companies').select('id, plan, trial_ends_at').order('id', { ascending: true }).range(from, from + 999)
    if (error) break
    for (const c of data || []) plans.set(c.id, effectivePlan(c.plan, c.trial_ends_at))
    if (!data || data.length < 1000) break
  }
  for (const p of plans.values()) if (counts[p]) counts[p].companies++
  const overridden = new Set<string>()
  let tableReady = true
  try {
    const { data, error } = await db.from('company_sms_policy').select('*').limit(10000)
    if (error) tableReady = !isMissing(error)
    for (const r of data || []) if (hasOverride(r)) overridden.add(r.company_id)
  } catch (e) { tableReady = !isMissing(e) }
  try {
    const { data } = await db.from('company_entitlements').select('company_id, limits').limit(10000)
    for (const r of data || []) {
      const v = r?.limits?.smsPerMonth
      if (v !== undefined && v !== null && v !== '') overridden.add(r.company_id)
    }
  } catch {}
  for (const id of overridden) { const p = plans.get(id); if (p && counts[p]) counts[p].overridden++ }
  return { counts, tableReady }
}

function planRows(saved: PlanPolicies) {
  const defaults = defaultPlanPolicies()
  return POLICY_PLANS.map(plan => {
    const lvl = resolvePolicy({ plan, channels: true, planPolicies: saved }).planLevel
    return { plan, name: PLAN_NAMES[plan], saved: saved[plan] || null, codeDefault: defaults[plan], effective: lvl }
  })
}

export async function GET(req: NextRequest) {
  const db = adminDb()
  if (!(await superAdmin(req, db))) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  try {
    const companyId = req.nextUrl.searchParams.get('companyId')
    if (companyId) {
      if (!isUuid(companyId)) return NextResponse.json({ error: 'companyId required' }, { status: 400 })
      const [policy, wallet, pricing, own, co, rateRow] = await Promise.all([
        getSmsPolicy(db, companyId, { fresh: true }),
        getWallet(db, companyId),
        resolveSmsPricing(db, companyId),
        readCompanyPolicy(db, companyId),
        db.from('companies').select('id, name, slug, plan, trial_ends_at').eq('id', companyId).maybeSingle().then((r: any) => r?.data || null, () => null),
        Promise.resolve(db.from('sms_pricing').select('company_id').eq('company_id', companyId).maybeSingle()).then((r: any) => r?.data || null, () => null),
      ])
      if (!co) return NextResponse.json({ error: 'Company not found' }, { status: 404 })
      return NextResponse.json({
        company: { id: co.id, name: co.name, slug: co.slug, plan: policy.plan, planName: PLAN_NAMES[policy.plan] },
        policy: { ...policy, allowance: policy.allowance === Infinity ? null : policy.allowance, planLevel: { ...policy.planLevel, allowance: policy.planLevel.allowance === Infinity ? null : policy.planLevel.allowance } },
        override: own.row, tableReady: own.ready,
        wallet: { ...wallet, stripeCustomerId: undefined },
        rate: { pricePerPart: pricing.price_per_part, ownRate: !!rateRow },
      })
    }
    const [saved, { counts, tableReady }] = await Promise.all([readPlanPolicies(db, { fresh: true }), planCounts(db)])
    return NextResponse.json({ plans: planRows(saved).map(r => ({ ...r, effective: { ...r.effective, allowance: r.effective.allowance === Infinity ? null : r.effective.allowance }, ...counts[r.plan] })), tableReady })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}

const describe = (f: PolicyFields) => [
  f.mode ? SMS_MODE_LABEL[f.mode] : 'mode inherited',
  f.monthly_allowance != null ? `${f.monthly_allowance.toLocaleString('en-AU')} texts a month` : null,
  f.topup_enabled != null ? (f.topup_enabled ? 'top-ups on' : 'top-ups managed by Colvy') : null,
  f.auto_topup_allowed != null ? (f.auto_topup_allowed ? 'auto top-up allowed' : 'no auto top-up') : null,
].filter(Boolean).join(', ')

export async function POST(req: NextRequest) {
  const db = adminDb()
  const me = await superAdmin(req, db)
  if (!me) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  try {
    const body = await req.json().catch(() => ({}))

    // ── Plan defaults ───────────────────────────────────────────────────────
    if (body.plans && typeof body.plans === 'object') {
      const before = await readPlanPolicies(db, { fresh: true })
      const incoming = cleanPlanPolicies(body.plans)
      const next: PlanPolicies = { ...before }
      for (const p of Object.keys(body.plans)) {
        if (!isPolicyPlan(p)) return NextResponse.json({ error: `Unknown plan: ${p}` }, { status: 400 })
        const raw = body.plans[p]
        if (raw?.mode != null && !incoming[p]?.mode) return NextResponse.json({ error: `Choose a valid mode for ${PLAN_NAMES[p]}.` }, { status: 400 })
        if (raw?.monthly_allowance != null && raw.monthly_allowance !== '' && incoming[p]?.monthly_allowance == null) return NextResponse.json({ error: `Enter a whole number of texts for ${PLAN_NAMES[p]}.` }, { status: 400 })
        next[p] = incoming[p] || {}
      }
      const { counts } = await planCounts(db)
      const changes: { plan: PolicyPlan; before: PolicyFields; after: PolicyFields; preview: string }[] = []
      for (const p of POLICY_PLANS) {
        const preview = planChangePreview({ plan: p, before: before[p] || {}, after: next[p] || {}, companies: counts[p].companies, overridden: counts[p].overridden })
        if (preview) changes.push({ plan: p, before: before[p] || {}, after: next[p] || {}, preview })
      }
      const { error } = await db.from('platform_settings').upsert({ key: 'sms_plan_policies', value: next, updated_by: me.email, updated_at: new Date().toISOString() }, { onConflict: 'key' })
      if (error) return NextResponse.json({ error: isMissing(error) ? 'The platform_settings table is missing.' : error.message }, { status: 500 })
      clearSmsPolicyCache()
      for (const c of changes) {
        await logSuperAdminAudit(db, {
          adminId: me.id, adminEmail: me.email, action: 'sms_plan_policy',
          summary: `SMS billing for the ${PLAN_NAMES[c.plan]} plan: ${describe(c.after) || 'Colvy default'}. ${c.preview}`,
          detail: { plan: c.plan, before: c.before, after: c.after, companies: counts[c.plan].companies, overridden: counts[c.plan].overridden },
        })
      }
      return NextResponse.json({ ok: true, changes: changes.map(c => ({ plan: c.plan, preview: c.preview })), plans: planRows(next) })
    }

    // ── One company ─────────────────────────────────────────────────────────
    const companyId = String(body.companyId || '')
    if (!isUuid(companyId)) return NextResponse.json({ error: 'Choose a company.' }, { status: 400 })
    const { data: co } = await db.from('companies').select('id, name').eq('id', companyId).maybeSingle()
    if (!co) return NextResponse.json({ error: 'Company not found' }, { status: 404 })
    const own = await readCompanyPolicy(db, companyId)
    if (!own.ready) return NextResponse.json({ error: V398, missing: true }, { status: 409 })
    const before = await getSmsPolicy(db, companyId, { fresh: true })

    if (body.reset) {
      const { error } = await db.from('company_sms_policy').delete().eq('company_id', companyId)
      if (error) return NextResponse.json({ error: isMissing(error) ? V398 : error.message }, { status: isMissing(error) ? 409 : 500 })
      const after = await getSmsPolicy(db, companyId, { fresh: true })
      await logSuperAdminAudit(db, {
        adminId: me.id, adminEmail: me.email, companyId, action: 'sms_company_policy_reset',
        summary: `SMS billing for ${co.name || companyId} reset to the ${PLAN_NAMES[after.plan]} plan: ${SMS_MODE_LABEL[after.mode]}, ${allowanceWords(after.mode, after.allowance)}`,
        detail: { before: own.row, mode: after.mode },
      })
      return NextResponse.json({ ok: true, override: null })
    }

    const raw = body.override || {}
    const f = cleanFields(raw)
    if (raw.mode != null && raw.mode !== '' && !f.mode) return NextResponse.json({ error: 'Choose a valid mode.' }, { status: 400 })
    if (raw.monthly_allowance != null && raw.monthly_allowance !== '' && f.monthly_allowance == null) return NextResponse.json({ error: 'Enter a whole number of texts a month.' }, { status: 400 })
    const note = String(body.note ?? '').trim().slice(0, 500)
    const row = {
      company_id: companyId, sms_mode: f.mode ?? null, monthly_allowance: f.monthly_allowance ?? null,
      topup_enabled: f.topup_enabled ?? null, auto_topup_allowed: f.auto_topup_allowed ?? null,
      note: note || null, updated_by: me.email, updated_at: new Date().toISOString(),
    }
    const { error } = await db.from('company_sms_policy').upsert(row, { onConflict: 'company_id' })
    if (error) return NextResponse.json({ error: isMissing(error) ? V398 : error.message }, { status: isMissing(error) ? 409 : 500 })
    const after = await getSmsPolicy(db, companyId, { fresh: true })
    await logSuperAdminAudit(db, {
      adminId: me.id, adminEmail: me.email, companyId, action: 'sms_company_policy',
      summary: `SMS billing for ${co.name || companyId}: ${describe(f) || 'all from the plan'} (now ${SMS_MODE_LABEL[after.mode]}, ${allowanceWords(after.mode, after.allowance)})${note ? `. Note: ${note}` : ''}`,
      detail: { before: own.row, after: row, effective: { mode: after.mode, allowance: after.allowance === Infinity ? null : after.allowance, canTopUp: after.canTopUp, canAutoTopUp: after.canAutoTopUp }, was: { mode: before.mode } },
    })
    return NextResponse.json({ ok: true, override: row })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}
