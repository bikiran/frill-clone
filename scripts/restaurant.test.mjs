// Tests for restaurant reservations (Phase 1): settings, dining times by party
// size, covers and pacing (the same rules as claim_reservation in V429), the
// day's seating times in the business's time zone, the module switch and the
// new business type. Zero dependencies:
//
//   npx tsx scripts/restaurant.test.mjs
//
// Exits non-zero when anything fails.

import { resolveRestaurantSettings, durationFor, periodName, cleanDurations, reservationName } from '../lib/restaurant/settings.ts'
import { peakCovers, paceCovers, fits, reservationSlots, onGrid, coversTimeline, daySpan } from '../lib/restaurant/availability.ts'
import { restaurantEnabled, moduleAllowsPage, jobsEnabled } from '../lib/modules.ts'
import { industryFromGoogle } from '../lib/industries.ts'
import { featureForPath, canUseFeature } from '../lib/permissions.ts'
import { zonedToUtc } from '../lib/booking-time.ts'

let passed = 0, failed = 0
function ok(name, cond) {
  if (cond) { passed++; console.log(`  ✓ ${name}`) } else { failed++; console.log(`  ✗ ${name}`) }
}
function eq(name, a, b) { ok(`${name} (got ${JSON.stringify(a)})`, JSON.stringify(a) === JSON.stringify(b)) }
const MIN = 60_000

console.log('Settings')
{
  const d = resolveRestaurantSettings(null)
  eq('defaults: 15-minute interval', d.interval_mins, 15)
  eq('defaults: parties of 1 to 8 online', [d.party_min, d.party_max], [1, 8])
  eq('defaults: 40 seated at once, no pacing', [d.max_covers, d.pace_covers], [40, 0])
  ok('defaults: closed Mondays, open Friday lunch and dinner', d.hours.mon.length === 0 && d.hours.fri.length === 2)
  eq('odd interval falls back to 15', resolveRestaurantSettings({ interval_mins: 17 }).interval_mins, 15)
  eq('party max never below min', resolveRestaurantSettings({ party_min: 6, party_max: 2 }).party_max, 6)
  eq('only real seating options kept', resolveRestaurantSettings({ seating: ['outdoor', 'roof', 'bar'] }).seating, ['outdoor', 'bar'])
  eq('control characters stripped from page text', resolveRestaurantSettings({ intro: 'Hi\u0007 there' }).intro, 'Hi there')
  eq('bad closed dates dropped', resolveRestaurantSettings({ closed: [{ date: '2026-12-25', label: 'Christmas' }, { date: 'xmas' }] }).closed.length, 1)
  ok('phone required, email optional by default', d.require_phone === true && d.require_email === false)
  eq('max covers capped', resolveRestaurantSettings({ max_covers: 99999 }).max_covers, 2000)
}

console.log('Dining time by party size')
{
  const s = resolveRestaurantSettings({ duration_mins: 150, durations: [{ upTo: 4, mins: 90 }, { upTo: 2, mins: 75 }, { upTo: 8, mins: 120 }] })
  eq('sorted by size', s.durations.map(d => d.upTo), [2, 4, 8])
  eq('2 people: 75 min', durationFor(s, 2), 75)
  eq('3 people: 90 min', durationFor(s, 3), 90)
  eq('8 people: 120 min', durationFor(s, 8), 120)
  eq('12 people: the default (150)', durationFor(s, 12), 150)
  eq('duplicates and junk dropped', cleanDurations([{ upTo: 2, mins: 60 }, { upTo: 2, mins: 90 }, { upTo: 0, mins: 30 }, { upTo: 4, mins: 5 }]), [{ upTo: 2, mins: 60 }])
  eq('names', [periodName('08:00'), periodName('12:00'), periodName('17:30')], ['Breakfast', 'Lunch', 'Dinner'])
  eq('reservation name', reservationName(4), 'Table for 4')
}

