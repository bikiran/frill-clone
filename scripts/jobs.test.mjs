// Tests for Jobs & Services (Phase 1): quote maths and GST, status moves,
// settings, the module switch and the "jobs" permission. Zero dependencies,
// same harness as the other scripts here:
//
//   npx tsx scripts/jobs.test.mjs
//
// Exits non-zero when anything fails.

import { computeQuote, cleanLines, cleanDiscount, cleanDeposit, roundCents, inputToCents, fmtMoney, MAX_LINES } from '../lib/jobs/quote-math.ts'
import { canMoveJob, nextStatuses, JOB_STATUSES } from '../lib/jobs/status.ts'
import { resolveJobSettings, effectiveTaxRate } from '../lib/jobs/settings.ts'
import { jobsEnabled, moduleAllowsPage, readModules } from '../lib/modules.ts'
import { canUseFeature, featureForPath, ALL_FEATURE_KEYS } from '../lib/permissions.ts'
import { checkJobsAccess } from '../lib/jobs/access-core.ts'

let passed = 0, failed = 0
function ok(name, cond) {
  if (cond) { passed++; console.log('  ✓', name) }
  else { failed++; console.error('  ✗', name) }
}
function eq(name, a, b) { ok(`${name} (got ${JSON.stringify(a)})`, JSON.stringify(a) === JSON.stringify(b)) }

const L = (kind, qty, priceCents, taxable = true, description = kind) => ({ kind, quantity: qty, unit_price_cents: priceCents, taxable, description })

console.log('GST, prices excluding GST')
{
  const q = computeQuote({ lines: [L('labour', 2, 9000), L('material', 1, 4550)], taxRate: 10 })
  eq('line totals', q.lines.map(l => l.line_total_cents), [18000, 4550])
  eq('subtotal ex GST', q.subtotal_cents, 22550)
  eq('GST 10% on top', q.tax_cents, 2255)
  eq('total', q.total_cents, 24805)
}

console.log('GST, prices including GST')
{
  const q = computeQuote({ lines: [L('labour', 1, 11000)], pricesIncludeTax: true, taxRate: 10 })
  eq('$110 incl. contains $10 GST', q.tax_cents, 1000)
  eq('total unchanged', q.total_cents, 11000)
  eq('subtotal ex GST', q.subtotal_cents, 10000)
}

console.log('GST-free lines never carry GST')
{
  const q = computeQuote({ lines: [L('labour', 1, 10000), L('fee', 1, 5000, false)], taxRate: 10 })
  eq('GST only on the taxable line', q.tax_cents, 1000)
  eq('total', q.total_cents, 16000)
}

console.log('Not registered for GST')
{
  const s = resolveJobSettings({ gst_registered: false })
  const q = computeQuote({ lines: [L('labour', 3, 5000)], taxRate: effectiveTaxRate(s) })
  eq('rate 0 when not registered', effectiveTaxRate(s), 0)
  eq('no GST', q.tax_cents, 0)
  eq('total = subtotal', q.total_cents, 15000)
}

console.log('Discounts')
{
  const fixed = computeQuote({ lines: [L('labour', 1, 20000)], discount: { type: 'fixed', value: 5000 }, taxRate: 10 })
  eq('fixed discount', fixed.discount_cents, 5000)
  eq('GST after discount', fixed.tax_cents, 1500)
  eq('total after fixed discount', fixed.total_cents, 16500)

  const pct = computeQuote({ lines: [L('labour', 1, 20000)], discount: { type: 'percent', value: 10 }, taxRate: 10 })
  eq('10% discount', pct.discount_cents, 2000)
  eq('total after 10% off', pct.total_cents, 19800)

  // A discount on a mix is shared in proportion, so the GST-free part takes its share.
  const mix = computeQuote({ lines: [L('labour', 1, 10000), L('fee', 1, 10000, false)], discount: { type: 'fixed', value: 2000 }, taxRate: 10 })
  eq('GST on taxable part after its half of the discount', mix.tax_cents, 900)
  eq('total', mix.total_cents, 18900)

  const over = computeQuote({ lines: [L('labour', 1, 1000)], discount: { type: 'fixed', value: 99999 }, taxRate: 10 })
  eq('fixed discount capped at the gross', over.discount_cents, 1000)
  eq('total never negative', over.total_cents, 0)

  eq('percent capped at 100', cleanDiscount({ type: 'percent', value: 250 }), { type: 'percent', value: 100 })
  eq('unknown type is none', cleanDiscount({ type: 'weird', value: 5 }), { type: 'none', value: 0 })
}

