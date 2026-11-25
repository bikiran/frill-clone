// Runnable tests for "reply to the number that last texted": a customer who
// texts from a second mobile is answered on it, and on their usual mobile when
// they text from that again (lib/reply-number, lib/same-customer, and the
// incoming-text routing in lib/inbound-sms).
//
//   npx tsx scripts/reply-number.test.mjs
//
// Zero-dependency: a small fake Supabase client stands in for the database,
// and nothing leaves this machine. Made-up customers and numbers. Exits
// non-zero if any check fails.

let failures = 0
const ok = (cond, name, got) => { if (cond) console.log('  ok  ', name); else { failures++; console.log('  FAIL', name, got === undefined ? '' : JSON.stringify(got)) } }

// ── A small fake Supabase client ─────────────────────────────────────────────
// Tables it doesn't hold answer with nothing, so the follow-on work after a
// text arrives (alerts, keyword replies, listings…) runs and finds nothing.
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
      if (q.op === 'delete') { const keep = rows().filter(r => !match(r)); tables[table] = keep; return { data: null, error: null } }
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
          case 'is': return (k, v) => { q.filters.push(r => v === null ? r[k] == null : r[k] === v); return chain }
          case 'not': return (k, op, v) => { if (op === 'is' && v === null) q.filters.push(r => r[k] != null); return chain }
          case 'in': return (k, vs) => { q.filters.push(r => vs.includes(r[k])); return chain }
          case 'ilike': return (k, v) => { q.filters.push(r => String(r[k] || '').toLowerCase() === String(v).toLowerCase()); return chain }
          case 'order': return (k, o) => { q.order = [k, o?.ascending !== false]; return chain }
          case 'limit': return (n) => { q.limit = n; return chain }
          case 'update': return (patch) => { q.op = 'update'; q.patch = patch; return chain }
          case 'insert': case 'upsert': return (patch) => { q.op = 'insert'; q.patch = patch; return chain }
          case 'delete': return () => { q.op = 'delete'; return chain }
          case 'maybeSingle': case 'single': return () => { q.single = true; return run() }
          default: return () => chain   // select, gte, lt, or, contains, range…
        }
      },
    })
    return chain
  }
  const rpc = async () => ({ data: null, error: null })
  return { from, rpc, tables }
}

// Alerts, AI and the like are fire-and-forget requests: answered here, never
// sent. A step that makes its own database client gets a local address that
// the stub answers.
process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'http://127.0.0.1:1'
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test-only'
globalThis.fetch = async () => new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })

const rn = await import('../lib/reply-number.ts')
const sc = await import('../lib/same-customer.ts')
const inbound = await import('../lib/inbound-sms.ts')

const CO = 'co-1'
const MAIN = '+61400111222', SECOND = '+61400999888'

console.log('Which number a text moves replies to')
{
  ok(rn.replyNumberFor({ sms_number: MAIN }, SECOND) === SECOND, 'a text from another mobile → that mobile')
  ok(rn.replyNumberFor({ sms_number: MAIN }, MAIN) === null, 'the same number → no change')
  ok(rn.replyNumberFor({ sms_number: '0400 111 222' }, MAIN) === null, 'the same number written differently → no change')
  ok(rn.replyNumberFor({ sms_number: null }, SECOND) === SECOND, 'no number yet → the one texting')
  ok(rn.replyNumberFor({ sms_number: MAIN }, SECOND, { optingOut: true }) === null, 'a STOP from the other mobile → replies stay on the usual one')
  ok(rn.replyNumberFor({ sms_number: null }, SECOND, { optingOut: true }) === SECOND, 'a STOP on a thread with no number → recorded, as before')
  ok(rn.replyNumberFor({ sms_number: MAIN }, '') === null, 'no sender → no change')
  ok(rn.phoneOf(SECOND) === SECOND && rn.phoneOf('0400 999 888') === '0400 999 888', 'a sender that is a number')
  ok(rn.phoneOf('Emma Lane') === null && rn.phoneOf('12345') === null && rn.phoneOf('') === null, 'a name or short code is not')
}

const world = () => fakeDb({
  contacts: [
    { id: 'ct-emma', company_id: CO, name: 'Emma Lane', email: 'emma@example.test', phone: MAIN, phone_norm: '400111222' },
    { id: 'ct-bare', company_id: CO, name: null, email: null, phone: SECOND, phone_norm: '400999888' },
  ],
  conversations: [
    { id: 'cv-emma', company_id: CO, contact_id: 'ct-emma', channel: 'sms', sms_number: MAIN, sms_enabled: true, last_message: 'Thanks', last_message_at: '2026-11-24T10:00:00Z', merged_into: null, unread_count: 0 },
    { id: 'cv-bare', company_id: CO, contact_id: 'ct-bare', channel: 'sms', sms_number: SECOND, sms_enabled: true, last_message: '808 Example Hwy', last_message_at: '2026-11-25T09:00:00Z', merged_into: null, unread_count: 0 },
  ],
  messages: [
    { id: 'm1', conversation_id: 'cv-emma', sender_type: 'visitor', sender_name: MAIN, delivery_channel: 'sms', content: 'Is my order ready?', created_at: '2026-11-24T09:00:00Z' },
    { id: 'm2', conversation_id: 'cv-emma', sender_type: 'agent', sender_name: 'Casey', delivery_channel: 'sms', content: 'Thanks', created_at: '2026-11-24T10:00:00Z' },
    { id: 'm3', conversation_id: 'cv-bare', sender_type: 'visitor', sender_name: SECOND, delivery_channel: 'sms', content: '808 Example Hwy', created_at: '2026-11-25T09:00:00Z' },
  ],
  woocommerce_orders: [
    { company_id: CO, woo_order_id: 130163, customer_email: 'emma@example.test', billing_phone_norm: '400999888', order_date: '2026-11-23' },
  ],
  customer_identities: [], customer_identity_audit: [], conversation_events: [], conversation_tasks: [],
})
const conv = (db, id) => db.tables.conversations.find(c => c.id === id)
const text = (db, from, body) => inbound.ingestInboundSms({ db, companyId: CO, from, to: '+61400000777', text: body, origin: 'http://127.0.0.1:1' })

