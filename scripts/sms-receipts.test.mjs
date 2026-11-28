// Runnable tests for carrier delivery receipts on ordinary texts
// (lib/sms-receipts): the receipt lands on the thread row as metadata.sms,
// merged with what the row already holds; a final status is never replaced by
// an earlier one; a receipt only reaches a row of the business that owns the
// sending number; one that matches nothing changes nothing and never throws.
//
//   npx tsx scripts/sms-receipts.test.mjs
//
// Zero-dependency: a small fake Supabase client over made-up rows. Nothing is
// sent and no request leaves this machine. Exits non-zero if any check fails.

let failures = 0
const ok = (cond, name, extra) => { if (cond) console.log('  ok  ', name); else { failures++; console.log('  FAIL', name, extra === undefined ? '' : JSON.stringify(extra)) } }

globalThis.fetch = async () => { throw new Error('network disabled in tests') }

// 'metadata->sms->>status' → row.metadata.sms.status (null when any step is missing)
const at = (row, path) => path.split(/->>?/).reduce((v, k) => (v && typeof v === 'object' && k in v ? v[k] : null), row)

function fakeDb(tables, hooks = {}) {
  const log = []
  const from = (table) => {
    const q = { filters: [], op: 'select', patch: null, limit: Infinity, order: null }
    const run = async () => {
      log.push({ table, op: q.op })
      if (hooks.before) await hooks.before(table, q.op, tables)
      if (hooks.fail === table) throw new Error('database down')
      let rows = (tables[table] || []).filter(r => q.filters.every(f => f(r)))
      if (q.order) rows = rows.slice().sort((a, b) => (a[q.order.k] < b[q.order.k] ? -1 : a[q.order.k] > b[q.order.k] ? 1 : 0) * (q.order.asc ? 1 : -1))
      if (q.op === 'update') { rows.forEach(r => Object.assign(r, structuredClone(q.patch))); return { data: rows.map(r => ({ id: r.id })), error: null } }
      return { data: structuredClone(rows.slice(0, q.limit)), error: null }
    }
    const chain = {
      select: () => chain,
      eq: (k, v) => { q.filters.push(r => at(r, k) === v); return chain },
      neq: (k, v) => { q.filters.push(r => at(r, k) !== v); return chain },
      is: (k, v) => { q.filters.push(r => at(r, k) === v || (v === null && at(r, k) === undefined)); return chain },
      gte: (k, v) => { q.filters.push(r => r[k] >= v); return chain },
      or: () => chain,   // phone_numbers: every row comes back and the caller picks the exact match
      order: (k, o) => { q.order = { k, asc: o?.ascending !== false }; return chain },
      limit: (n) => { q.limit = n; return chain },
      update: (patch) => { q.op = 'update'; q.patch = patch; return chain },
      maybeSingle: () => run().then(r => ({ data: r.data[0] || null, error: null })),
      then: (res, rej) => run().then(res, rej),
    }
    return chain
  }
  return { from, log }
}
const writes = db => db.log.filter(l => l.op === 'update').length
const reads = (db, table) => db.log.filter(l => l.table === table && l.op === 'select').length

const { applySmsThreadReceipt, smsStatusAdvances, SMS_RECEIPT_WINDOW_DAYS } = await import('../lib/sms-receipts.ts')

const NOW = Date.now()
const ago = ms => new Date(NOW - ms).toISOString()
const world = () => ({
  phone_numbers: [
    { company_id: 'co-a', phone_number: '+61480000001' },
    { company_id: 'co-b', phone_number: '+61480000002' },
  ],
  companies: [{ id: 'co-a', closed_at: null }, { id: 'co-b', closed_at: null }, { id: 'co-shut', closed_at: ago(1000) }],
  campaign_recipients: [{ id: 'cr-1', provider_id: 'SMcampaign' }],
  messages: [
    { id: 'm-reply', company_id: 'co-a', sender_type: 'agent', delivery_channel: 'sms', telnyx_message_id: 'SMreply', created_at: ago(5_000), metadata: { links: [{ code: 'abc' }] } },
    { id: 'm-link', company_id: 'co-a', sender_type: 'agent', delivery_channel: 'sms', telnyx_message_id: 'SMlink', created_at: ago(60_000), metadata: null },
    { id: 'm-auto', company_id: 'co-a', sender_type: 'agent', delivery_channel: 'sms', telnyx_message_id: 'SMauto', created_at: ago(60_000), metadata: { auto: true, missed_call_text: true, call_id: 'c1' } },
    { id: 'm-old', company_id: 'co-a', sender_type: 'agent', delivery_channel: 'sms', telnyx_message_id: 'SMold', created_at: ago((SMS_RECEIPT_WINDOW_DAYS + 1) * 86_400_000), metadata: {} },
    { id: 'm-in', company_id: 'co-a', sender_type: 'visitor', delivery_channel: 'sms', telnyx_message_id: 'SMinbound', created_at: ago(5_000), metadata: {} },
    { id: 'm-wa', company_id: 'co-a', sender_type: 'agent', delivery_channel: 'whatsapp', telnyx_message_id: 'SMwhatsapp', created_at: ago(5_000), metadata: { whatsapp: { status: 'sent' } } },
    { id: 'm-b', company_id: 'co-b', sender_type: 'agent', delivery_channel: 'sms', telnyx_message_id: 'SMother', created_at: ago(5_000), metadata: {} },
  ],
})
const row = (t, id) => t.messages.find(m => m.id === id)
const A = '+61480000001', B = '+61480000002'
const rec = (db, providerId, status, extra = {}) => applySmsThreadReceipt(db, { providerId, status, ourNumber: A, provider: 'twilio', ...extra })

