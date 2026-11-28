// Runnable tests for a missed-call automation's "Send a reply"
// (lib/automations/engine): a call filed in a website chat conversation (an
// order's thread, a chat the caller once started) is answered by text to the
// number that rang, through the same guarded path as a call-only thread; a
// chat visitor who didn't opt in to texts, or a customer who opted out, is not
// texted; and a reply that didn't go out is never written into the thread.
//
//   npx tsx scripts/automation-reply.test.mjs
//
// Zero-dependency: a small fake Supabase client stands in for the database and
// the text route is a stub, so nothing is sent and nothing leaves this machine.
// Made-up customers and numbers. Exits non-zero if any check fails.

let failures = 0
const ok = (cond, name, got) => { if (cond) console.log('  ok  ', name); else { failures++; console.log('  FAIL', name, got === undefined ? '' : JSON.stringify(got)) } }

function fakeDb(tables) {
  let seq = 0
  const from = (table) => {
    const q = { filters: [], op: 'select', patch: null, single: false, order: null, limit: null }
    const rows = () => (tables[table] ||= [])
    const match = r => q.filters.every(f => f(r))
    const run = async () => {
      if (q.op === 'update') { const hit = rows().filter(match); hit.forEach(r => Object.assign(r, q.patch)); return { data: q.single ? (hit[0] || null) : hit, error: null } }
      if (q.op === 'insert') {
        const list = (Array.isArray(q.patch) ? q.patch : [q.patch]).map(r => ({ id: r.id || `${table}-${++seq}`, created_at: new Date(Date.now() + seq).toISOString(), ...r }))
        rows().push(...list)
        return { data: q.single ? list[0] : list, error: null }
      }
      let r = rows().filter(match)
      if (q.order) { const [k, asc] = q.order; r = r.slice().sort((a, b) => (String(a[k] ?? '') < String(b[k] ?? '') ? -1 : String(a[k] ?? '') > String(b[k] ?? '') ? 1 : 0) * (asc ? 1 : -1)) }
      if (q.limit != null) r = r.slice(0, q.limit)
      return { data: q.single ? (r[0] || null) : r, error: null, count: r.length }
    }
    const chain = new Proxy({}, {
      get(_, prop) {
        switch (prop) {
          case 'then': return (res, rej) => run().then(res, rej)
          case 'eq': return (k, v) => { q.filters.push(r => r[k] === v); return chain }
          case 'neq': return (k, v) => { q.filters.push(r => r[k] !== v); return chain }
          case 'in': return (k, vs) => { q.filters.push(r => vs.includes(r[k])); return chain }
          case 'ilike': return (k, v) => { const want = String(v).toLowerCase().replace(/%/g, ''); q.filters.push(r => String(r[k] || '').toLowerCase().replace(/\D/g, '').includes(want)); return chain }
          case 'order': return (k, o) => { q.order = [k, o?.ascending !== false]; return chain }
          case 'limit': return (n) => { q.limit = n; return chain }
          case 'update': return (patch) => { q.op = 'update'; q.patch = patch; return chain }
          case 'insert': return (patch) => { q.op = 'insert'; q.patch = patch; return chain }
          case 'maybeSingle': case 'single': return () => { q.single = true; return run() }
          default: return () => chain   // select, gt, gte, lt…
        }
      },
    })
    return chain
  }
  // automation_start_run: one run per flow and call, as the real function allows.
  const started = new Set()
  const rpc = async (name, args) => {
    if (name !== 'automation_start_run') return { data: null, error: null }
    const key = `${args.p_automation}|${args.p_event}`
    if (started.has(key)) return { data: { ok: false }, error: null }
    started.add(key)
    const id = `run-${started.size}`
    ;(tables.automation_runs ||= []).push({ id, automation_id: args.p_automation, status: 'running', steps: [] })
    return { data: { ok: true, run_id: id }, error: null }
  }
  return { from, rpc, tables }
}

// The text route (/api/telnyx/sms/send) is the only thing that would send:
// answered here, and every request to it kept.
process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'http://127.0.0.1:1'
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test-only'
let texts = []
let textRoute = () => ({ status: 200, body: { ok: true, id: 'SM1' } })
globalThis.fetch = async (url, init) => {
  if (String(url).endsWith('/api/telnyx/sms/send')) {
    const sent = JSON.parse(init?.body || '{}')
    texts.push(sent)
    const r = textRoute(sent)
    return new Response(JSON.stringify(r.body), { status: r.status, headers: { 'content-type': 'application/json' } })
  }
  return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
}

const { runMissedCallAutomations, missedCallInChat } = await import('../lib/automations/engine.ts')