console.log('Merging the second mobile in')
{
  const db = world()
  const r = await sc.confirmByPhone(db, conv(db, 'cv-bare'), 'ct-emma', { id: 'u1', name: 'Casey' })
  ok(r.ok && r.conversationId === 'cv-emma', 'into Emma’s conversation', r)
  ok(conv(db, 'cv-emma').sms_number === SECOND, 'replies go to the second mobile: it texted last', conv(db, 'cv-emma').sms_number)

  const db2 = world()
  db2.tables.messages.push({ id: 'm4', conversation_id: 'cv-emma', sender_type: 'visitor', sender_name: MAIN, delivery_channel: 'sms', content: 'Also, the address', created_at: '2026-11-25T11:00:00Z' })
  await sc.confirmByPhone(db2, conv(db2, 'cv-bare'), 'ct-emma', {})
  ok(conv(db2, 'cv-emma').sms_number === MAIN, 'her usual mobile when that texted last')
}

console.log('Texts after the merge')
{
  const db = world()
  await sc.confirmByPhone(db, conv(db, 'cv-bare'), 'ct-emma', {})
  conv(db, 'cv-emma').sms_number = MAIN   // as if she'd since texted from her usual mobile

  const a = await text(db, SECOND, 'Can you deliver Friday?')
  ok(a.conversationId === 'cv-emma', 'from the second mobile → her conversation', a)
  ok(conv(db, 'cv-emma').sms_number === SECOND, '…and replies go back to the second mobile', conv(db, 'cv-emma').sms_number)
  ok(conv(db, 'cv-emma').sms_enabled === true, 'texting stays on')

  const b = await text(db, MAIN, 'Actually Saturday')
  ok(b.conversationId === 'cv-emma', 'from her usual mobile → still her conversation', b)
  ok(conv(db, 'cv-emma').sms_number === MAIN, '…and replies go back to her usual mobile', conv(db, 'cv-emma').sms_number)

  await text(db, SECOND, 'STOP')
  ok(conv(db, 'cv-emma').sms_number === MAIN, 'a STOP from the second mobile leaves replies on her usual one')
  ok(db.tables.conversations.filter(c => !c.merged_into).length === 1, 'no new conversation along the way', db.tables.conversations.map(c => c.id))
}

console.log('An older thread still holding her other number')
{
  const db = world()
  // An old web chat where she gave her usual mobile, and her current
  // conversation now on the second mobile (it texted last).
  db.tables.conversations.push({ id: 'cv-old', company_id: CO, contact_id: 'ct-emma', channel: 'chat', sms_number: MAIN, last_message: 'Old chat', last_message_at: '2026-06-01T10:00:00Z', merged_into: null, unread_count: 0 })
  await sc.confirmByPhone(db, conv(db, 'cv-bare'), 'ct-emma', {})
  ok(conv(db, 'cv-emma').sms_number === SECOND, 'her conversation is on the second mobile')
  const r = await text(db, MAIN, 'Hi it’s Emma again')
  ok(r.conversationId === 'cv-emma', 'a text from her usual mobile goes to her current conversation, not the old chat', r)
  ok(conv(db, 'cv-old').last_message === 'Old chat', 'the old chat is left alone')

  const lone = fakeDb({ conversations: [
    { id: 'old', company_id: CO, contact_id: 'ct-x', sms_number: MAIN, last_message_at: '2026-01-01T00:00:00Z', merged_into: null },
    { id: 'new', company_id: CO, contact_id: 'ct-x', sms_number: '+61400555666', last_message_at: '2026-11-01T00:00:00Z', merged_into: null },
  ], messages: [{ id: 'x1', conversation_id: 'new', sender_type: 'visitor', sender_name: '+61400555666' }] })
  ok((await sc.textingConversation(lone, CO, lone.tables.conversations[0], MAIN)).id === 'old', 'a newer conversation this number never texted in → left where the number is')
  ok((await sc.textingConversation(lone, CO, lone.tables.conversations[1], '+61400555666')).id === 'new', 'already the newest → stays')
}

console.log('Someone new, and a contact without a conversation number')
{
  const db = world()
  const r = await text(db, '+61400777888', 'Do you open Sunday?')
  const c = conv(db, r.conversationId)
  ok(c && c.sms_number === '+61400777888' && c.id !== 'cv-emma', 'a new number gets its own conversation, as before', c)

  const db2 = world()
  conv(db2, 'cv-emma').sms_number = null
  db2.tables.conversations = db2.tables.conversations.filter(c => c.id !== 'cv-bare')
  const r2 = await text(db2, MAIN, 'Hello')
  ok(r2.conversationId === 'cv-emma' && conv(db2, 'cv-emma').sms_number === MAIN, 'found through her contact → her number recorded on it, as before')
}

console.log(failures ? `\n${failures} FAILED` : '\nall passed')
process.exit(failures ? 1 : 0)
