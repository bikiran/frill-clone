// Colvy Automations: the parts that need no database. Cleaning a posted flow
// (unknown steps, bad links, loops, a second trigger), what must be fixed
// before it goes live, the checks (keywords, channels, hours, tags), trigger
// rules, filling in names, the dry run and the starting templates.
//
//   npx tsx scripts/automations.test.mjs
//
// The run bookkeeping runs against real Postgres in scripts/automations-sql.test.mjs.

import {
  cleanGraph, problems, mentions, check, triggerFires, fill, simulate, waitLabel, normChannel,
  TEMPLATES, templateGraph, KINDS, NODE_KINDS, LIMITS, defaultConfig, cleanConfig, describe,
} from '../lib/automations/graph.ts'
import { aiStandsDown } from '../lib/automations/engine.ts'

let passed = 0, failed = 0
function ok(name, cond) { if (cond) { passed++; console.log('  ✓', name) } else { failed++; console.error('  ✗', name) } }
function eq(name, a, b) { ok(`${name} (got ${JSON.stringify(a)})`, JSON.stringify(a) === JSON.stringify(b)) }

const node = (id, kind, config = {}) => ({ id, kind, x: 0, y: 0, config: { ...defaultConfig(kind), ...config } })
const edge = (from, port, to) => ({ id: `e_${from}_${port}`, from, port, to })
const facts = (f = {}) => ({ trigger: 'message', text: '', channel: 'chat', openNow: true, tags: [], isNew: false, unanswered: true, ...f })

console.log('cleaning a flow')
{
  const g = cleanGraph({
    nodes: [
      node('t', 'trigger'), node('t2', 'trigger'), node('k', 'if_keyword', { words: 'Refund, money back ,refund' }),
      node('r', 'reply', { text: 'Hi' }), { id: 'bad id!', kind: 'reply', config: {} }, { id: 'x', kind: 'launch_rocket', config: {} },
      node('r', 'reply'),
    ],
    edges: [edge('t', 'out', 'k'), edge('k', 'yes', 'r'), edge('k', 'yes', 't'), edge('k', 'out', 'r'), edge('r', 'out', 'k'), edge('k', 'no', 'ghost'), edge('k', 'no', 'k')],
  })
  eq('one trigger, unknown kinds and bad or repeated ids dropped', g.nodes.map(n => n.id), ['t', 'k', 'r'])
  eq('words cleaned: trimmed, lower case, no repeats', g.nodes[1].config.words, ['refund', 'money back'])
  eq('only valid links kept: no link into the trigger, no wrong port, no loop, no missing step, no self-link', g.edges.map(e => `${e.from}:${e.port}>${e.to}`), ['t:out>k', 'k:yes>r'])
  const g2 = cleanGraph({ nodes: [node('t', 'trigger'), node('a', 'tag', { tag: 'x' }), node('b', 'tag', { tag: 'y' })], edges: [edge('t', 'out', 'a'), edge('t', 'out', 'b')] })
  eq('one next step per port (the first link wins)', g2.edges.map(e => e.to), ['a'])
  ok('rubbish in, empty flow out', JSON.stringify(cleanGraph('nope')) === '{"nodes":[],"edges":[]}' && JSON.stringify(cleanGraph(null)) === '{"nodes":[],"edges":[]}')
  const many = cleanGraph({ nodes: Array.from({ length: 60 }, (_, i) => node(`n${i}`, 'tag', { tag: 'x' })) })
  eq('at most 40 steps', many.nodes.length, LIMITS.nodes)
  eq('a wait is kept between 1 minute and 7 days', [cleanConfig('wait', { minutes: 0 }).minutes, cleanConfig('wait', { minutes: 99999 }).minutes, cleanConfig('wait', { minutes: 'x' }).minutes], [1, 10080, 15])
  eq('a reply is cut at 1,000 characters', cleanConfig('reply', { text: 'a'.repeat(1500) }).text.length, 1000)
  eq('an assignee must be a real id', cleanConfig('assign', { userId: "1' or 1=1" }).userId, '')
  eq('channels: known ones only, website chat called chat', cleanConfig('if_channel', { channels: ['widget', 'messenger', 'carrier pigeon', 'sms', 'sms'] }).channels, ['chat', 'facebook', 'sms'])
  eq('positions are kept in bounds', cleanGraph({ nodes: [{ id: 't', kind: 'trigger', x: 1e9, y: -1e9 }] }).nodes[0].x, 5000)
  ok('every kind has a label, ports and a hint', NODE_KINDS.every(k => KINDS[k].label && KINDS[k].ports.length && KINDS[k].hint))
}