console.log('Rounding stays in whole cents')
{
  const q = computeQuote({ lines: [L('labour', 1.5, 3333)], taxRate: 10 })
  eq('1.5 × $33.33 rounds half away from zero', q.lines[0].line_total_cents, 5000)
  eq('GST on 5000', q.tax_cents, 500)
  eq('roundCents(-0.5) is -1', roundCents(-0.5), -1)
  const many = computeQuote({ lines: Array.from({ length: 3 }, () => L('material', 1, 333)), pricesIncludeTax: true, taxRate: 10 })
  eq('incl. GST on $9.99', many.tax_cents, 91)
  eq('parts add up', many.subtotal_cents + many.tax_cents, many.total_cents)
}

console.log('Deposits')
{
  const base = { lines: [L('labour', 1, 100000)], taxRate: 10 }
  eq('percent of total', computeQuote({ ...base, deposit: { type: 'percent', value: 20 } }).deposit_cents, 22000)
  eq('fixed', computeQuote({ ...base, deposit: { type: 'fixed', value: 15000 } }).deposit_cents, 15000)
  eq('fixed capped at the total', computeQuote({ ...base, deposit: { type: 'fixed', value: 9999999 } }).deposit_cents, 110000)
  eq('none', computeQuote(base).deposit_cents, 0)
  eq('cleanDeposit percent', cleanDeposit({ type: 'percent', value: '25' }), { type: 'percent', value: 25 })
}

console.log('Line validation')
{
  const lines = cleanLines([
    { kind: 'labour', description: '  Install   downlights ', quantity: '4', unit_price_cents: 8500 },
    { kind: 'nope', description: 'Odd kind', quantity: 1, unit_price_cents: 100 },
    { kind: 'material', description: '', quantity: 1, unit_price_cents: 0 },
    { kind: 'travel', description: 'Too many', quantity: 9e9, unit_price_cents: -50 },
  ])
  eq('empty row dropped', lines.length, 3)
  eq('description tidied', lines[0].description, 'Install downlights')
  eq('string quantity read', lines[0].quantity, 4)
  eq('unknown kind becomes other', lines[1].kind, 'other')
  eq('quantity capped', lines[2].quantity, 100000)
  eq('negative price floored at 0', lines[2].unit_price_cents, 0)
  eq(`at most ${MAX_LINES} lines`, cleanLines(Array.from({ length: 150 }, (_, i) => L('labour', 1, 100 + i))).length, MAX_LINES)
  eq('totals ignore browser-sent totals', computeQuote({ lines: [{ ...L('labour', 1, 1000), line_total_cents: 999999 }], taxRate: 0 }).total_cents, 1000)
  eq('inputToCents', inputToCents('$1,250.50'), 125050)
  ok('fmtMoney AUD', fmtMoney(123450).includes('1,234.50'))
}

console.log('Job status moves')
{
  ok('new → quoting', canMoveJob('new', 'quoting'))
  ok('quoting → awaiting approval', canMoveJob('quoting', 'awaiting_approval'))
  ok('awaiting approval → scheduled', canMoveJob('awaiting_approval', 'scheduled'))
  ok('scheduled → in progress', canMoveJob('scheduled', 'in_progress'))
  ok('in progress → completed', canMoveJob('in_progress', 'completed'))
  ok('completed → in progress (reopen)', canMoveJob('completed', 'in_progress'))
  ok('cancelled → new (reopen)', canMoveJob('cancelled', 'new'))
  ok('every open status can be cancelled', ['new', 'quoting', 'awaiting_approval', 'scheduled', 'in_progress'].every(s => canMoveJob(s, 'cancelled')))
  ok('not completed → new', !canMoveJob('completed', 'new'))
  ok('not new → completed', !canMoveJob('new', 'completed'))
  ok('not to the same status', !canMoveJob('new', 'new'))
  ok('not to an unknown status', !canMoveJob('new', 'done'))
  ok('every status has a way out', JOB_STATUSES.every(s => nextStatuses(s).length > 0))
}

