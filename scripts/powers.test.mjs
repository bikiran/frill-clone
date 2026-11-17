// Colvy Powers: the rules that need no database. Levels, settings kept in
// bounds, who takes part, what counts as a real reply, trivial self-made
// tasks, reviews that name a teammate, XP boosts, leaderboard periods, and
// who a completed task pays. Same harness as the other scripts here:
//
//   npx tsx scripts/powers.test.mjs
//
// The money side (wallets, caps, idempotency, concurrency, tenant isolation)
// runs against real Postgres in scripts/powers-sql.test.mjs.

import {
  levelFor, xpForLevel, cleanConfig, defaultConfig, canTakePart, isMeaningfulReply, isTrivialSelfTask,
  teammateNamedIn, boostedXp, periodStart, weekKey, RULES, POWERS, COSMETICS, TITLES,
  creditReplies, ruleAvailable, everyLabel, ALL_FEATURES,
} from '../lib/powers/config.ts'
import { taskCredit } from '../lib/powers/server.ts'
import { ACHIEVEMENTS } from '../lib/powers/achievements.ts'

let passed = 0, failed = 0
function ok(name, cond) { if (cond) { passed++; console.log('  ✓', name) } else { failed++; console.error('  ✗', name) } }
function eq(name, a, b) { ok(`${name} (got ${JSON.stringify(a)})`, JSON.stringify(a) === JSON.stringify(b)) }

console.log('levels')
eq('level 1 at 0 XP', levelFor(0).level, 1)
eq('Rookie to start', levelFor(0).title, 'Rookie')
eq('level 5 at 800 XP', levelFor(800).level, 5)
eq('…which is Rising Star', levelFor(800).title, 'Rising Star')
eq('799 XP is still level 4', levelFor(799).level, 4)
eq('level 10 at 4,050 XP: Specialist', [levelFor(4050).level, levelFor(4050).title], [10, 'Specialist'])
eq('level 20: Champion', levelFor(xpForLevel(20)).title, 'Champion')
eq('level 30: Legend', levelFor(xpForLevel(30)).title, 'Legend')
eq('level 50: Colvy Master', levelFor(xpForLevel(50)).title, 'Colvy Master')
eq('no level past 50', levelFor(10_000_000).level, 50)
ok('progress is between 0 and 1', levelFor(1234).progress > 0 && levelFor(1234).progress < 1)
ok('every level needs more XP than the one before', Array.from({ length: 49 }, (_, i) => xpForLevel(i + 2) > xpForLevel(i + 1)).every(Boolean))
ok('the titles are the six in the spec', TITLES.map(t => t.level).join() === '1,5,10,20,30,50')

console.log('settings')
const d = defaultConfig()
eq('default rewards match the spec', RULES.map(r => [r.id, d.rules[r.id].coins]), [['resolve', 10], ['reply', 2], ['call', 5], ['task', 15], ['job', 25], ['order', 5], ['feedback', 30], ['thanks', 10], ['active', 5], ['time', 5], ['challenge', 50]])
eq('default power prices match the spec', POWERS.map(p => [p.id, p.price]), [['priority_pin', 100], ['nudge', 50], ['vip_crown', 250], ['confetti', 50], ['focus_shield', 75], ['double_xp', 200], ['spotlight', 150], ['streak_saver', 150], ['team_boost', 500], ['custom_status', 100], ['gift', 100], ['mystery_box', 100]])
const wild = cleanConfig({ rules: { resolve: { on: false, coins: 99999, xp: -5 } }, caps: { coins: 'lots', targetHourly: 0 }, powers: { nudge: { price: 0, cooldown: 9e9 } }, leaderboard: 'public', who: { roles: ['admin', 'god', 'ADMIN'], locations: ['nope', 'f0000000-0000-4000-8000-000000000001'] } })
eq('a reward can’t be set above 500 coins or below 0 XP', [wild.rules.resolve.coins, wild.rules.resolve.xp, wild.rules.resolve.on], [500, 0, false])
eq('a cap that isn’t a number falls back to the default', wild.caps.coins, 150)
eq('a power costs at least 1 coin', wild.powers.nudge.price, 1)
eq('a cooldown is at most a week', wild.powers.nudge.cooldown, 10080)
eq('an unknown leaderboard mode falls back', wild.leaderboard, 'everyone')
eq('only known roles, once each', wild.who.roles, ['admin'])
eq('only real location ids', wild.who.locations, ['f0000000-0000-4000-8000-000000000001'])
eq('nothing saved means the defaults', JSON.stringify(cleanConfig(null)), JSON.stringify(d))

