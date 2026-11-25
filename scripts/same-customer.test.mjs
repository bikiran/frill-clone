// Runnable tests for "Same customer?" — a second mobile that's the phone on a
// customer's store orders (lib/same-customer), and texts from a confirmed
// number finding that customer (lib/contact-capture findContactByPhone).
//
//   npx tsx scripts/same-customer.test.mjs
//
// Zero-dependency: a small fake Supabase client stands in for the database.
// Made-up customers and numbers. Exits non-zero if any check fails.

let failures = 0
const ok = (cond, name, got) => { if (cond) console.log('  ok  ', name); else { failures++; console.log('  FAIL', name, got === undefined ? '' : JSON.stringify(got)) } }

// ── A small fake Supabase client ─────────────────────────────────────────────
function fakeDb(tables) {
  const from = (table) => {
    const q = { filters: [], op: 'select', patch: null, single: false, order: null, limit: null }
    const rows = () => (tables[table] ||= [])
    const match = r => q.filters.every(f => f(r))
    const run = async () => {
      if (q.op === 'update') { const hit = rows().filter(match); hit.forEach(r => Object.assign(r, q.patch)); return { data: hit, error: null } }
      if (q.op === 'insert') { const list = Array.isArray(q.patch) ? q.patch : [q.patch]; for (const r of list) rows().push({ id: r.id || `id-${Math.random().toString(36).slice(2)}`, ...r }); return { data: list, error: null } }
      let r = rows().filter(match)
      if (q.order) { const [k, asc] = q.order; r = r.slice().sort((a, b) => (String(a[k] ?? '') < String(b[k] ?? '') ? -1 : 1) * (asc ? 1 : -1)) }
      if (q.limit != null) r = r.slice(0, q.limit)
      return { data: q.single ? (r[0] || null) : r, error: null }
    }
    const chain = {
      select: () => chain,
      eq: (k, v) => { q.filters.push(r => r[k] === v); return chain },
      neq: (k, v) => { q.filters.push(r => r[k] !== v); return chain },
      is: (k, v) => { q.filters.push(r => v === null ? r[k] == null : r[k] === v); return chain },
      in: (k, vs) => { q.filters.push(r => vs.includes(r[k])); return chain },
      ilike: (k, v) => { q.filters.push(r => String(r[k] || '').toLowerCase() === String(v).toLowerCase()); return chain },
      contains: (k, obj) => { q.filters.push(r => r[k] && Object.entries(obj).every(([kk, vv]) => r[k][kk] === vv)); return chain },
      or: (expr) => {
        const parts = expr.split(',').map(p => p.split('.'))
        q.filters.push(r => parts.some(([k, op, ...v]) => op === 'ilike' && String(r[k] || '').toLowerCase() === v.join('.').toLowerCase()))
        return chain
      },
      not: () => chain,
      order: (k, o) => { q.order = [k, o?.ascending !== false]; return chain },
      limit: (n) => { q.limit = n; return chain },
      update: (patch) => { q.op = 'update'; q.patch = patch; return chain },
      insert: (patch) => { q.op = 'insert'; q.patch = patch; return chain },
      maybeSingle: () => { q.single = true; return run() },
      then: (res, rej) => run().then(res, rej),
    }
    return chain
  }
  return { from, tables }
}

globalThis.fetch = async () => { throw new Error('network disabled in tests') }
const sc = await import('../lib/same-customer.ts')
const cap = await import('../lib/contact-capture.ts')

const CO = 'co-1'
const EMMA = 'ct-emma', BARE = 'ct-bare', OTHER = 'ct-other'
const A = 'cv-emma', B = 'cv-bare'
const world = () => fakeDb({
  contacts: [
    { id: EMMA, company_id: CO, name: 'Emma Lane', email: 'emma@example.test', phone: '+61400111222', phone_norm: '400111222' },
    { id: BARE, company_id: CO, name: null, email: null, phone: '+61400999888', phone_norm: '400999888' },
    { id: OTHER, company_id: CO, name: 'Sam Rivers', email: 'sam@example.test', phone: '+61400333444', phone_norm: '400333444' },
  ],
  conversations: [
    { id: A, company_id: CO, contact_id: EMMA, sms_number: '+61400111222', channel: 'sms', last_message: 'Hi', last_message_at: '2026-11-24T10:00:00Z', merged_into: null },
    { id: B, company_id: CO, contact_id: BARE, sms_number: '+61400999888', channel: 'sms', last_message: 'Address is the same for both orders', last_message_at: '2026-11-25T10:00:00Z', merged_into: null },
  ],
  messages: [
    { id: 'm1', conversation_id: A, content: 'Hi' },
    { id: 'm2', conversation_id: B, content: 'Address is the same for both orders' },
    { id: 'm3', conversation_id: B, content: '808 Example Hwy' },
  ],
  woocommerce_orders: [
    { company_id: CO, woo_order_id: 130163, customer_email: 'Emma@Example.test', billing_phone_norm: '400999888', order_date: '2026-11-23' },
    { company_id: CO, woo_order_id: 130167, customer_email: 'emma@example.test', billing_phone_norm: '400999888', order_date: '2026-11-23' },
  ],
  orders: [], customer_identities: [], customer_identity_audit: [], conversation_events: [], conversation_tasks: [],
})

