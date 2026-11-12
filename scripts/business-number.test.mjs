// Runnable tests for the Business number plan: the plan itself (lib/plan),
// forwarded-minute counting (lib/forwarding-usage), the monthly charge for
// minutes past the allowance (lib/forwarding-overage), the included number
// (lib/business-number-plan), checkout readiness (lib/billing-config) and the
// pricing page's plan finder (lib/plan-finder).
//
//   npx tsx scripts/business-number.test.mjs
//
// Zero-dependency (same pattern as scripts/shopify-sms-billing.test.mjs): a
// small fake Supabase client stands in for the database and a fake for Stripe.
// Made-up businesses only. Exits non-zero if any check fails.

process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'http://127.0.0.1:1'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= 'anon'
globalThis.fetch = async () => { throw new Error('network disabled in tests') }

let failures = 0
const ok = (cond, name, extra) => { if (cond) console.log('  ok  ', name); else { failures++; console.log('  FAIL', name, extra === undefined ? '' : JSON.stringify(extra)) } }

// ── A tiny fake Supabase client ──────────────────────────────────────────────
// Tables are arrays of rows; `unique` names a table's unique key (insert of a
// duplicate fails like Postgres does).
function fakeDb(tables, unique = { platform_settings: 'key' }) {
  const from = (table) => {
    const q = { filters: [], op: 'select', patch: null, single: false, count: false, head: false, range: null }
    const list = () => (tables[table] ||= [])
    const rows = () => list().filter(r => q.filters.every(f => f(r)))
    const run = () => {
      if (q.op === 'insert') {
        const k = unique[table]
        if (k && list().some(r => r[k] === q.patch[k])) return { data: null, error: { code: '23505', message: 'duplicate key' } }
        list().push({ ...q.patch }); return { data: null, error: null }
      }
      if (q.op === 'update') { const hit = rows(); hit.forEach(r => Object.assign(r, q.patch)); return { data: q.single ? (hit[0] || null) : hit, error: null } }
      if (q.op === 'upsert') {
        const k = q.conflict; const ex = list().find(r => r[k] === q.patch[k])
        if (ex) Object.assign(ex, q.patch); else list().push({ ...q.patch })
        return { data: null, error: null }
      }
      if (q.op === 'delete') { const hit = rows(); tables[table] = list().filter(r => !hit.includes(r)); return { data: hit, error: null } }
      let r = rows()
      if (q.range) r = r.slice(q.range[0], q.range[1] + 1)
      if (q.head) return { data: null, count: r.length, error: null }
      return { data: q.single ? (r[0] || null) : r, count: q.count ? r.length : null, error: null }
    }
    const chain = {
      select: (_c, o) => { if (o?.count) q.count = true; if (o?.head) q.head = true; return chain },
      eq: (k, v) => { q.filters.push(r => r[k] === v); return chain },
      neq: (k, v) => { q.filters.push(r => r[k] !== v); return chain },
      gt: (k, v) => { q.filters.push(r => r[k] != null && r[k] > v); return chain },
      gte: (k, v) => { q.filters.push(r => r[k] != null && r[k] >= v); return chain },
      lt: (k, v) => { q.filters.push(r => r[k] != null && r[k] < v); return chain },
      in: (k, vs) => { q.filters.push(r => vs.includes(r[k])); return chain },
      order: () => chain, limit: () => chain,
      range: (a, b) => { q.range = [a, b]; return chain },
      insert: (patch) => { q.op = 'insert'; q.patch = patch; return chain },
      update: (patch) => { q.op = 'update'; q.patch = patch; return chain },
      upsert: (patch, o) => { q.op = 'upsert'; q.patch = patch; q.conflict = o?.onConflict || 'id'; return chain },
      delete: () => { q.op = 'delete'; return chain },
      maybeSingle: () => { q.single = true; return Promise.resolve(run()) },
      single: () => { q.single = true; return Promise.resolve(run()) },
      then: (res, rej) => Promise.resolve(run()).then(res, rej),
    }
    return chain
  }
  return { from, tables }
}