console.log('\nWhich status replaces which')
ok(smsStatusAdvances(null, 'sent') && smsStatusAdvances(undefined, 'delivered') && smsStatusAdvances('', 'failed'), 'the first receipt is always recorded')
ok(smsStatusAdvances('sent', 'delivered') && smsStatusAdvances('sent', 'failed'), 'sent moves on to delivered or failed')
ok(!smsStatusAdvances('delivered', 'sent') && !smsStatusAdvances('failed', 'sent'), 'a late "sent" does not undo a final status')
ok(!smsStatusAdvances('delivered', 'failed') && !smsStatusAdvances('failed', 'delivered'), 'the first final status stands')
ok(!smsStatusAdvances('sent', 'sent') && !smsStatusAdvances('delivered', 'delivered'), 'a repeat changes nothing')
ok(!smsStatusAdvances(null, 'queued') && !smsStatusAdvances('sent', 'read'), 'a status that is not sent / delivered / failed is ignored')

console.log('\nA receipt lands on its thread row')
{
  const t = world(), db = fakeDb(t)
  const r = await rec(db, 'SMreply', 'delivered')
  const m = row(t, 'm-reply').metadata
  ok(r?.messageId === 'm-reply' && r.status === 'delivered', 'says which row changed', r)
  ok(m.sms?.status === 'delivered' && !('error' in m.sms) && !Number.isNaN(Date.parse(m.sms.at)), 'metadata.sms = { status: "delivered", at }', m.sms)
  ok(m.links?.[0]?.code === 'abc', 'the tracked links on the row are kept', m)
}
{
  const t = world(), db = fakeDb(t)
  await rec(db, 'SMlink', 'failed', { error: 'Twilio error 30006' })
  const m = row(t, 'm-link').metadata
  ok(m.sms?.status === 'failed' && m.sms.error === 'Twilio error 30006' && !!m.sms.at, 'a failure keeps what the provider said (a row with no metadata yet)', m)
}
{
  const t = world(), db = fakeDb(t)
  await rec(db, 'SMauto', 'failed', { error: 'x'.repeat(900) })
  const m = row(t, 'm-auto').metadata
  ok(m.auto === true && m.missed_call_text === true && m.call_id === 'c1', 'an automatic text keeps its flags', m)
  ok(m.sms.error.length === 300, 'a long error is cut to 300 characters', m.sms.error.length)
  await rec(fakeDb(t), 'SMlink', 'failed')
  ok(row(t, 'm-link').metadata.sms.error === 'failed', 'a failure with no reason still says failed', row(t, 'm-link').metadata)
}

console.log('\nA status never moves backwards')
{
  const t = world()
  await rec(fakeDb(t), 'SMreply', 'sent')
  ok(row(t, 'm-reply').metadata.sms.status === 'sent', 'sent is recorded')
  await rec(fakeDb(t), 'SMreply', 'delivered')
  const first = row(t, 'm-reply').metadata.sms
  ok(first.status === 'delivered', 'then delivered')
  const db = fakeDb(t)
  const late = await rec(db, 'SMreply', 'sent')
  ok(late === null && row(t, 'm-reply').metadata.sms.status === 'delivered' && writes(db) === 0, 'a late "sent" leaves delivered alone and writes nothing')
  const db2 = fakeDb(t)
  const flip = await rec(db2, 'SMreply', 'failed', { error: 'late' })
  ok(flip === null && row(t, 'm-reply').metadata.sms.status === 'delivered' && writes(db2) === 0, 'a late failure does not undo delivered')
  const db3 = fakeDb(t)
  await rec(db3, 'SMreply', 'delivered')
  ok(row(t, 'm-reply').metadata.sms.at === first.at && writes(db3) === 0, 'a repeat receipt writes nothing')
}
{
  // "sent" is read, then "delivered" lands before "sent" is written.
  const t = world()
  let once = true
  const db = fakeDb(t, { before: (table, op, tables) => {
    if (table === 'messages' && op === 'update' && once) { once = false; row(tables, 'm-reply').metadata = { links: [{ code: 'abc' }], sms: { status: 'delivered', at: 'T' } } }
  } })
  const r = await rec(db, 'SMreply', 'sent')
  const m = row(t, 'm-reply').metadata
  ok(r === null && m.sms.status === 'delivered' && m.sms.at === 'T', 'two receipts racing: the earlier one does not end up on top', m)
}
{
  // "delivered" is read, then "sent" lands before it is written: delivered still wins.
  const t = world()
  let once = true
  const db = fakeDb(t, { before: (table, op, tables) => {
    if (table === 'messages' && op === 'update' && once) { once = false; row(tables, 'm-reply').metadata = { links: [{ code: 'abc' }], sms: { status: 'sent', at: 'T' } } }
  } })
  const r = await rec(db, 'SMreply', 'delivered')
  const m = row(t, 'm-reply').metadata
  ok(r?.status === 'delivered' && m.sms.status === 'delivered' && m.links?.length === 1, 'two receipts racing: the final one is not lost', m)
}