console.log('what to fix before it goes live')
{
  eq('no trigger', problems({ nodes: [], edges: [] }).map(p => p.message), ['Add a trigger: what starts this automation.'])
  const lonely = cleanGraph({ nodes: [node('t', 'trigger')] })
  ok('a trigger with nothing after it', problems(lonely).some(p => p.nodeId === 't'))
  const g = cleanGraph({
    nodes: [node('t', 'trigger'), node('k', 'if_keyword'), node('r', 'reply'), node('a', 'assign'), node('stray', 'tag', { tag: 'x' })],
    edges: [edge('t', 'out', 'k'), edge('k', 'yes', 'r'), edge('r', 'out', 'a')],
  })
  const msgs = problems(g)
  ok('empty words', msgs.some(p => p.nodeId === 'k' && /word/.test(p.message)))
  ok('empty reply', msgs.some(p => p.nodeId === 'r' && /reply/.test(p.message)))
  ok('nobody to assign', msgs.some(p => p.nodeId === 'a' && /assign/.test(p.message)))
  ok('a step nothing leads to', msgs.some(p => p.nodeId === 'stray' && /Not connected/.test(p.message)))
  const check1 = cleanGraph({ nodes: [node('t', 'trigger'), node('h', 'if_hours')], edges: [edge('t', 'out', 'h')] })
  ok('a check with neither way connected', problems(check1).some(p => p.nodeId === 'h' && /yes/.test(p.message)))
  const call = cleanGraph({ nodes: [node('t', 'trigger', { type: 'missed_call' }), node('k', 'if_keyword', { words: ['x'] }), node('n', 'note', { text: 'x' })], edges: [edge('t', 'out', 'k'), edge('k', 'yes', 'n')] })
  ok('a missed call has no message to check', problems(call).some(p => p.nodeId === 'k' && /missed call/.test(p.message)))
  const waits = { nodes: [node('t', 'trigger')], edges: [] }
  let prev = 't'
  for (let i = 0; i < 6; i++) { waits.nodes.push(node(`w${i}`, 'wait')); waits.edges.push(edge(prev, 'out', `w${i}`)); prev = `w${i}` }
  ok('at most 5 waits on one path', problems(cleanGraph(waits)).some(p => /waits/.test(p.message)))
  for (const t of TEMPLATES) {
    const p = problems(templateGraph(t.id)).filter(x => !['assign'].includes(templateGraph(t.id).nodes.find(n => n.id === x.nodeId)?.kind))
    if (t.id === 'blank') ok('“Start from scratch” needs a first step', p.length === 1)
    else eq(`template “${t.name}” is complete (apart from picking a teammate)`, p.map(x => x.message), [])
  }
}

console.log('checks')
{
  ok('a word, any case and plural', mentions('Can I get a REFUNDS please?', ['refund']))
  ok('a phrase', mentions('i want my money back!!', ['money back']))
  ok('whole words only', !mentions('we prefund orders', ['refund']))
  ok('accents ignored', mentions('Le café est fermé?', ['cafe']))
  ok('none of them', !mentions('Where is my parcel', ['refund', 'return']))
  ok('an empty word never matches', !mentions('anything', ['']))
  const k = node('k', 'if_keyword', { words: ['refund', 'return'] })
  ok('keyword check: yes', check(k, facts({ text: 'how do returns work' })) && !check(k, facts({ text: 'hello' })))
  const ch = node('c', 'if_channel', { channels: ['sms', 'chat'] })
  ok('channel check: website chat counts as chat', check(ch, facts({ channel: 'widget' })) && !check(ch, facts({ channel: 'email' })))
  const closed = node('h', 'if_hours', { when: 'closed' }), open = node('h2', 'if_hours', { when: 'open' })
  ok('hours: closed', check(closed, facts({ openNow: false })) && !check(closed, facts({ openNow: true })))
  ok('hours: open', check(open, facts({ openNow: true })) && !check(open, facts({ openNow: false })))
  ok('hours unknown count as closed', check(closed, facts({ openNow: null })) && !check(open, facts({ openNow: null })))
  ok('tag check ignores case', check(node('g', 'if_tag', { tag: 'VIP' }), facts({ tags: ['vip', 'wholesale'] })))
  ok('new customer and still waiting', check(node('n', 'if_new'), facts({ isNew: true })) && !check(node('u', 'if_unanswered'), facts({ unanswered: false })))
  eq('channels named the builder’s way', ['widget', 'live_chat', '', 'messenger', 'sms'].map(normChannel), ['chat', 'chat', 'chat', 'facebook', 'sms'])
}