console.log('who takes part')
ok('everyone, when no lists are set', canTakePart(d, { role: 'editor' }))
const onlyAdmins = cleanConfig({ who: { roles: ['admin'] } })
ok('a role list leaves others out', !canTakePart(onlyAdmins, { role: 'editor' }) && canTakePart(onlyAdmins, { role: 'admin' }))
ok('the owner always takes part', canTakePart(onlyAdmins, { role: 'editor', isOwner: true }))
const oneShop = cleanConfig({ who: { locations: ['f0000000-0000-4000-8000-000000000001'] } })
ok('a location list leaves others (and no location) out', canTakePart(oneShop, { locationId: 'f0000000-0000-4000-8000-000000000001' }) && !canTakePart(oneShop, { locationId: 'f0000000-0000-4000-8000-000000000002' }) && !canTakePart(oneShop, {}))

console.log('real replies only')
for (const t of ['ok', 'Thanks!', 'ok thanks', 'yep', '👍', 'test', 'aaaaaaaaaaaaaa', 'Hi there', '   ', '<p>ok</p>', 'https://example.com/a-very-long-link-here'])
  ok(`not a real reply: ${JSON.stringify(t)}`, !isMeaningfulReply(t))
for (const t of ['Yes, the 60cm lids are back in stock, want me to hold two?', 'Your refund went through this morning.', 'Booked you in for 3pm Tuesday'])
  ok(`a real reply: ${JSON.stringify(t)}`, isMeaningfulReply(t))

console.log('trivial self-made tasks')
const me = 'b0000000-0000-4000-8000-000000000003'
const at = m => new Date(Date.parse('2026-11-16T10:00:00Z') + m * 60_000).toISOString()
ok('made by me and ticked 2 minutes later: trivial', isTrivialSelfTask({ created_by_id: me, created_at: at(0), completed_at: at(2) }, me))
ok('made by me, ticked the next day: fine', !isTrivialSelfTask({ created_by_id: me, created_at: at(0), completed_at: at(60 * 20) }, me))
ok('made by someone else and ticked straight away: fine', !isTrivialSelfTask({ created_by_id: 'x', created_at: at(0), completed_at: at(1) }, me))
ok('made by me with no times: treated as trivial', isTrivialSelfTask({ created_by_id: me }, me))

console.log('who a task pays')
const st = { enabled: true, enabledAt: '2026-11-01T00:00:00Z', config: d, tz: 'Australia/Melbourne', ownerId: null }
const task = (o = {}) => ({ id: 't1', status: 'done', done: true, created_by_id: 'b0000000-0000-4000-8000-000000000001', created_at: at(-120), completed_at: at(0), assigned_to_id: me, assignees: [{ id: me }], ...o })
eq('the assignee', taskCredit(task(), st, null), { ok: true, userId: me, idem: 'task:t1' })
eq('not done: nothing', taskCredit(task({ status: 'todo', done: false }), st, null).ok, false)
eq('no assignee: nothing (only assigned tasks count)', taskCredit(task({ assigned_to_id: null, assignees: [] }), st, null).why, 'unassigned')
eq('someone not assigned can’t claim it', taskCredit(task(), st, 'b0000000-0000-4000-8000-000000000004').why, 'not_assignee')
eq('a second assignee who ticked it gets it', taskCredit(task({ assignees: [{ id: me }, { id: 'b0000000-0000-4000-8000-000000000004' }] }), st, 'b0000000-0000-4000-8000-000000000004').userId, 'b0000000-0000-4000-8000-000000000004')
eq('one key per task, whoever gets it', taskCredit(task({ assignees: [{ id: me }, { id: 'b0000000-0000-4000-8000-000000000004' }] }), st, 'b0000000-0000-4000-8000-000000000004').idem, 'task:t1')
eq('finished before Powers was turned on: nothing', taskCredit(task({ completed_at: '2026-10-01T00:00:00Z' }), st, null).why, 'before_enabled')
eq('self-made and ticked at once: nothing', taskCredit(task({ created_by_id: me, created_at: at(-1) }), st, null).why, 'too_quick')
eq('status column missing, done flag set: counts', taskCredit(task({ status: undefined, done: true }), st, null).ok, true)

