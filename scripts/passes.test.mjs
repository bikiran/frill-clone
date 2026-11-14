// Class packs and memberships: the pure rules (lib/passes/rules.ts).
// Run: node --experimental-strip-types scripts/passes.test.mjs
import assert from 'node:assert/strict'
const R = await import('../lib/passes/rules.ts')

const results = []
const t = (name, fn) => { try { fn(); results.push(true); console.log('✓', name) } catch (e) { results.push(false); console.log('✗', name, '\n ', e.message) } }
const D = 86_400_000
const base = { id: 'p1', service_ids: [], price_cents: 15000, currency: 'aud', activated_at: null, period_start: null, period_end: null, cancel_at_period_end: false }
const pack = (x = {}) => ({ ...base, kind: 'pack', name: '10-class pack', status: 'active', credits_total: 10, credits_used: 0, every_n: null, unit: null, expires_at: new Date(Date.now() + 30 * D).toISOString(), ...x })
const member = (x = {}) => ({ ...base, kind: 'membership', name: 'Unlimited monthly', status: 'active', credits_total: null, credits_used: 0, every_n: 1, unit: 'month', expires_at: null, period_start: '2026-11-01T00:00:00.000Z', period_end: '2026-12-01T00:00:00.000Z', ...x })

t('a pack needs classes; a membership needs a price and how often', () => {
  assert.throws(() => R.cleanProduct({ kind: 'pack', name: 'X', price_cents: 1000 }), /How many classes/)
  assert.throws(() => R.cleanProduct({ kind: 'membership', name: 'M', price_cents: 0, every_n: 1, unit: 'month' }), /at least \$1/)
  assert.throws(() => R.cleanProduct({ kind: 'membership', name: 'M', price_cents: 3900 }), /how often/)
  assert.throws(() => R.cleanProduct({ kind: 'pack', name: '', credits: 5, price_cents: 1000 }), /name/)
  assert.throws(() => R.cleanProduct({ kind: 'pack', name: 'Cheap', credits: 5, price_cents: 50 }), /at least \$1/)
})
t('a clean product keeps only what makes sense for its kind', () => {
  const p = R.cleanProduct({ kind: 'pack', name: ' 10-class pack ', credits: '10', valid_days: '90', price_cents: 15000, every_n: 2, unit: 'week', service_ids: ['not-a-uuid', '11111111-1111-4111-8111-111111111111'] })
  assert.equal(p.name, '10-class pack'); assert.equal(p.credits, 10); assert.equal(p.valid_days, 90)
  assert.equal(p.every_n, null); assert.equal(p.unit, null)
  assert.deepEqual(p.service_ids, ['11111111-1111-4111-8111-111111111111'])
  const m = R.cleanProduct({ kind: 'membership', name: 'Weekly', price_cents: 3900, every_n: 1, unit: 'week', credits: '', valid_days: 30 })
  assert.equal(m.credits, null); assert.equal(m.valid_days, null); assert.equal(m.unit, 'week')
})
t('words: price, classes and terms', () => {
  const p = R.cleanProduct({ kind: 'pack', name: '10-class pack', credits: 10, valid_days: 84, price_cents: 15000 })
  assert.equal(R.priceWords(p), '$150')
  assert.equal(R.creditsWords(p), '10 classes')
  assert.equal(R.productTerms(p), '10 classes · use within 12 weeks')
  const m = R.cleanProduct({ kind: 'membership', name: 'Fortnightly', price_cents: 7450, every_n: 2, unit: 'week', credits: 8 })
  assert.equal(R.priceWords(m), '$74.50 every 2 weeks')
  assert.equal(R.creditsWords(m), '8 classes every 2 weeks')
  assert.equal(R.creditsWords({ kind: 'membership', credits: null, every_n: 1, unit: 'month' }), 'Unlimited classes')
})
t('months keep the day, or the last day of a short month', () => {
  assert.equal(R.addPeriods('2027-01-31T09:00:00.000Z', 1, 'month', 1), '2027-02-28T09:00:00.000Z')
  assert.equal(R.addPeriods('2027-01-31T09:00:00.000Z', 1, 'month', 2), '2027-03-31T09:00:00.000Z')
  assert.equal(R.addPeriods('2027-01-01T00:00:00.000Z', 2, 'week', 1), '2027-01-15T00:00:00.000Z')
  assert.equal(R.addPeriods('2027-03-15T00:00:00.000Z', 1, 'month', -1), '2027-02-15T00:00:00.000Z')
})
t('the billing period a class falls in (this one, a later one, an earlier one)', () => {
  const m = member()
  assert.deepEqual(R.periodWindow(m, Date.parse('2026-11-20T10:00:00Z')), { from: '2026-11-01T00:00:00.000Z', to: '2026-12-01T00:00:00.000Z' })
  assert.deepEqual(R.periodWindow(m, Date.parse('2027-01-03T10:00:00Z')), { from: '2027-01-01T00:00:00.000Z', to: '2027-02-01T00:00:00.000Z' })
  assert.deepEqual(R.periodWindow(m, Date.parse('2026-10-31T10:00:00Z')), { from: '2026-10-01T00:00:00.000Z', to: '2026-11-01T00:00:00.000Z' })
  assert.equal(R.periodWindow(pack(), Date.now()), null)
})
t('where a pack stands', () => {
  assert.equal(R.passState(pack({ credits_used: 4 })).label, '6 of 10 left')
  const used = R.passState(pack({ credits_used: 10 }))
  assert.equal(used.usable, false); assert.equal(used.label, 'Used up')
  const old = R.passState(pack({ expires_at: new Date(Date.now() - D).toISOString() }))
  assert.equal(old.usable, false); assert.equal(old.label, 'Expired')
  assert.equal(R.passState(pack({ status: 'pending' })).label, 'Not paid yet')
})
t('where a membership stands', () => {
  const now = Date.parse('2026-11-20T00:00:00Z')
  const u = R.passState(member(), now, 0, 'Australia/Melbourne')
  assert.equal(u.usable, true); assert.equal(u.label, 'Unlimited classes'); assert.match(u.when, /^Renews 1 December$/)
  const lim = R.passState(member({ credits_total: 8 }), now, 3)
  assert.equal(lim.label, '5 of 8 left this month')
  const ending = R.passState(member({ cancel_at_period_end: true }), now, 0, 'Australia/Melbourne')
  assert.match(ending.when, /^Ends 1 December$/)
  assert.equal(R.passState(member({ status: 'past_due' }), now).label, 'Payment failed')
  // Stopped straight away: when it ended, not the end of the period it had paid for.
  assert.match(R.passState(member({ status: 'cancelled', cancelled_at: '2026-11-20T03:00:00Z' }), now, 0, 'Australia/Melbourne').when, /^Ended 20 November$/)
  // A few days' grace while Stripe retries the renewal, then it stops.
  assert.equal(R.passState(member(), Date.parse('2026-12-02T00:00:00Z')).usable, true)
  assert.equal(R.passState(member(), Date.parse('2026-12-08T00:00:00Z')).usable, false)
})
t('can a pass pay for this class?', () => {
  const now = Date.parse('2026-11-20T00:00:00Z')
  const yoga = '11111111-1111-4111-8111-111111111111', spin = '22222222-2222-4222-8222-222222222222'
  assert.equal(R.canBook(pack({ service_ids: [yoga] }), spin, now + D, now).ok, false)
  assert.equal(R.canBook(pack({ service_ids: [yoga] }), yoga, now + D, Date.now()).ok, true)
  const p = pack({ expires_at: new Date(now + 5 * D).toISOString() })
  assert.match(R.canBook(p, yoga, now + 6 * D, now).reason, /expires before this class/)
  const m = member({ cancel_at_period_end: true })
  assert.match(R.canBook(m, yoga, Date.parse('2026-12-03T00:00:00Z'), now).reason, /ends before this class/)
  assert.equal(R.canBook(member({ credits_total: 8 }), yoga, now + D, now, 7).ok, true)
  assert.match(R.canBook(member({ credits_total: 8 }), yoga, now + D, now, 8).reason, /booked all 8 classes/)
})
t('refusals from the database read well', () => {
  assert.equal(R.useRefusal('none_left', '10-class pack'), 'There are no classes left on your 10-class pack.')
  assert.equal(R.useRefusal('period_full', 'x'), 'You’ve booked all your classes for that period.')
  assert.equal(R.useRefusal('weird', 'x'), 'That pass can’t be used for this booking.')
})

console.log(results.every(Boolean) ? '\nall passed' : `\n${results.filter(x => !x).length} failed`)
process.exit(results.every(Boolean) ? 0 : 1)
