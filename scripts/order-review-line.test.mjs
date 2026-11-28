// Runnable tests for the Google review reminder on Completed order messages
// (lib/order-messages withReviewLine, used by lib/order-automation and the
// WooCommerce webhook): the reminder is part of the ONE Completed message, so
// it is delivered with it (one thread row, one send) instead of sitting in the
// thread as a second row nobody was ever sent; not for a customer who already
// left a Google review, and not on any other status.
//
//   npx tsx scripts/order-review-line.test.mjs
//
// Zero-dependency: a small fake Supabase client stands in for the database and
// the text / email routes are stubs, so nothing is sent and nothing leaves this
// machine. Made-up customers and orders. Exits non-zero if any check fails.

let failures = 0
const ok = (cond, name, got) => { if (cond) console.log('  ok  ', name); else { failures++; console.log('  FAIL', name, got === undefined ? '' : JSON.stringify(got)) } }

function fakeDb(tables) {
  let seq = 0
  const like = (pattern) => new RegExp('^' + String(pattern).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*') + '$', 'i')
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
          case 'match': return (o) => { q.filters.push(r => Object.entries(o).every(([k, v]) => r[k] === v)); return chain }
          case 'in': return (k, vs) => { q.filters.push(r => vs.includes(r[k])); return chain }
          case 'ilike': return (k, v) => { const re = like(v); q.filters.push(r => re.test(String(r[k] ?? ''))); return chain }
          // metadata->>order_automation in (a,b): the one-message-an-hour check.
          case 'filter': return (k, op, v) => {
            const key = String(k).split('->>')[1]
            const list = String(v).replace(/[()]/g, '').split(',')
            if (key && op === 'in') q.filters.push(r => list.includes(String(r.metadata?.[key] ?? '')))
            return chain
          }
          case 'order': return (k, o) => { q.order = [k, o?.ascending !== false]; return chain }
          case 'limit': return (n) => { q.limit = n; return chain }
          case 'update': return (patch) => { q.op = 'update'; q.patch = patch; return chain }
          case 'insert': case 'upsert': return (patch) => { q.op = 'insert'; q.patch = patch; return chain }
          case 'maybeSingle': case 'single': return () => { q.single = true; return run() }
          default: return () => chain   // select, gte, lte, or…
        }
      },
    })
    return chain
  }
  const rpc = async () => ({ data: null, error: null })
  return { from, rpc, tables }
}

// The only two ways out: the text route and the email route. Both answered
// here, and every request kept. Anything else (alerts, link attribution) gets
// an empty answer.
process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'http://127.0.0.1:1'
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test-only'
let sends = []
globalThis.fetch = async (url, init) => {
  const u = String(url)
  const json = (body) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
  if (u.endsWith('/api/telnyx/sms/send')) { const b = JSON.parse(init?.body || '{}'); sends.push({ via: 'sms', text: b.text, skipChatMessage: b.skipChatMessage }); return json({ ok: true, id: 'SM1' }) }
  if (u.endsWith('/api/email/reply')) { const b = JSON.parse(init?.body || '{}'); sends.push({ via: 'email', text: b.content, skipChatMessage: b.skipChatMessage }); return json({ ok: true, id: 'em1' }) }
  return json(u.includes('/rest/v1/') ? [] : {})
}

const { withReviewLine, DEFAULT_ORDER_MESSAGES } = await import('../lib/order-messages.ts')
const { analyseSms } = await import('../lib/sms-segments.ts')
const { runOrderAutomation } = await import('../lib/order-automation.ts')

const REVIEW = 'https://g.page/r/example/review'

console.log('The reminder is added to the Completed message')
{
  const body = 'Hi Emma, your order #1042 has been dispatched. Thanks for choosing Reef & Co!'
  const out = withReviewLine(body, REVIEW)
  ok(out.startsWith(body) && out.endsWith(REVIEW) && out.includes('\n\n'), 'after the message, on its own paragraph', out)
  ok(/leave us a Google review here: /.test(out), 'with the same request as before', out)
  ok(withReviewLine(body, '') === body && withReviewLine(body, null) === body && withReviewLine(body, '   ') === body, 'no link saved → the message as it was')
  const filled = k => DEFAULT_ORDER_MESSAGES[k].replace('{name}', 'Emma').replace('{order}', '1042').replace('{business}', 'Reef & Co')
  ok(['completed', 'completed_no_tracking', 'completed_pickup'].every(k => analyseSms(withReviewLine(filled(k), REVIEW)).encoding === 'GSM-7'), 'it keeps a default Completed text in the ordinary (cheaper) encoding')
}