const plan = await import('../lib/plan.ts')
const usage = await import('../lib/forwarding-usage.ts')
const overage = await import('../lib/forwarding-overage.ts')
const included = await import('../lib/business-number-plan.ts')
const billing = await import('../lib/billing-config.ts')
const finder = await import('../lib/plan-finder.ts')
const smsPolicy = await import('../lib/sms-policy-core.ts')

console.log('The plan')
{
  ok(plan.normalizePlan('phone') === 'phone' && plan.normalizePlan('business_number') === 'phone', 'stored as phone')
  ok(plan.canAccess('phone', 'channels') && plan.canAccess('phone', 'feedbackSuite'), 'calls (channels) and Free’s feedback tools')
  ok(!plan.canAccess('phone', 'inbox') && !plan.canAccess('phone', 'aiAgents') && !plan.canAccess('phone', 'campaigns'), 'no live chat inbox, AI agents or campaigns')
  ok(plan.PLAN_LIMITS.phone.forwardMinutes === 100 && plan.PLAN_LIMITS.phone.teamMembers === 3 && plan.PLAN_LIMITS.phone.smsPerMonth === 50, '100 forwarded minutes, 3 people, 50 texts')
  ok(plan.PLAN_LIMITS.phone.polls >= plan.PLAN_LIMITS.free.polls && plan.PLAN_LIMITS.phone.helpArticles >= plan.PLAN_LIMITS.free.helpArticles, 'never less than Free')
  ok(plan.PLAN_LIMITS.omnichannel.forwardMinutes === Infinity && plan.PLAN_LIMITS.everything.forwardMinutes === Infinity, 'Inbox and Everything aren’t metered')
  ok(plan.PLAN_PRICES.phone === 35 && plan.PLAN_NAMES.phone === 'Business number', 'A$35, named Business number')
  ok(smsPolicy.isPolicyPlan('phone'), 'texting isn’t switched off for the plan')
  const d = smsPolicy.codeDefault('phone')
  ok(d.mode === 'allowance_then_credit' && d.allowance === 50, '50 texts a month, then SMS credit')
}

console.log('Checkout')
{
  const env = { STRIPE_SECRET_KEY: 'sk_test_made_up' }
  ok(billing.isKnownTier('phone'), 'a known checkout tier')
  ok(billing.checkoutBlockers('phone', 'monthly', env).length === 0, 'sells without a Stripe price (inline A$35)')
  ok(billing.INLINE_PLAN_PRICES.phone.cents === plan.PLAN_PRICES.phone * 100, 'the inline price matches the plan price')
  ok(billing.checkoutBlockers('phone', 'monthly', { ...env, STRIPE_PHONE_MONTHLY_PRICE_ID: 'prod_wrong' }).includes('STRIPE_PHONE_MONTHLY_PRICE_ID'), 'a wrong price ID still blocks')
  ok(billing.checkoutBlockers('phone', 'monthly', {}).includes('STRIPE_SECRET_KEY'), 'no Stripe key blocks')
  ok(billing.checkoutBlockers('feedback', 'monthly', env).includes('STRIPE_FEEDBACK_MONTHLY_PRICE_ID'), 'other plans still need their price')
  ok(billing.monthlyOnly('phone') && !billing.monthlyOnly('omnichannel'), 'monthly only')
  const st = billing.billingConfigStatus(env)
  const row = st.checks.find(c => c.envVar === 'STRIPE_PHONE_MONTHLY_PRICE_ID')
  ok(row && row.state === 'warn' && row.required === false, 'super admin shows its price as optional', row)
}