console.log('reviews that name a teammate')
const team = [{ id: 'a', name: 'Sam Lee' }, { id: 'b', name: 'Priya Nair' }, { id: 'c', name: 'Al Ng' }]
eq('names one teammate', teammateNamedIn('Priya was so helpful, thank you!', team), 'b')
eq('possessive works', teammateNamedIn("Sam's advice on the filter was spot on", team), 'a')
eq('two people named: nobody (can’t split it fairly)', teammateNamedIn('Sam and Priya were great', team), null)
eq('nobody named', teammateNamedIn('Great shop, fast delivery', team), null)
eq('short first names are ignored (too easy to match by accident)', teammateNamedIn('al the staff were lovely', team), null)
eq('part of a word doesn’t count', teammateNamedIn('Samuel helped me', team), null)
eq('two teammates with the same first name: nobody', teammateNamedIn('Sam was great', [...team, { id: 'd', name: 'Sam Ortiz' }]), null)

console.log('boosts, periods')
eq('Double XP doubles XP', boostedXp(10, { double: true }), 20)
eq('Team Boost is +50%', boostedXp(10, { team: true }), 15)
eq('both together', boostedXp(10, { double: true, team: true }), 30)
eq('week starts Monday', periodStart('2026-11-19', 'week'), '2026-11-16')
eq('a Monday is its own week start', periodStart('2026-11-16', 'week'), '2026-11-16')
eq('a Sunday belongs to the week before', periodStart('2026-11-22', 'week'), '2026-11-16')
eq('month starts on the 1st', periodStart('2026-11-19', 'month'), '2026-11-01')
eq('ISO week key', weekKey('2026-11-16'), '2026-W47')
eq('week key at a year boundary', weekKey('2027-01-01'), '2026-W53')

console.log('looks only')
ok('Mystery Box holds looks only (rings and name colours)', COSMETICS.every(c => c.kind === 'ring' || c.kind === 'name'))
ok('every badge has a name, hint and icon', ACHIEVEMENTS.every(a => a.name && a.hint && a.icon))
ok('no power is about permissions or access', POWERS.every(p => !/permission|access|admin/i.test(p.blurb)))