const CO = 'co-1'
const order = (over = {}) => ({
  channel: 'shopify', externalId: '5001', number: '1042', status: 'completed', total: 89.5, currency: 'AUD',
  email: 'emma@example.test', phone: null, firstName: 'Emma', lastName: 'Lane', address: null, isPos: false,
  shippingMethod: 'Flat rate', createdAt: new Date(Date.now() - 86_400_000).toISOString(), ...over,
})
const hooks = { priorConversationId: async () => null, persist: async () => {} }
const world = (extra = {}) => fakeDb({
  companies: [{ id: CO, name: 'Reef & Co', order_chat_automation: { enabled: true, review_url: REVIEW } }],
  contacts: [{ id: 'ct-1', company_id: CO, name: 'Emma Lane', email: 'emma@example.test', phone: null }],
  conversations: [], messages: [], order_chat_events: [], google_reviews: [], scheduled_messages: [], sms_keywords: [],
  ...extra,
})
const go = async (db, o) => { sends = []; await runOrderAutomation(db, CO, o, hooks) }
const sentRows = db => db.tables.messages.filter(m => m.sender_type === 'agent')

console.log('A completed order, customer reached by email')
{
  const db = world()
  await go(db, order())
  const rows = sentRows(db)
  ok(rows.length === 1 && rows[0].metadata?.order_automation === 'completed', 'one message in the thread, not two', rows.map(r => r.metadata))
  ok(/order #1042/.test(rows[0]?.content || '') && (rows[0]?.content || '').endsWith(REVIEW), 'it carries the Completed message and the review link', rows[0]?.content)
  ok(sends.length === 1 && sends[0].via === 'email' && sends[0].text === rows[0]?.content, 'sent once, and what was sent is what the thread shows', sends)
  ok(sends[0]?.skipChatMessage === true, 'the send writes no second row')
  ok(rows[0]?.delivery_channel === 'email', 'the row says Email because it went by email', rows[0]?.delivery_channel)
  ok(!db.tables.messages.some(m => m.metadata?.order_automation === 'review'), 'no separate, never-sent review row any more')

  await go(db, order())
  ok(sends.length === 0 && sentRows(db).length === 1, 'the same order and status again sends nothing more', sends)
}

console.log('A completed order, customer reached by text')
{
  const db = world({
    contacts: [{ id: 'ct-1', company_id: CO, name: 'Emma Lane', email: null, phone: '+61400111222', phone_norm: '400111222' }],
    twilio_integrations: [{ company_id: CO, account_sid: 'ACtest', auth_token: 'test', phone_number: '+61480000001', sms_enabled: true }],
  })
  await go(db, order({ email: null, phone: '+61400111222' }))
  const rows = sentRows(db)
  // In sending hours it is texted now; outside them the same one text is queued for the morning.
  const queued = db.tables.scheduled_messages
  const texts = [...sends.filter(s => s.via === 'sms').map(s => s.text), ...queued.map(q => q.message)]
  ok(rows.length === 1 && (rows[0]?.content || '').endsWith(REVIEW), 'one message in the thread, with the review link', rows.map(r => r.content))
  ok(texts.length === 1 && texts[0] === rows[0]?.content, 'one text (sent, or held for sending hours), carrying both parts', { sends, queued })
  ok(sends.every(s => s.via === 'sms'), 'and nothing else is sent', sends)
}

console.log('When the reminder is left out')
{
  const reviewed = world({ google_reviews: [{ id: 'gr-1', company_id: CO, contact_id: 'ct-1', star_rating: 5, review_created_at: '2026-10-01T00:00:00Z' }] })
  await go(reviewed, order())
  ok(sentRows(reviewed).length === 1 && !sentRows(reviewed)[0].content.includes(REVIEW) && sends.length === 1 && !sends[0].text.includes(REVIEW), 'a customer who already left a Google review isn’t asked again', sentRows(reviewed).map(r => r.content))

  const paid = world()
  await go(paid, order({ status: 'processing' }))
  ok(sentRows(paid).length === 1 && !sentRows(paid)[0].content.includes(REVIEW) && sends.length === 1, 'an order that isn’t completed yet: the usual message only', sentRows(paid).map(r => r.content))

  const noLink = world({ companies: [{ id: CO, name: 'Reef & Co', order_chat_automation: { enabled: true } }] })
  await go(noLink, order())
  ok(sentRows(noLink).length === 1 && !/Google review/.test(sentRows(noLink)[0].content) && sends.length === 1, 'no review link saved: the Completed message as it always was', sentRows(noLink).map(r => r.content))
}

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed')
process.exit(failures ? 1 : 0)