console.log('Picking the customer the orders point at')
{
  const contacts = [{ id: EMMA, email: 'emma@example.test' }, { id: OTHER, email: 'sam@example.test' }]
  const o = (n, email, contactId = null) => ({ number: n, email, contactId, at: null })
  ok(sc.pickPhoneMatch([o('1', 'EMMA@example.test'), o('2', 'emma@example.test')], contacts)?.contactId === EMMA, 'orders by email → that customer (email case ignored)')
  ok(sc.pickPhoneMatch([o('1', '', OTHER)], contacts)?.contactId === OTHER, 'an order linked to a contact → that customer')
  ok(sc.pickPhoneMatch([o('1', 'emma@example.test'), o('2', 'sam@example.test')], contacts) === null, 'orders for two different customers → no suggestion (a shared phone)')
  ok(sc.pickPhoneMatch([o('1', 'emma@example.test')], contacts, { visitorId: EMMA }) === null, 'never the conversation’s own contact')
  ok(sc.pickPhoneMatch([o('1', 'emma@example.test')], contacts, { rejected: new Set([EMMA]) }) === null, 'never someone marked “not the same”')
  ok(sc.pickPhoneMatch([o('1', 'nobody@example.test')], contacts) === null, 'orders for nobody we know → nothing')
}

console.log('Suggesting')
{
  const db = world()
  const s = await sc.suggestByPhone(db, db.tables.conversations[1])
  ok(s?.contactId === EMMA && s.name === 'Emma Lane', 'the second mobile → Emma', s)
  ok(s?.orderCount === 2 && s.orderNumbers.slice().sort().join(',') === '130163,130167', 'with her two orders on that number', s)
  ok(s?.conversationId === A, 'and her conversation to merge into', s)
  ok(s && !s.maskedEmail.includes('emma@example.test'), 'her email masked', s?.maskedEmail)
  ok(await sc.suggestByPhone(db, db.tables.conversations[0]) === null, 'Emma’s own conversation → nothing (her contact has an email)')
}

console.log('“Not the same”')
{
  const db = world()
  const conv = db.tables.conversations[1]
  await sc.rejectByPhone(db, conv, EMMA, { id: 'u1', name: 'Casey' })
  ok(await sc.suggestByPhone(db, conv) === null, 'not suggested again for this number')
  ok(db.tables.customer_identity_audit.some(a => a.action === 'match_rejected' && a.evidence.phoneValue === '400999888'), 'recorded in the audit trail')
}

console.log('Merging')
{
  const db = world()
  const conv = db.tables.conversations[1]
  const r = await sc.confirmByPhone(db, conv, EMMA, { id: 'u1', name: 'Casey' })
  ok(r.ok && r.conversationId === A, 'opens Emma’s conversation', r)
  const ids = db.tables.customer_identities
  ok(ids.length === 1 && ids[0].contact_id === EMMA && ids[0].kind === 'phone' && ids[0].value === '400999888' && ids[0].status === 'confirmed', 'the number is recorded as Emma’s, confirmed', ids)
  ok(db.tables.messages.filter(m => m.conversation_id === A).length === 3, 'the messages moved into Emma’s conversation')
  const bConv = db.tables.conversations.find(c => c.id === B)
  ok(bConv.merged_into === A && bConv.is_archived === true, 'the old conversation is marked merged into hers', bConv)
  const aConv = db.tables.conversations.find(c => c.id === A)
  ok(aConv.last_message_at === '2026-11-25T10:00:00Z' && aConv.last_message === 'Address is the same for both orders', 'hers shows the latest message', aConv)
  ok(aConv.sms_number === '+61400111222', 'her own number stays her conversation’s number')
  const gE = db.tables.contacts.find(c => c.id === EMMA).identity_group_id, gB = db.tables.contacts.find(c => c.id === BARE).identity_group_id
  ok(gE && gE === gB, 'the two contacts are linked as one customer')
  ok(db.tables.customer_identity_audit.some(a => a.action === 'match_confirmed' && a.contact_id === EMMA), 'recorded in the audit trail')
  ok(await sc.suggestByPhone(db, bConv) === null, 'the merged conversation suggests nothing more')

  console.log('Later texts and calls from that number')
  const found = await sc.followMerged(db, CO, bConv)
  ok(found.id === A, 'a text matched to the old conversation lands in Emma’s')
  const who = await cap.findContactByPhone(db, CO, '0400 999 888')
  ok(who?.id === EMMA, 'the number is Emma’s (calls and texts), not the bare contact', who)
  ok((await cap.findContactByPhone(db, CO, '+61400333444'))?.id === OTHER, 'other numbers find their own contact as before')
  ok((await cap.findContactByPhone(db, 'co-2', '0400 999 888')) === null, 'another workspace never sees it')
}

console.log('Following merges safely')
{
  const db = fakeDb({ conversations: [
    { id: 'x', company_id: CO, merged_into: 'y' }, { id: 'y', company_id: CO, merged_into: 'z' }, { id: 'z', company_id: CO, merged_into: null },
    { id: 'p', company_id: CO, merged_into: 'q' }, { id: 'q', company_id: CO, merged_into: 'p' },
    { id: 'm', company_id: CO, merged_into: 'n' }, { id: 'n', company_id: 'co-2', merged_into: null },
  ] })
  ok((await sc.followMerged(db, CO, db.tables.conversations[0])).id === 'z', 'a chain of merges ends at the last')
  const loop = await sc.followMerged(db, CO, db.tables.conversations[3])
  ok(loop && ['p', 'q'].includes(loop.id), 'a loop stops instead of spinning')
  ok((await sc.followMerged(db, CO, db.tables.conversations[5])).id === 'm', 'never into another workspace’s conversation')
}

console.log(failures ? `\n${failures} FAILED` : '\nall passed')
process.exit(failures ? 1 : 0)