console.log('Plan finder')
{
  const base = { channels: [], extras: [], texts: 0, brand: 'colvy', team: 1 }
  ok(finder.recommendPlan({ ...base, channels: ['calls'] }).plan === 'phone', 'only phone calls → Business number')
  ok(finder.recommendPlan({ ...base, channels: ['calls', 'sms'] }).plan === 'omnichannel', 'calls and SMS → Inbox')
  ok(finder.recommendPlan({ ...base, channels: ['calls'], team: 5 }).plan === 'omnichannel', 'more than 3 people → Inbox')
  ok(finder.recommendPlan({ ...base, channels: ['calls'], extras: ['bookings'] }).plan === 'omnichannel', 'calls and bookings → Inbox')
  ok(finder.recommendPlan({ ...base, channels: ['calls'], brand: 'mine' }).plan !== 'phone', 'own branding → not Business number')
}

console.log('Counting forwarded minutes')
{
  ok(usage.billableMinutes(0) === 0 && usage.billableMinutes(1) === 1 && usage.billableMinutes(60) === 1 && usage.billableMinutes(61) === 2, 'each call rounds up to the minute')
  ok(usage.previousPeriod('2026-01') === '2025-12' && usage.previousPeriod('2026-11') === '2026-10', 'the month before')
  const b = usage.periodBounds('2026-12')
  ok(b.from === '2026-12-01T00:00:00.000Z' && b.to === '2027-01-01T00:00:00.000Z', 'December runs into the new year')
  ok(usage.cleanAllowance(null) === Infinity && usage.cleanAllowance('100') === 100 && usage.cleanAllowance(-3) === Infinity, 'allowances cleaned')
  const o = usage.overage(130, 100, 20)
  ok(o.over === 30 && o.cents === 600, '30 extra minutes at 20c = A$6', o)
  ok(usage.overage(500, Infinity).cents === 0, 'nothing on an unmetered plan')
  const db = fakeDb({ calls: [
    { company_id: 'co1', created_at: '2026-10-03T01:00:00.000Z', forwarded_seconds: 125 },   // 3
    { company_id: 'co1', created_at: '2026-10-20T01:00:00.000Z', forwarded_seconds: 60 },    // 1
    { company_id: 'co1', created_at: '2026-10-20T02:00:00.000Z', forwarded_seconds: 0 },     // not forwarded
    { company_id: 'co1', created_at: '2026-11-01T00:00:00.000Z', forwarded_seconds: 600 },   // next month
    { company_id: 'co2', created_at: '2026-10-05T01:00:00.000Z', forwarded_seconds: 600 },   // another business
  ] })
  const m = await usage.forwardedMinutes(db, 'co1', '2026-10')
  ok(m.minutes === 4 && m.calls === 2, 'only this business’s forwarded calls in that month', m)
}

console.log('Counting calls made from Colvy')
{
  ok(usage.APP_CALLS_COUNTED_FROM === '2026-11-13T00:00:00.000Z', 'calls from Colvy count from 13 Nov 2026')
  const db = fakeDb({ calls: [
    { company_id: 'co1', direction: 'outbound', created_at: '2026-12-02T01:00:00.000Z', duration_seconds: 125 },  // 3
    { company_id: 'co1', direction: 'outbound', created_at: '2026-12-09T01:00:00.000Z', duration_seconds: 30 },   // 1
    { company_id: 'co1', direction: 'outbound', created_at: '2026-12-09T02:00:00.000Z', duration_seconds: 0 },    // not answered
    { company_id: 'co1', direction: 'inbound', created_at: '2026-12-10T01:00:00.000Z', duration_seconds: 900 },   // answered in the app: not counted
    { company_id: 'co1', direction: 'inbound', created_at: '2026-12-11T01:00:00.000Z', forwarded_seconds: 240 },  // forwarded: 4
    { company_id: 'co2', direction: 'outbound', created_at: '2026-12-02T01:00:00.000Z', duration_seconds: 600 },  // another business
    { company_id: 'co1', direction: 'outbound', created_at: '2026-11-05T01:00:00.000Z', duration_seconds: 600 },  // before the change
    { company_id: 'co1', direction: 'outbound', created_at: '2026-11-20T01:00:00.000Z', duration_seconds: 120 },  // after it: 2
  ] })
  const dec = await usage.outboundMinutes(db, 'co1', '2026-12')
  ok(dec.minutes === 4 && dec.calls === 2, 'outbound calls this business made that month, rounded up', dec)
  const nov = await usage.outboundMinutes(db, 'co1', '2026-11')
  ok(nov.minutes === 2 && nov.calls === 1, 'November counts only calls from 13 Nov on', nov)
  ok((await usage.outboundMinutes(db, 'co1', '2026-10')).minutes === 0, 'months before the change count none')
  const u = await usage.forwardingUsage(db, 'co1', 5, '2026-12')
  ok(u.minutes === 8 && u.forwardedMinutes === 4 && u.appMinutes === 4 && u.over === 3 && u.overCents === 60, 'forwarded and app minutes share the allowance', u)
  const open = await usage.forwardingUsage(db, 'co1', Infinity, '2026-12')
  ok(open.appMinutes === 0 && open.minutes === 4 && open.overCents === 0, 'unmetered plans don’t count calls from Colvy', open)
}