console.log('Covers: seated at once')
{
  const T = Date.parse('2026-11-14T08:00:00Z') // 7pm Melbourne
  const r = (startMin, mins, seats, id) => ({ id, starts: T + startMin * MIN, ends: T + (startMin + mins) * MIN, seats })
  const live = [r(0, 90, 4, 'a'), r(30, 90, 6, 'b'), r(120, 90, 2, 'c')]
  eq('peak at 7:00–8:30 includes the 7:30 arrival', peakCovers(live, T, T + 90 * MIN), 10)
  eq('peak for 8:30–10:00 (a gone; b leaves at 9 as c arrives)', peakCovers(live, T + 90 * MIN, T + 180 * MIN), 6)
  eq('ignores itself when moving', peakCovers(live, T, T + 90 * MIN, 'b'), 4)
  eq('later visit that starts after we leave doesn’t count', peakCovers([r(90, 60, 9)], T, T + 90 * MIN), 0)
  eq('one that ends as we arrive doesn’t count', peakCovers([r(-90, 90, 9)], T, T + 90 * MIN), 0)
  const s = resolveRestaurantSettings({ max_covers: 12, durations: [], duration_mins: 90 })
  ok('a party of 2 fits (10 + 2 = 12)', fits(s, live, T, 2).ok)
  ok('a party of 3 doesn’t (10 + 3 > 12)', !fits(s, live, T, 3).ok && fits(s, live, T, 3).reason === 'full')
  eq('seats left reported', fits(s, live, T, 3).coversLeft, 2)
  ok('no limit (0) always fits', fits({ ...s, max_covers: 0 }, live, T, 50).ok)
}

console.log('Covers: arrivals per interval (pacing)')
{
  const T = Date.parse('2026-11-14T08:00:00Z')
  const live = [{ starts: T, ends: T + 90 * MIN, seats: 6 }, { starts: T + 10 * MIN, ends: T + 100 * MIN, seats: 4 }, { starts: T + 15 * MIN, ends: T + 105 * MIN, seats: 8 }]
  eq('7:00–7:14 arrivals', paceCovers(live, T + 5 * MIN, 15), 10)
  eq('7:15 is the next interval', paceCovers(live, T + 15 * MIN, 15), 8)
  const s = resolveRestaurantSettings({ max_covers: 0, pace_covers: 12 })
  ok('pacing: 2 more at 7:00 fits (10 + 2)', fits(s, live, T, 2).ok)
  ok('pacing: 3 more at 7:00 doesn’t', fits(s, live, T, 3).reason === 'pace')
}