console.log('\nOnly the business that owns the sending number')
{
  const t = world(), before = JSON.stringify(t.messages), db = fakeDb(t)
  const r = await rec(db, 'SMother', 'failed')   // co-b's text, on a receipt from co-a's number
  ok(r === null && JSON.stringify(t.messages) === before && writes(db) === 0, 'a receipt from one business\'s number cannot touch another business\'s row')
  const r2 = await rec(fakeDb(t), 'SMother', 'failed', { ourNumber: B })
  ok(r2?.messageId === 'm-b' && row(t, 'm-b').metadata.sms.status === 'failed', 'from that business\'s own number it is recorded')
}
{
  const t = world(), before = JSON.stringify(t.messages), db = fakeDb(t)
  const seen = []
  const r = await rec(db, 'SMreply', 'delivered', { allowed: async id => { seen.push(id); return false } })
  ok(r === null && seen.join() === 'co-a' && JSON.stringify(t.messages) === before && reads(db, 'messages') === 0, 'not signed for that business: refused before any message is read')
}

console.log('\nA receipt that matches nothing is a quiet no-op')
for (const [name, args] of [
  ['an id no row has', ['SMnobody', 'delivered']],
  ['a row older than the window', ['SMold', 'delivered']],
  ['the customer\'s own incoming text', ['SMinbound', 'delivered']],
  ['a WhatsApp row (it has its own receipts)', ['SMwhatsapp', 'failed']],
  ['a number no business owns', ['SMreply', 'delivered', { ourNumber: '+61499999999' }]],
  ['a sender that is a name, not a number', ['SMreply', 'delivered', { ourNumber: 'COLVY' }]],
  ['a WhatsApp sender', ['SMreply', 'delivered', { ourNumber: 'whatsapp:+61480000001' }]],
  ['no sending number', ['SMreply', 'delivered', { ourNumber: null }]],
  ['no provider id', ['', 'delivered']],
  ['a status that is not a receipt', ['SMreply', 'queued']],
]) {
  const t = world(), before = JSON.stringify(t.messages), db = fakeDb(t)
  const r = await rec(db, ...args)
  ok(r === null && JSON.stringify(t.messages) === before && writes(db) === 0, name, r)
}
{
  const t = world()
  t.phone_numbers.push({ company_id: 'co-shut', phone_number: '+61480000003' })
  t.messages.push({ id: 'm-shut', company_id: 'co-shut', sender_type: 'agent', delivery_channel: 'sms', telnyx_message_id: 'SMshut', created_at: ago(5_000), metadata: {} })
  const db = fakeDb(t)
  const r = await rec(db, 'SMshut', 'delivered', { ourNumber: '+61480000003' })
  ok(r === null && writes(db) === 0, 'a closed workspace')
}
{
  const t = world(), db = fakeDb(t)
  const r = await rec(db, 'SMcampaign', 'sent')
  ok(r === null && reads(db, 'messages') === 0 && reads(db, 'phone_numbers') === 0, 'a campaign text\'s "sent" stops at one read of its recipient')
}

console.log('\nNever throws')
for (const table of ['campaign_recipients', 'phone_numbers', 'messages']) {
  const t = world(), before = JSON.stringify(t.messages)
  let r, threw = false
  const quiet = console.error; console.error = () => {}
  try { r = await rec(fakeDb(t, { fail: table }), 'SMreply', 'sent') } catch { threw = true }
  console.error = quiet
  // phone_numbers failing is swallowed by the number lookup itself (→ no business → no-op).
  ok(!threw && r === null && JSON.stringify(t.messages) === before, `${table} unreadable: nothing recorded, nothing thrown`)
}
{
  let threw = false
  const quiet = console.error; console.error = () => {}
  try { await applySmsThreadReceipt(null, { providerId: 'SMreply', status: 'delivered', ourNumber: A, provider: 'twilio' }) } catch { threw = true }
  console.error = quiet
  ok(!threw, 'no database at all: nothing thrown')
}

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed')
process.exit(failures ? 1 : 0)