const CO = 'co-1'
const CALLER = '+61400111222', OTHER = '+61400999888'
const REPLY = 'Sorry we missed you! Reply here and we’ll help.'
const flow = {
  id: 'flow-1', company_id: CO, name: 'Missed call reply', enabled: true, trigger_type: 'missed_call', created_at: '2026-11-01T00:00:00Z',
  graph: {
    nodes: [
      { id: 't', kind: 'trigger', x: 0, y: 0, config: { type: 'missed_call' } },
      { id: 'r', kind: 'reply', x: 0, y: 0, config: { text: REPLY } },
    ],
    edges: [{ id: 'e1', from: 't', port: 'out', to: 'r' }],
  },
}
const world = (conv, contact = {}) => fakeDb({
  automations: [flow],
  companies: [{ id: CO, name: 'Reef & Co', plan: 'everything', trial_ends_at: null }],
  company_entitlements: [{ company_id: CO, features: { aiAutomation: true } }],
  calls: [{ id: 'call-1', company_id: CO, direction: 'inbound', status: 'no-answer', from_number: CALLER, to_number: '+61380001111', conversation_id: 'cv-1', contact_id: 'ct-1', created_at: new Date().toISOString() }],
  contacts: [{ id: 'ct-1', company_id: CO, name: 'Emma Lane', phone: CALLER, phone_norm: '400111222', source: 'order', ...contact }],
  conversations: [{ id: 'cv-1', company_id: CO, contact_id: 'ct-1', channel: 'chat', sms_number: CALLER, sms_enabled: true, page_seen_at: null, created_at: '2026-11-20T00:00:00Z', ...conv }],
  messages: [], sms_keywords: [], automation_runs: [],
})
const run = async (db) => { texts = []; return runMissedCallAutomations(db, CO, 'call-1') }
const replies = db => db.tables.messages.filter(m => m.metadata?.automation_id === 'flow-1')
const step = db => (db.tables.automation_runs[0]?.steps || []).find(s => s.kind === 'reply')

console.log('Which missed calls are answered by text')
ok(missedCallInChat('missed_call', 'chat') && missedCallInChat('missed_call', 'widget') && missedCallInChat('missed_call', null), 'a call filed in a website chat conversation')
ok(!missedCallInChat('missed_call', 'email') && !missedCallInChat('missed_call', 'facebook') && !missedCallInChat('missed_call', 'whatsapp'), 'not an email or social thread: those keep their own channel')
ok(!missedCallInChat('message', 'chat') && !missedCallInChat('message', 'widget'), 'a customer’s chat message is still answered in the chat')

console.log('A missed call filed in an order’s chat thread')
{
  const db = world({})
  const res = await run(db)
  ok(res.ran === 1 && res.replied === true, 'the automation ran and replied', res)
  ok(texts.length === 1 && texts[0].to === CALLER && texts[0].text === REPLY, 'texted once, to the number that rang', texts)
  ok(texts[0]?.skipChatMessage === true && texts[0]?.conversationId === 'cv-1', 'through the text route, which checks opt-outs and writes no second row')
  const rows = replies(db)
  ok(rows.length === 1 && rows[0].delivery_channel === 'sms' && rows[0].content === REPLY, 'saved once in the thread, as a text', rows)
  ok(db.tables.conversations[0].channel === 'chat', 'the conversation stays a chat conversation')
  ok(step(db)?.ok === true, 'the run records the reply as sent', step(db))
  const again = await run(db)
  ok(again.ran === 0 && texts.length === 0 && replies(db).length === 1, 'the same call never sends a second text', { again, texts })
}

console.log('The caller rang from a number the thread doesn’t hold')
{
  const db = world({ sms_number: OTHER })
  await run(db)
  ok(texts.length === 1 && texts[0].to === CALLER, 'the text goes to the number that rang, not the thread’s other number', texts)
}

console.log('Who is not texted')
{
  const widget = world({ channel: 'widget', visitor_id: 'v-1', sms_enabled: false }, { source: 'widget' })
  const res = await run(widget)
  ok(texts.length === 0, 'a website chat visitor who didn’t opt in to texts', texts)
  ok(replies(widget).length === 0 && res.replied === false, 'and nothing is written into the thread as if it went', replies(widget))
  ok(step(widget)?.ok === false && /opt in to texts/.test(step(widget)?.note || ''), 'the run says why', step(widget))

  const ticked = world({ channel: 'widget', visitor_id: 'v-1', sms_enabled: true }, { source: 'widget' })
  await run(ticked)
  ok(texts.length === 1 && replies(ticked)[0]?.delivery_channel === 'sms', 'a chat visitor who ticked “continue by text” is texted')

  const stopped = world({}, { unsubscribed_at: '2026-11-01T00:00:00Z' })
  const out = await run(stopped)
  ok(texts.length === 0 && replies(stopped).length === 0 && out.replied === false, 'a customer who opted out of texts', texts)
  ok(/opted out/.test(step(stopped)?.note || ''), 'the run says they opted out', step(stopped))

  const blocked = world({}, { is_blocked: true })
  const b = await run(blocked)
  ok(texts.length === 0 && replies(blocked).length === 0 && b.ran === 0, 'a blocked customer: nothing runs at all', b)
}

console.log('The text is refused')
{
  textRoute = () => ({ status: 409, body: { error: 'This customer has opted out of texts (they replied STOP), so it wasn’t texted.', optedOut: true } })
  const db = world({})
  const res = await run(db)
  ok(texts.length === 1 && replies(db).length === 0 && res.replied === false, 'nothing is written into the thread', replies(db))
  ok(step(db)?.ok === false && /Not sent/.test(step(db)?.note || ''), 'the run records it as not sent', step(db))
  textRoute = () => ({ status: 200, body: { ok: true, id: 'SM1' } })
}

console.log('Other threads are answered as before')
{
  const phone = world({ channel: 'phone' })
  await run(phone)
  ok(texts.length === 1 && texts[0].to === CALLER && replies(phone)[0]?.delivery_channel === 'sms', 'a call-only thread: by text')
  const sms = world({ channel: 'sms' })
  await run(sms)
  ok(texts.length === 1 && texts[0].to === CALLER && replies(sms)[0]?.delivery_channel === 'sms', 'a text thread: by text')
}

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed')
process.exit(failures ? 1 : 0)