console.log('who a reply pays')
{
  const A = 'a0000000-0000-4000-8000-00000000000a', B = 'b0000000-0000-4000-8000-00000000000b'
  let n = 0
  const at = () => new Date(Date.UTC(2026, 10, 17, 9, n++)).toISOString()
  const v = (id, c = 'c1') => ({ id, conversation_id: c, sender_type: 'visitor', content: 'Hi, where is my order please?', created_at: at() })
  const a = (id, who, content = 'It left the warehouse this morning, tracking to follow.', extra = {}) => ({ id, conversation_id: extra.c || 'c1', sender_type: 'agent', sender_id: who, content, is_internal: !!extra.internal, metadata: extra.meta || null, created_at: at() })
  eq('one customer message, one real reply: pays the person who answered', creditReplies([v('v1'), a('m1', A)]).map(x => [x.userId, x.idem]), [[A, 'reply:v1']])
  eq('two replies in a row answer it once', creditReplies([v('v1'), a('m1', A), a('m2', B)]).length, 1)
  eq('the first real reply gets it, not the second person', creditReplies([v('v1'), a('m1', B), a('m2', A)])[0].userId, B)
  eq('three customer messages then one reply: one reward, keyed to the latest', creditReplies([v('v1'), v('v2'), v('v3'), a('m1', A)]).map(x => x.idem), ['reply:v3'])
  eq('back and forth pays each answer', creditReplies([v('v1'), a('m1', A), v('v2'), a('m2', A)]).map(x => x.idem), ['reply:v1', 'reply:v2'])
  eq('“ok thanks” doesn’t count, and doesn’t use up the answer', creditReplies([v('v1'), a('m1', A, 'ok thanks'), a('m2', B)]).map(x => x.userId), [B])
  eq('internal notes don’t count', creditReplies([v('v1'), a('m1', A, undefined, { internal: true })]).length, 0)
  eq('automatic and tracking messages don’t count', creditReplies([v('v1'), a('m1', A, undefined, { meta: { auto: true } }), a('m2', A, undefined, { meta: { tracking: true } })]).length, 0)
  eq('the AI (no person) doesn’t count', creditReplies([v('v1'), a('m1', 'colvy-ai')]).length, 0)
  eq('a reply with nobody waiting doesn’t count', creditReplies([a('m1', A)]).length, 0)
  eq('conversations are kept apart', creditReplies([v('v1', 'c1'), v('v2', 'c2'), a('m1', A, undefined, { c: 'c2' })]).map(x => [x.conversationId, x.idem]), [['c2', 'reply:v2']])
}

console.log('what a business uses')
ok('everything is offered by default', RULES.every(r => ruleAvailable(r.id, ALL_FEATURES)))
const noJobs = { ...ALL_FEATURES, jobs: false }
ok('no Jobs module: no job rule', !ruleAvailable('job', noJobs))
ok('…but replies, tasks and thanks stay', ['resolve', 'reply', 'task', 'thanks', 'active', 'time'].every(id => ruleAvailable(id, noJobs)))
ok('no phone line: no call rule', !ruleAvailable('call', { ...ALL_FEATURES, calls: false }))
ok('no store: no order rule', !ruleAvailable('order', { ...ALL_FEATURES, orders: false }))
ok('no Google reviews: no review rule', !ruleAvailable('feedback', { ...ALL_FEATURES, reviews: false }))
ok('badges about unused things say so', ['job_10', 'call_50', 'order_50', 'feedback_1'].every(c => ACHIEVEMENTS.find(a => a.code === c)?.needs))

console.log('per-day limits, time in Colvy')
{
  const d = defaultConfig()
  eq('defaults: replies 50 a day, calls 40, orders 50', [d.rules.reply.max, d.rules.call.max, d.rules.order.max], [50, 40, 50])
  eq('active once a day; time every 60 min, 8 a day', [d.rules.active.max, d.rules.time.every, d.rules.time.max], [1, 60, 8])
  const c = cleanConfig({ rules: { reply: { coins: 3, xp: 3, max: 9999 }, active: { coins: 5, xp: 5, max: 40 }, time: { coins: 5, xp: 10, max: 4, every: 2 } } })
  eq('a per-day limit stays under 500', c.rules.reply.max, 500)
  eq('active can’t pay more than once a day', c.rules.active.max, 1)
  eq('time can’t be shorter than 15 minutes', c.rules.time.every, 15)
  eq('…or longer than 8 hours', cleanConfig({ rules: { time: { every: 9999 } } }).rules.time.every, 480)
  eq('a saved config from before keeps the default limits', cleanConfig({ rules: { reply: { on: true, coins: 2, xp: 2 } } }).rules.reply.max, 50)
  eq('labels: every hour', everyLabel(60), 'Every hour in Colvy')
  eq('labels: every 2 hours', everyLabel(120), 'Every 2 hours in Colvy')
  eq('labels: every 30 minutes', everyLabel(30), 'Every 30 minutes in Colvy')
}

console.log(failed ? `\n${failed} failed, ${passed} passed` : `\nall ${passed} passed`)
process.exit(failed ? 1 : 0)