console.log('Settings')
{
  const d = resolveJobSettings(null)
  eq('GST registered by default', d.gst_registered, true)
  eq('10% default', d.tax_rate, 10)
  eq('30 day validity', d.quote_valid_days, 30)
  const s = resolveJobSettings({ tax_rate: 250, quote_valid_days: 0, job_prefix: 'job-!!', quote_prefix: '' })
  eq('rate capped', s.tax_rate, 100)
  eq('validity at least 1 day', s.quote_valid_days, 1)
  eq('prefix tidied', s.job_prefix, 'JOB')
  eq('empty prefix falls back', s.quote_prefix, 'Q')
}

console.log('Module switch')
{
  ok('on by default for trades', jobsEnabled({ industry: 'Trades & Home Services' }))
  ok('on by default for logistics (removalists)', jobsEnabled({ industry: 'Logistics' }))
  ok('off by default for a café', !jobsEnabled({ industry: 'Food & Drink' }))
  ok('switched on explicitly', jobsEnabled({ industry: 'Food & Drink', modules: { jobs: true } }))
  ok('switched off explicitly wins over industry', !jobsEnabled({ industry: 'Trades & Home Services', modules: { jobs: false } }))
  eq('readModules ignores junk', readModules({ jobs: 'yes', restaurant: true, x: 1 }), { restaurant: true })
  ok('jobs page hidden when off', !moduleAllowsPage('/admin/jobs/123', { jobs: false, known: true }))
  ok('jobs page allowed while unknown', moduleAllowsPage('/admin/jobs', { jobs: false, known: false }))
  ok('other pages unaffected', moduleAllowsPage('/admin/inbox', { jobs: false, known: true }))
}

console.log('"jobs" permission')
{
  ok('jobs is a permission key', ALL_FEATURE_KEYS.includes('jobs'))
  eq('jobs pages map to the jobs key', featureForPath('/admin/jobs/abc')?.key, 'jobs')
  ok('owner always', canUseFeature('owner', { jobs: false }, 'jobs'))
  ok('unrestricted member (no map)', canUseFeature('editor', null, 'jobs'))
  ok('restricted member without jobs is refused (new feature off until allowed)', !canUseFeature('editor', { inbox: true }, 'jobs'))
  ok('restricted member with jobs on', canUseFeature('editor', { jobs: true }, 'jobs'))
}

console.log('Server access check (tenancy + permission)')
{
  const team = [
    { company_id: 'A', user_id: 'u-owner-a', role: 'owner', status: 'active', permissions: null },
    { company_id: 'A', user_id: 'u-staff', role: 'editor', status: 'active', permissions: { jobs: true } },
    { company_id: 'A', user_id: 'u-nojobs', role: 'editor', status: 'active', permissions: { inbox: true } },
    { company_id: 'A', user_id: 'u-removed', role: 'editor', status: 'removed', permissions: null },
    { company_id: 'A', user_id: 'u-viewer', role: 'viewer', status: 'active', permissions: null },
    { company_id: 'B', user_id: 'u-other', role: 'owner', status: 'active', permissions: null },
  ]
  const rowsFor = (company, user) => team.filter(r => r.company_id === company && r.user_id === user)
  eq('owner of A', checkJobsAccess({ isOwner: true, rows: [] }).ok, true)
  eq('staff with jobs', checkJobsAccess({ isOwner: false, rows: rowsFor('A', 'u-staff') }).ok, true)
  eq('staff without jobs → 403', checkJobsAccess({ isOwner: false, rows: rowsFor('A', 'u-nojobs') }), { ok: false, status: 403, reason: 'no_permission' })
  eq('removed member → 403', checkJobsAccess({ isOwner: false, rows: rowsFor('A', 'u-removed') }).ok, false)
  eq('board viewer → 403', checkJobsAccess({ isOwner: false, rows: rowsFor('A', 'u-viewer') }).ok, false)
  eq('owner of B cannot reach A (no rows in A)', checkJobsAccess({ isOwner: false, rows: rowsFor('A', 'u-other') }), { ok: false, status: 403, reason: 'not_member' })
}

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
