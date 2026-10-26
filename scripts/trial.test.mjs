// Runnable tests for how many days of a trial are left (lib/trial), the count
// the trial banner, Billing and the admin views share.
//
//   TZ=Australia/Melbourne npx tsx scripts/trial.test.mjs
//
// Zero-dependency. Times are local to TZ (calendar days on the device's
// clock), so run it in a zone with daylight saving to cover that too.
// Exits non-zero if any check fails.

import { trialLeft, trialEndsPhrase } from '../lib/trial.ts'

let failures = 0
const ok = (cond, name) => { if (cond) console.log('  ok  ', name); else { failures++; console.log('  FAIL', name) } }
const at = (y, m, d, h = 0, min = 0) => new Date(y, m - 1, d, h, min)

console.log('trialLeft')
{
  const now = at(2026, 10, 27, 9, 46)
  // The report: banner said 5, Billing 4. Both now read the same end date.
  const t = trialLeft(at(2026, 10, 31, 15, 0), now)
  ok(t.days === 4 && !t.ended, 'ends Fri 3pm, it is Mon 9:46am: 4 days')
  ok(trialEndsPhrase(t) === 'in 4 days', '… reads "in 4 days"')
  ok(trialLeft(at(2026, 10, 31, 8, 0), now).days === 4, 'the hour on the end day doesn’t change the count')
  ok(trialLeft(at(2026, 10, 27, 23, 0), now).days === 0, 'ends later today: 0')
  ok(trialEndsPhrase(trialLeft(at(2026, 10, 27, 23, 0), now)) === 'today', '… reads "today"')
  ok(trialEndsPhrase(trialLeft(at(2026, 10, 28, 0, 30), now)) === 'tomorrow', 'ends just after midnight: "tomorrow"')
  const gone = trialLeft(at(2026, 10, 27, 9, 0), now)
  ok(gone.ended && gone.days === 0, 'ended earlier today: ended')
  ok(trialLeft(at(2026, 11, 10, 9, 46), now).days === 14, 'a fresh 14-day trial: 14')
  ok(trialLeft(new Date(at(2026, 10, 31, 15).getTime()).toISOString(), now).days === 4, 'takes an ISO string (trial_ends_at)')
  ok(trialLeft(null, now) === null && trialLeft('', now) === null && trialLeft('nope', now) === null, 'no or bad date: null')
}

console.log('daylight saving')
{
  // Melbourne goes back an hour on Sun 5 Apr 2026 (a 25-hour day) and forward
  // on Sun 4 Oct 2026 (23 hours); a count across either stays whole.
  ok(trialLeft(at(2026, 4, 8, 12), at(2026, 4, 3, 12)).days === 5, 'across the clocks going back: 5')
  ok(trialLeft(at(2026, 10, 7, 12), at(2026, 10, 2, 12)).days === 5, 'across the clocks going forward: 5')
}

if (failures) { console.log(`\n${failures} failed`); process.exit(1) }
console.log('\nall passed')
