// Tests for restaurant reservations (Phase 1): settings, dining times by party
// size, covers and pacing (the same rules as claim_reservation in V429), the
// day's seating times in the business's time zone, the module switch and the
// new business type. Phase 2: which table a party gets (the same order as
// claim_table_reservation in V430), combos, floor plan checks, deposits and
// the missed-call text's booking link. Zero dependencies:
//
//   npx tsx scripts/restaurant.test.mjs
//
// Exits non-zero when anything fails.

import { resolveRestaurantSettings, durationFor, periodName, cleanDurations, reservationName, depositFor } from '../lib/restaurant/settings.ts'
import { pickTable, tableFree, tableChoices, seatsByTable, floorProblem } from '../lib/restaurant/tables.ts'
import { renderMissedCallText, missedCallTextSettings, MISSED_CALL_TEXT_RESTAURANT, MISSED_CALL_TEXT_DEFAULT } from '../lib/missed-call-text-settings.ts'
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

console.log('Tables (Phase 2)')
{
  const T = (id, label, min, max, extra = {}) => ({ id, label, area_id: extra.area || null, min_party: min, max_party: max, online: extra.online ?? true, active: extra.active ?? true, unavailable_until: extra.until || null, sort: extra.sort ?? 0 })
  const floor = {
    tables: [T('t1', '1', 1, 2), T('t2', '2', 1, 2, { area: 'patio' }), T('t4', '4', 2, 4), T('t5', '5', 2, 4), T('t6', '6', 4, 6, { online: false }), T('t9', '9', 1, 2, { active: false })],
    combos: [{ id: 'c45', name: '4 + 5', table_ids: ['t4', 't5'], min_party: 6, max_party: 8, online: true, active: true }],
  }
  const at = Date.parse('2026-11-14T08:00:00Z'), end = at + 90 * MIN
  eq('a couple: the smallest table first (1, by label)', pickTable(floor, [], { party: 2, start: at, end })?.tables, ['t1'])
  eq('…the area they asked for first', pickTable(floor, [], { party: 2, start: at, end, area: 'patio' })?.tables, ['t2'])
  const busy1 = [{ table_id: 't1', booking_id: 'b1', starts: at - 30 * MIN, ends: at + 30 * MIN }]
  eq('table 1 taken for part of the visit: the next one', pickTable(floor, busy1, { party: 2, start: at, end })?.tables, ['t2'])
  eq('…but not when it’s that same reservation moving', pickTable(floor, busy1, { party: 2, start: at, end, excludeId: 'b1' })?.tables, ['t1'])
  ok('a hold that ended as they arrive doesn’t block', tableFree(floor.tables[0], [{ table_id: 't1', booking_id: 'b0', starts: at - 90 * MIN, ends: at }], at, end))
  eq('four: a four-top', pickTable(floor, [], { party: 4, start: at, end })?.tables, ['t4'])
  eq('six: table 6 for the team', pickTable(floor, [], { party: 6, start: at, end })?.tables, ['t6'])
  const six = pickTable(floor, [], { party: 6, start: at, end, onlineOnly: true })
  eq('six online: 6 isn’t bookable online, so the 4 + 5 combo', [six?.tables, six?.combo], [['t4', 't5'], 'c45'])
  eq('combo needs every table free', pickTable(floor, [{ table_id: 't5', booking_id: 'b2', starts: at, ends: end }], { party: 6, start: at, end, onlineOnly: true }), null)
  eq('nine: nothing fits', pickTable(floor, [], { party: 9, start: at, end }), null)
  const out = { ...floor, tables: floor.tables.map(t => t.id === 't1' ? { ...t, unavailable_until: new Date(at + 60 * MIN).toISOString() } : t) }
  eq('a table out of action is skipped', pickTable(out, [], { party: 2, start: at, end })?.tables, ['t2'])
  ok('switched-off tables never count', !tableFree(floor.tables[5], [], at, end))
  ok('seats by table only with the setting on and a table', seatsByTable(true, floor) && !seatsByTable(false, floor) && !seatsByTable(true, { tables: [], combos: [] }) && !seatsByTable(true, null))
  const ch = tableChoices(floor, busy1, { party: 4, start: at, end })
  eq('picker: free and fitting first, taken last', ch.map(c => c.label), ['4', '5', '6', '2', '1'])
  ok('picker: says which are taken', ch.find(c => c.label === '1').free === false)
  eq('plan check: fine', floorProblem({ tables: floor.tables, combos: floor.combos }), null)
  ok('plan check: two tables called 4', /Two tables are called/.test(floorProblem({ tables: [T('a', '4', 1, 2), T('b', ' 4', 1, 2)], combos: [] }) || ''))
  ok('plan check: most fewer than fewest', /fewer than the fewest/.test(floorProblem({ tables: [T('a', '1', 4, 2)], combos: [] }) || ''))
  ok('plan check: a combo using a removed table', /no longer on the plan/.test(floorProblem({ tables: [T('t4', '4', 2, 4)], combos: floor.combos }) || ''))

  // The day's times when seating by table: covers allow it, but no table does.
  const s = resolveRestaurantSettings({ interval_mins: 30, duration_mins: 90, durations: [], max_covers: 40, pace_covers: 0, min_notice_mins: 0, hours: { sat: [{ start: '18:00', end: '19:00' }] } })
  const tz = 'Australia/Melbourne', six30 = zonedToUtc('2026-11-14', '18:00', tz)
  const small = { tables: [T('t1', '1', 1, 2)], combos: [] }
  const live = [{ id: 'b1', starts: six30, ends: six30 + 90 * MIN, seats: 2 }]
  const slots = reservationSlots({ settings: s, tz, date: '2026-11-14', party: 2, live, now: Date.parse('2026-11-10T00:00:00Z'), floor: { floor: small, holds: [{ table_id: 't1', booking_id: 'b1', starts: six30, ends: six30 + 90 * MIN }], onlineOnly: true } })
  ok('one table, taken at 6: 6pm says no table', slots[0].ok === false && slots[0].reason === 'no_table')
  ok('…7:30 isn’t on the grid, 7pm is still taken', slots.every(x => !x.ok))
  const nofloor = reservationSlots({ settings: s, tz, date: '2026-11-14', party: 2, live, now: Date.parse('2026-11-10T00:00:00Z') })
  ok('without tables the same evening has room (covers only)', nofloor.every(x => x.ok))
}