console.log('Seating times (business time zone)')
{
  const tz = 'Australia/Melbourne'
  const s = resolveRestaurantSettings({
    interval_mins: 30, max_covers: 10, min_notice_mins: 60, max_days_ahead: 30, durations: [], duration_mins: 90,
    hours: { sat: [{ start: '12:00', end: '13:00' }, { start: '18:00', end: '19:00' }] }, closed: [{ date: '2026-11-21', label: 'Private event' }],
  })
  const now = Date.parse('2026-11-10T00:00:00Z')
  const slots = reservationSlots({ settings: s, tz, date: '2026-11-14', party: 2, live: [], now })
  eq('lunch 12:00, 12:30, 13:00 and dinner 18:00, 18:30, 19:00 (last seating included)', slots.length, 6)
  eq('first is noon Melbourne (01:00Z in daylight saving)', new Date(slots[0].start).toISOString(), '2026-11-14T01:00:00.000Z')
  eq('periods', [...new Set(slots.map(x => x.period))], ['Lunch', 'Dinner'])
  ok('all open with nothing booked', slots.every(x => x.ok))
  eq('a closed day has no times', reservationSlots({ settings: s, tz, date: '2026-11-21', party: 2, live: [], now }).length, 0)
  eq('a day without hours has no times', reservationSlots({ settings: s, tz, date: '2026-11-15', party: 2, live: [], now }).length, 0)
  const sixPm = zonedToUtc('2026-11-14', '18:00', tz)
  const full = reservationSlots({ settings: s, tz, date: '2026-11-14', party: 2, live: [{ starts: sixPm, ends: sixPm + 90 * MIN, seats: 9 }], now })
  const at = t => full.find(x => x.start === zonedToUtc('2026-11-14', t, tz))
  ok('18:00 full for 2 (9 seated)', at('18:00').ok === false && at('18:00').reason === 'full')
  ok('18:30 also full (still seated)', at('18:30').ok === false)
  ok('19:00 also full (they leave at 19:30)', at('19:00').ok === false)
  ok('lunch unaffected', at('12:00').ok)
  const soon = reservationSlots({ settings: s, tz, date: '2026-11-14', party: 2, live: [], now: zonedToUtc('2026-11-14', '11:30', tz) })
  ok('within the hour’s notice: not online', soon.find(x => x.start === zonedToUtc('2026-11-14', '12:00', tz)).reason === 'notice')
  ok('after the notice: fine', soon.find(x => x.start === zonedToUtc('2026-11-14', '12:30', tz)).ok)
  const far = reservationSlots({ settings: s, tz, date: '2026-11-14', party: 2, live: [], now: Date.parse('2026-10-01T00:00:00Z') })
  ok('beyond the advance window: not online', far.every(x => x.reason === 'far'))
  ok('on the grid: 18:30', onGrid(s, tz, '2026-11-14', zonedToUtc('2026-11-14', '18:30', tz)))
  ok('off the grid: 18:15', !onGrid(s, tz, '2026-11-14', zonedToUtc('2026-11-14', '18:15', tz)))
  ok('off the grid: 19:30 (after last seating)', !onGrid(s, tz, '2026-11-14', zonedToUtc('2026-11-14', '19:30', tz)))
  const [a, b] = daySpan('2026-11-14', tz)
  eq('day span is 24h in Melbourne', (b - a) / 3600000, 24)
  const [c, d2] = daySpan('2026-04-05', tz)
  eq('day span on the night daylight saving ends is 25h', (d2 - c) / 3600000, 25)
  const tl = coversTimeline([{ starts: sixPm, ends: sixPm + 90 * MIN, seats: 9 }], sixPm - 30 * MIN, sixPm + 90 * MIN, 30)
  eq('covers strip', tl.map(x => x.covers), [0, 9, 9, 9, 0])
}

console.log('Module, business type, permission')
{
  ok('on for Restaurant & Hospitality', restaurantEnabled({ industry: 'Restaurant & Hospitality' }))
  ok('off for a café (Food & Drink) until switched on', !restaurantEnabled({ industry: 'Food & Drink' }))
  ok('switched on explicitly', restaurantEnabled({ industry: 'Food & Drink', modules: { restaurant: true } }))
  ok('switched off explicitly wins', !restaurantEnabled({ industry: 'Restaurant & Hospitality', modules: { restaurant: false } }))
  ok('Jobs still independent', !jobsEnabled({ industry: 'Restaurant & Hospitality' }))
  ok('reservations pages hidden when off', !moduleAllowsPage('/admin/reservations/settings', { jobs: false, restaurant: false, known: true }))
  ok('reservations pages shown when on', moduleAllowsPage('/admin/reservations', { jobs: false, restaurant: true, known: true }))
  ok('jobs pages unaffected by the restaurant switch', moduleAllowsPage('/admin/jobs', { jobs: true, restaurant: false, known: true }))
  eq('Google: restaurant', industryFromGoogle('restaurant'), 'Restaurant & Hospitality')
  eq('Google: thai_restaurant', industryFromGoogle('thai_restaurant'), 'Restaurant & Hospitality')
  eq('Google: cafe stays Food & Drink', industryFromGoogle('cafe'), 'Food & Drink')
  eq('Google: bakery stays Food & Drink', industryFromGoogle('bakery'), 'Food & Drink')
  eq('reservations pages belong to the reservations permission', featureForPath('/admin/reservations/settings')?.key, 'reservations')
  ok('owners can use it', canUseFeature('owner', null, 'reservations'))
}

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