console.log('Charging minutes past the allowance')
{
  const many = (companyId, month, minutes) => Array.from({ length: minutes }, (_, i) => ({ company_id: companyId, created_at: `${month}-0${1 + (i % 9)}T03:00:00.000Z`, forwarded_seconds: 60 }))
  const tables = () => ({
    companies: [
      { id: 'coA', name: 'Brightline Electrical', plan: 'phone', owner_id: 'uA' },
      { id: 'coB', name: 'Harbour Flowers', plan: 'phone', owner_id: 'uB' },
      { id: 'coC', name: 'Gumtree Gardening', plan: 'omnichannel', owner_id: 'uC' },
    ],
    subscriptions: [
      { user_id: 'uA', stripe_customer_id: 'cus_A', stripe_subscription_id: 'sub_A', status: 'active' },
      { user_id: 'uB', stripe_customer_id: 'cus_B', stripe_subscription_id: 'sub_B', status: 'active' },
    ],
    calls: [...many('coA', '2026-10', 130), ...many('coB', '2026-10', 40), ...many('coC', '2026-10', 900)],
    platform_settings: [],
  })
  const limitOf = async (_db, id) => (id === 'coC' ? Infinity : 100)
  const stripeFake = () => { const s = { made: [], invoiceItems: { create: async (p, o) => { s.made.push({ p, o }); return { id: `ii_${s.made.length}` } } } }; return s }
  const alerts = []
  const alert = async (_db, a) => { alerts.push(a) }

  const db = fakeDb(tables())
  const stripe = stripeFake()
  const r = await overage.chargeForwardingOverage(db, '2026-10', { stripe, alert, limitOf })
  ok(r.considered === 2, 'only Business number businesses are looked at', r)
  ok(stripe.made.length === 1 && r.charged.length === 1, 'one charge: the business over its allowance', r)
  const c = stripe.made[0]
  ok(c?.p.customer === 'cus_A' && c.p.subscription === 'sub_A' && c.p.amount === 600 && c.p.currency === 'aud', '30 minutes × 20c = A$6, on its plan subscription', c?.p)
  ok(c?.o.idempotencyKey === 'fwd-overage:coA:2026-10', 'one Stripe idempotency key per business per month')
  ok(/October 2026: 30 past the 100 included, at 20c a minute/.test(c?.p.description || ''), 'says what the charge is', c?.p.description)
  const recA = db.tables.platform_settings.find(x => x.key === 'fwd-overage:coA:2026-10')
  const recB = db.tables.platform_settings.find(x => x.key === 'fwd-overage:coB:2026-10')
  ok(recA?.value.state === 'charged' && recA.value.invoiceItem === 'ii_1', 'the charge is recorded')
  ok(recB?.value.state === 'nothing', 'a month within the allowance is recorded as nothing to charge')
  ok(alerts.length === 0, 'no alert when everything went through')

  const again = await overage.chargeForwardingOverage(db, '2026-10', { stripe, alert, limitOf })
  ok(stripe.made.length === 1 && again.charged.length === 0, 'running again the next day charges nothing more')

  // Stripe refuses: nothing recorded, so it's tried again tomorrow, and the team is told.
  const db2 = fakeDb(tables())
  const refusing = { invoiceItems: { create: async () => { throw new Error('No such customer') } } }
  const alerts2 = []
  const r2 = await overage.chargeForwardingOverage(db2, '2026-10', { stripe: refusing, alert: async (_d, a) => { alerts2.push(a) }, limitOf })
  ok(r2.failed.length === 1 && !db2.tables.platform_settings.some(x => x.key === 'fwd-overage:coA:2026-10'), 'a refused charge is left to try again')
  ok(alerts2.length === 1 && /Brightline Electrical/.test(alerts2[0].message), 'the Colvy team is told who', alerts2[0]?.message)

  // No Stripe at all: owed, not recorded.
  const db3 = fakeDb(tables())
  const alerts3 = []
  const r3 = await overage.chargeForwardingOverage(db3, '2026-10', { stripe: null, alert: async (_d, a) => { alerts3.push(a) }, limitOf })
  ok(r3.owed.length === 1 && /A\$6\.00/.test(r3.owed[0]) && /STRIPE_SECRET_KEY/.test(alerts3[0]?.message || ''), 'without Stripe it’s listed as owed', r3)

  // A claim left half-way is never charged twice.
  const db4 = fakeDb({ ...tables(), platform_settings: [{ key: 'fwd-overage:coA:2026-10', value: { state: 'charging' } }] })
  const s4 = stripeFake()
  const r4 = await overage.chargeForwardingOverage(db4, '2026-10', { stripe: s4, alert: async () => {}, limitOf })
  ok(s4.made.length === 0 && r4.failed.length === 1, 'a half-done charge is flagged, not repeated')
}

