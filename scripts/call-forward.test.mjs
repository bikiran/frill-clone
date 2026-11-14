// Runnable checks for forwarding to several phones at once (lib/call-routing):
// parsing and checking the extra numbers, the TwiML (one <Dial>, a <Number>
// per phone, the press-1 screen or a note of who answered), and the words the
// settings card and call trail use. Made-up numbers only.
//
//   node --experimental-strip-types scripts/call-forward.test.mjs   (or npx tsx)
import { cleanRouting, validateRouting, forwardTwiml, forwardNumbers, forwardWords, routingSummary, nextStep, planFor, stepLabel, MAX_FORWARD_ALSO } from '../lib/call-routing.ts'
let fails = 0
const ok = (c, n, x) => { console.log(c ? '✓' : '✗', n, c ? '' : JSON.stringify(x)); if (!c) fails++ }
const own = new Set(['+61390000000'])
const base = { strategy: 'forward', forward: { number: '0412 345 678', seconds: 20, screen: true, callerId: 'business', when: 'always', also: ['0413 111 222', '(03) 9123 4567', '0412 345 678', '0413 111 222'] } }
const v = validateRouting(base, { members: null, ownNumbers: own, forwardAllowed: true })
ok(v.ok, 'a forward with extra phones validates', v)
ok(JSON.stringify(v.config.forward.also) === JSON.stringify(['+61413111222', '+61391234567']), 'extra phones: E.164, the main number and repeats dropped', v.config.forward.also)
const bad = validateRouting({ ...base, forward: { ...base.forward, also: ['1300 123 456', '+44 7700 900123', '(03) 9000 0000'] } }, { members: null, ownNumbers: own, forwardAllowed: true })
ok(!bad.ok && bad.problems.length === 3 && /1300 123 456/.test(bad.problems[0]) && /own Colvy numbers/.test(bad.problems[2]), '1300, overseas and own numbers are refused', bad.problems)
const many = validateRouting({ ...base, forward: { ...base.forward, also: ['0413 000 001', '0413 000 002', '0413 000 003', '0413 000 004', '0413 000 005'] } }, { members: null, ownNumbers: own, forwardAllowed: true })
ok(!many.ok && many.problems.some((p) => /at most 5 phones/.test(p)), `more than ${MAX_FORWARD_ALSO} extra phones is refused`, many.problems)
const old = cleanRouting({ strategy: 'forward', forward: { number: '0412 345 678', seconds: 20, screen: true, callerId: 'business', when: 'always' } })
ok(Array.isArray(old.forward.also) && old.forward.also.length === 0, 'a config saved before this has no extra phones')
const c = cleanRouting(base)
const ctx = { base: 'https://x.test', callRowId: 'r1', companyId: 'c1', conversationId: 'v1', callerName: null, contactId: null, from: '+61400000001', to: '+61390000000', businessName: 'Brightline' }
const tw = forwardTwiml(ctx, c.forward, { route: 'main', step: 0 })
const nums = [...tw.matchAll(/<Number[^>]*>([^<]+)<\/Number>/g)].map(m => m[1])
ok(nums.join() === '+61412345678,+61413111222,+61391234567', 'one <Dial> with a <Number> per phone', nums)
ok((tw.match(/op=ask/g) || []).length === 3 && tw.split('<Dial').length === 2, 'each phone gets the press-1 screen, in one Dial', tw)
const quiet = forwardTwiml(ctx, { ...c.forward, screen: false }, { route: 'main', step: 0 })
ok((quiet.match(/op=note/g) || []).length === 3 && !/op=ask/.test(quiet), 'no screening, several phones: a note of which one answered', quiet)
const single = forwardTwiml(ctx, { ...c.forward, screen: false, also: [] }, { route: 'main', step: 0 })
ok(!/url=/.test(single) && (single.match(/<Number/g) || []).length === 1, 'one phone, no screening: unchanged from before', single)
ok(forwardWords(c.forward) === '0412 345 678 and 2 more phones at once', 'summary words', forwardWords(c.forward))
ok(/Calls forward to 0412 345 678 and 2 more phones at once for 20s \(they press 1 to take it\)/.test(routingSummary(c)), 'the card’s summary line', routingSummary(c))
const loop = cleanRouting({ ...base, forward: { ...base.forward, also: ['(03) 9000 0000'] } })
ok(forwardNumbers(loop.forward).length === 2, 'cleanRouting keeps what was saved (the API checks own numbers)')
const steps = planFor(loop, 'main', 25)
const r = nextStep(ctx, steps, 0, 'main', { ringable: ['u1'], closedNow: null, forwardAllowed: true, answered: false })
ok(!r || !r.forwardTo, 'a forward that would ring the number being called is skipped', r && r.forwardTo)
ok(stepLabel({ ringUsers: [], forwardTo: '+61412345678', forwardAlso: 2 }) === 'Forwarded to 0412 345 678 (+2 more at once)', 'the call trail label')
console.log(fails ? `${fails} FAILED` : 'all passed')
process.exit(fails ? 1 : 0)