console.log('Deposits and no-shows (Phase 2)')
{
  const s = resolveRestaurantSettings({ deposit: { mode: 'per_person', cents: 2000, min_party: 6, days: ['fri', 'sat'] }, no_show: { auto_mins: 30, block_after: 3, deposit_after: 2 } })
  eq('defaults: no deposit, no automatic no-shows', [resolveRestaurantSettings(null).deposit.mode, resolveRestaurantSettings(null).no_show.auto_mins], ['off', 0])
  eq('6 on a Saturday: $20 each', depositFor(s, { party: 6, date: '2026-11-14' }), { cents: 12000, why: 'rule' })
  eq('4 on a Saturday: none', depositFor(s, { party: 4, date: '2026-11-14' }), { cents: 0, why: null })
  eq('6 on a Tuesday: none', depositFor(s, { party: 6, date: '2026-11-10' }), { cents: 0, why: null })
  eq('…unless they’ve not turned up twice before', depositFor(s, { party: 2, date: '2026-11-10', noShows: 2 }), { cents: 4000, why: 'no_shows' })
  const pb = resolveRestaurantSettings({ deposit: { mode: 'per_booking', cents: 5000, min_party: 1, days: [] } })
  eq('per booking, any day', depositFor(pb, { party: 3, date: '2026-11-10' }), { cents: 5000, why: 'rule' })
  eq('no-show rule cleaned: auto 5 → 10 (the least), block 99 → 10', [resolveRestaurantSettings({ no_show: { auto_mins: 5, block_after: 99 } }).no_show.auto_mins, resolveRestaurantSettings({ no_show: { auto_mins: 5, block_after: 99 } }).no_show.block_after], [10, 10])
  eq('a negative deposit is none', resolveRestaurantSettings({ deposit: { mode: 'per_person', cents: -5 } }).deposit.cents, 0)
}

console.log('Missed-call text: the booking link (Phase 2)')
{
  eq('restaurant text with its booking page', renderMissedCallText(MISSED_CALL_TEXT_RESTAURANT, 'Harbour Lane Kitchen', 'https://harbour.colvy.com/reserve'),
    "Sorry we missed your call! This is Harbour Lane Kitchen. Book a table here: https://harbour.colvy.com/reserve or reply and we'll get back to you.")
  eq('no page to link to: the link sentence goes', renderMissedCallText(MISSED_CALL_TEXT_RESTAURANT, 'Harbour Lane Kitchen', null),
    "Sorry we missed your call! This is Harbour Lane Kitchen. Reply and we'll get back to you.")
  eq('a bare placeholder just goes', renderMissedCallText('Hi from {business}! {booking_link}', 'X', ''), 'Hi from X!')
  eq('restaurants get the table text by default', missedCallTextSettings({}, { restaurant: true }).message, MISSED_CALL_TEXT_RESTAURANT)
  eq('…and instead of the old plain default', missedCallTextSettings({ missed_call_text: { message: MISSED_CALL_TEXT_DEFAULT } }, { restaurant: true }).message, MISSED_CALL_TEXT_RESTAURANT)
  eq('their own words are kept', missedCallTextSettings({ missed_call_text: { message: 'Call us back!' } }, { restaurant: true }).message, 'Call us back!')
  eq('gap between texts: 12 hours by default, theirs when set, 12 when silly', [missedCallTextSettings({}).hours, missedCallTextSettings({ missed_call_text: { hours: 24 } }).hours, missedCallTextSettings({ missed_call_text: { hours: 999 } }).hours], [12, 24, 12])
}

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