console.log('The included number')
{
  const db = fakeDb({ companies: [{ id: 'co1', name: 'Brightline Electrical', free_number_credits: 0 }], phone_numbers: [], platform_settings: [] })
  ok(await included.grantIncludedNumber(db, 'co1') === 'granted', 'the plan starts: one free number')
  ok(db.tables.companies[0].free_number_credits === 1, 'as a free number credit')
  ok(await included.grantIncludedNumber(db, 'co1') === 'already', 'only once per plan start')
  ok(db.tables.companies[0].free_number_credits === 1, 'still one')
  ok(await included.endIncludedNumber(db, 'co1') === 'revoked' && db.tables.companies[0].free_number_credits === 0, 'cancelled before using it: taken back')

  const withNumber = fakeDb({ companies: [{ id: 'co2', free_number_credits: 0 }], phone_numbers: [{ company_id: 'co2', phone_number: '+61390000001', status: 'active' }], platform_settings: [] })
  ok(await included.grantIncludedNumber(withNumber, 'co2') === 'has_number' && withNumber.tables.companies[0].free_number_credits === 0, 'a business that already has a number keeps it, no extra credit')

  // Used, then cancelled: the number stays live and the Colvy team is told.
  const used = fakeDb({ companies: [{ id: 'co3', name: 'Harbour Flowers', free_number_credits: 0 }], phone_numbers: [], platform_settings: [], notifications: [] })
  await included.grantIncludedNumber(used, 'co3')
  used.tables.companies[0].free_number_credits = 0 // spent by number-finalize
  used.tables.phone_numbers.push({ company_id: 'co3', phone_number: '+61390000002', status: 'active', provisioned_by_colvy: true, monthly_cost: 0, created_at: new Date(Date.now() + 1000).toISOString() })
  ok(await included.endIncludedNumber(used, 'co3') === 'flagged', 'a number bought with it is flagged, never released by itself')
  ok(used.tables.phone_numbers[0].status === 'active', 'the number keeps working')
}

console.log(failures ? `\n${failures} failed` : '\nall passed')
process.exit(failures ? 1 : 0)