console.log('triggers')
{
  const t = node('t', 'trigger', { channels: ['sms'], firstOnly: true })
  eq('right channel, first message: fires', triggerFires(t, { type: 'message', channel: 'sms', firstMessage: true }), null)
  eq('another channel', triggerFires(t, { type: 'message', channel: 'widget', firstMessage: true }), 'channel not chosen')
  eq('not the first message', triggerFires(t, { type: 'message', channel: 'sms', firstMessage: false }), 'not the first message')
  eq('a missed call doesn’t start a message flow', triggerFires(t, { type: 'missed_call', channel: 'phone', firstMessage: false }), 'different trigger')
  eq('any channel when none picked', triggerFires(node('t', 'trigger'), { type: 'message', channel: 'instagram', firstMessage: false }), null)
}

console.log('filling in names')
{
  eq('known names', fill('Hi {first_name}, thanks for contacting {business_name}', { firstName: 'Jordan', business: 'Brightline Plumbing' }), 'Hi Jordan, thanks for contacting Brightline Plumbing')
  eq('unknown: friendly words', fill('Hi {first_name}! Love, {business_name}', {}), 'Hi there! Love, us')
  eq('spaces and case inside the braces', fill('{ FIRST_NAME }', { firstName: 'Sam' }), 'Sam')
  eq('wait labels', [5, 60, 90, 120, 1440, 2880].map(waitLabel), ['5 min', '1 hour', '90 min', '2 hours', '1 day', '2 days'])
}

console.log('dry run')
{
  const g = templateGraph('refunds')
  const yes = simulate(g, facts({ text: 'I need a refund' }))
  eq('refund: the person path', yes.map(s => s.kind), ['trigger', 'if_keyword', 'pause_ai', 'assign', 'task'])
  eq('the check says yes', yes[1].result, 'yes')
  const no = simulate(g, facts({ text: 'what time do you open?' }))
  eq('anything else: Colvy AI', no.map(s => s.kind), ['trigger', 'if_keyword', 'ai'])
  const ah = simulate(templateGraph('after_hours'), facts({ openNow: true }))
  eq('after-hours reply while open: stops at the check', ah.map(s => `${s.kind}${s.result ? ':' + s.result : ''}`), ['trigger', 'if_hours:no'])
  const ah2 = simulate(templateGraph('after_hours'), facts({ openNow: false }))
  ok('…and replies when closed', ah2.at(-1).kind === 'reply' && /closed/.test(ah2.at(-1).does))
  eq('waits are shown as steps', simulate(templateGraph('no_reply'), facts()).map(s => s.kind), ['trigger', 'wait', 'if_unanswered', 'notify'])
  eq('an empty flow: nothing', simulate({ nodes: [], edges: [] }, facts()), [])
  ok('describe says what a step does', describe(node('w', 'wait', { minutes: 120 })) === 'Wait 2 hours' && /Website chat/.test(describe(node('t', 'trigger', { channels: ['chat'] }))))
}

console.log('templates')
{
  ok('six starting points, each with a name and about', TEMPLATES.length === 6 && TEMPLATES.every(t => t.name && t.about))
  ok('each comes back clean and with one trigger', TEMPLATES.every(t => { const g = templateGraph(t.id); return g.nodes.filter(n => n.kind === 'trigger').length === 1 && JSON.stringify(cleanGraph(g)) === JSON.stringify(g) }))
  ok('a copy, not the template itself', templateGraph('refunds') !== templateGraph('refunds') && (templateGraph('refunds').nodes[0].x = 999, templateGraph('refunds').nodes[0].x !== 999))
  eq('unknown template: start from scratch', templateGraph('nope').nodes.map(n => n.kind), ['trigger'])
  eq('missed-call template', templateGraph('missed_call').nodes[0].config.type, 'missed_call')
}

console.log('Colvy AI standing down')
{
  eq('nothing ran', aiStandsDown({ ran: 0, replied: false, handToAi: false, paused: false }), null)
  ok('an automation replied', /already replied/.test(aiStandsDown({ ran: 1, replied: true, handToAi: false, paused: false })))
  eq('replied but handed to Colvy AI', aiStandsDown({ ran: 1, replied: true, handToAi: true, paused: false }), null)
  ok('paused wins', /paused/.test(aiStandsDown({ ran: 1, replied: false, handToAi: true, paused: true })))
  eq('no result', aiStandsDown(null), null)
}

console.log(failed ? `\n${failed} failed, ${passed} passed` : `\nall ${passed} passed`)
process.exit(failed ? 1 : 0)
