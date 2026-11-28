// Runnable tests for delivering a scheduled reply (lib/scheduled-send): which
// channel it goes out on, who is texted, and when it fails instead of being
// written into the thread as if it had been sent.
//
//   npx tsx scripts/scheduled-send.test.mjs
//
// Zero-dependency: a small fake Supabase client stands in for the database and
// a stub answers the send routes, so nothing leaves this machine. Made-up
// customers and numbers. Exits non-zero if any check fails.

let failures = 0
const ok = (cond, name, got) => { if (cond) console.log('  ok  ', name); else { failures++; console.log('  FAIL', name, got === undefined ? '' : JSON.stringify(got)) } }

// ── A small fake Supabase client ─────────────────────────────────────────────
function fakeDb(tables) {
  let seq = 0
  const from = (table) => {
    const q = { filters: [], op: 'select', patch: null, single: false, limit: null }
    const rows = () => (tables[table] ||= [])
    const match = r => q.filters.every(f => f(r))
    const run = async () => {
      if (q.op === 'update') { const hit = rows().filter(match); hit.forEach(r => Object.assign(r, q.patch)); return { data: q.single ? (hit[0] || null) : hit, error: null } }
      if (q.op === 'insert') {
        const list = (Array.isArray(q.patch) ? q.patch : [q.patch]).map(r => ({ id: r.id || `${table}-${++seq}`, ...r }))
        rows().push(...list)
        return { data: q.single ? list[0] : list, error: null }
      }
      let r = rows().filter(match)
      if (q.limit != null) r = r.slice(0, q.limit)
      return { data: q.single ? (r[0] || null) : r, error: null }
    }
    const chain = new Proxy({}, {
      get(_, prop) {
        switch (prop) {
          case 'then': return (res, rej) => run().then(res, rej)
          case 'eq': return (k, v) => { q.filters.push(r => r[k] === v); return chain }
          case 'in': return (k, vs) => { q.filters.push(r => vs.includes(r[k])); return chain }
          case 'limit': return (n) => { q.limit = n; return chain }
          case 'update': return (patch) => { q.op = 'update'; q.patch = patch; return chain }
          case 'insert': return (patch) => { q.op = 'insert'; q.patch = patch; return chain }
          case 'maybeSingle': case 'single': return () => { q.single = true; return run() }
          default: return () => chain   // select, order…
        }
      },
    })
    return chain
  }
  return { from, tables }
}

// The send routes are answered here, never called. Each call is kept.
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test-only'
let calls = []
let answer = () => new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } })
globalThis.fetch = async (url, init) => {
  calls.push({ path: String(url).replace('http://app.test', ''), body: JSON.parse(init?.body || '{}'), headers: init?.headers || {} })
  return answer()
}

const { claimScheduled, deliverScheduled } = await import('../lib/scheduled-send.ts')

const CO = 'co-1', BASE = 'http://app.test', MOBILE = '+61400111222'
const SMS = '/api/telnyx/sms/send'

/** One conversation and one scheduled reply on it, delivered. */
async function deliver(conv, smChannel, { contacts = [], more = [] } = {}) {
  calls = []
  const db = fakeDb({ conversations: [{ id: 'cv', company_id: CO, ...conv }, ...more], contacts, messages: [] })
  const r = await deliverScheduled(db, BASE, { id: 'sm', conversation_id: 'cv', message: 'Your order is ready', channel: smChannel })
  return { r, calls, posted: db.tables.messages }
}

console.log('A conversation a call opened')
{
  for (const [stored, who] of [['sms', 'the app (stores sms)'], ['phone', 'the web inbox (stores the thread’s channel)']]) {
    const { r, calls, posted } = await deliver({ channel: 'phone', sms_number: MOBILE, sms_enabled: false }, stored)
    ok(r.ok && calls.length === 1 && calls[0].path === SMS && calls[0].body.to === MOBILE, `scheduled from ${who}: the caller is texted, once`, { r, calls })
    ok(posted.length === 0, '  and nothing is written into the thread here (the SMS route logs what it sent)', posted)
    ok(calls[0]?.body.conversationId === 'cv' && calls[0].body.companyId === CO && !calls[0].body.skipChatMessage && !!calls[0].headers['x-colvy-internal'], '  as one of our own server’s texts, which the SMS route checks for opt-outs', calls[0])
  }
  for (const ch of ['call', 'voice']) {
    const { r, calls } = await deliver({ channel: ch, sms_number: MOBILE }, ch)
    ok(r.ok && calls.length === 1 && calls[0].path === SMS, `channel '${ch}' is a call thread too`, { r, calls })
  }
  const viaContact = await deliver({ channel: 'phone', contact_id: 'ct' }, 'phone', { contacts: [{ id: 'ct', company_id: CO, phone: MOBILE }] })
  ok(viaContact.r.ok && viaContact.calls[0]?.body.to === MOBILE, 'no number on the thread: the contact’s is used', viaContact)
  const none = await deliver({ channel: 'phone' }, 'phone')
  ok(!none.r.ok && /no phone number/.test(none.r.error) && none.calls.length === 0 && none.posted.length === 0, 'no number at all: it fails, and nothing is written into the thread', none)
}

console.log('The channel the agent scheduled it on')
{
  const order = await deliver({ channel: 'chat', sms_number: MOBILE }, 'sms')
  ok(order.r.ok && order.calls.length === 1 && order.calls[0].path === SMS && order.posted.length === 0, 'an order thread (chat, nobody in a widget) scheduled by SMS is texted', order)
  const left = await deliver({ channel: 'widget', visitor_id: 'v1', sms_number: MOBILE, sms_enabled: true }, 'sms')
  ok(left.r.ok && left.calls.length === 1 && left.calls[0].path === SMS && left.posted.length === 0, 'a website chat scheduled by SMS (they ticked the box) is texted', left)
  const email = await deliver({ channel: 'sms', sms_number: MOBILE, customer_email: 'sam@example.com' }, 'email')
  ok(email.r.ok && email.calls.length === 1 && email.calls[0].path === '/api/email/reply' && email.calls[0].body.to === 'sam@example.com', 'an SMS thread scheduled by email is emailed, not texted', email)
  const emailOnCall = await deliver({ channel: 'phone', sms_number: MOBILE, customer_email: 'sam@example.com' }, 'email')
  ok(emailOnCall.r.ok && emailOnCall.calls.length === 1 && emailOnCall.calls[0].path === '/api/email/reply', 'a call thread scheduled by email is emailed', emailOnCall)
  // The agent chose SMS on a thread with a channel of its own: it is texted.
  for (const ch of ['email', 'whatsapp', 'instagram']) {
    const picked = await deliver({ channel: ch, sms_number: MOBILE, customer_email: 'sam@example.com' }, 'sms')
    ok(picked.r.ok && picked.calls.length === 1 && picked.calls[0].path === SMS, `a${ch === 'whatsapp' ? '' : 'n'} ${ch} thread scheduled by SMS is texted`, picked)
  }
  // Only SMS and email are taken from the scheduled row: Messenger, Instagram
  // and WhatsApp send on their own conversation, so its channel decides.
  const metaOnSms = await deliver({ channel: 'sms', sms_number: MOBILE }, 'instagram')
  ok(metaOnSms.r.ok && metaOnSms.calls.length === 1 && metaOnSms.calls[0].path === SMS, 'an SMS thread with Instagram stored goes by the thread’s channel, as before', metaOnSms)
  const colvy = await deliver({ channel: 'colvy', sms_number: MOBILE }, 'sms')
  ok(colvy.r.ok && colvy.calls.length === 0 && colvy.posted.length === 1 && colvy.posted[0].delivery_channel === 'colvy', 'a Colvy chat stays in the app whatever was stored', colvy)
}

console.log('Who is not texted')
{
  const widgetContact = { id: 'ct', company_id: CO, phone: MOBILE, source: 'widget' }
  const noOptIn = await deliver({ channel: 'widget', visitor_id: 'v1', contact_id: 'ct', sms_number: MOBILE, sms_enabled: false }, 'sms', { contacts: [widgetContact] })
  ok(!noOptIn.r.ok && /opt in/.test(noOptIn.r.error) && noOptIn.calls.length === 0 && noOptIn.posted.length === 0, 'a website chat visitor who didn’t opt in to texts: it fails, no text, nothing in the thread', noOptIn)
  const rangLater = await deliver({ channel: 'phone', contact_id: 'ct', sms_number: MOBILE, sms_enabled: false }, 'sms', {
    contacts: [widgetContact], more: [{ id: 'cv-chat', company_id: CO, channel: 'widget', visitor_id: 'v1', contact_id: 'ct', sms_number: MOBILE, sms_enabled: false }],
  })
  ok(!rangLater.r.ok && rangLater.calls.length === 0, '  nor on a call thread of theirs', rangLater)
  // The opt-out itself (STOP, blocked) is the SMS route's answer: a refusal fails the scheduled message.
  answer = () => new Response(JSON.stringify({ error: 'This customer has opted out of texts (they replied STOP), so it wasn’t texted.', optedOut: true }), { status: 409 })
  const stopped = await deliver({ channel: 'phone', sms_number: MOBILE }, 'sms')
  ok(!stopped.r.ok && /opted out/.test(stopped.r.error) && stopped.calls.length === 1 && stopped.posted.length === 0, 'the SMS route refuses (opted out): it fails, and nothing is written into the thread', stopped)
  answer = () => new Response('{"ok":true}', { status: 200 })
}

console.log('Nowhere to send it')
{
  for (const [conv, stored, what] of [
    [{ channel: 'chat', sms_number: MOBILE }, 'chat', 'an order thread (chat, no visitor) scheduled as chat'],
    [{ channel: 'form', customer_email: 'sam@example.com' }, 'form', 'a contact-form thread'],
    [{ channel: null }, '', 'no channel at all'],
  ]) {
    const { r, calls, posted } = await deliver(conv, stored)
    ok(!r.ok && /No channel/.test(r.error) && calls.length === 0 && posted.length === 0, `${what}: it fails, and nothing is written into the thread`, { r, calls, posted })
  }
}

console.log('A website chat is still posted in the thread')
{
  for (const [conv, stored, dc] of [
    [{ channel: 'widget', visitor_id: 'v1' }, 'widget', 'widget'],
    [{ channel: 'widget', visitor_id: 'v1', sms_number: MOBILE }, 'chat', 'widget'],
    [{ channel: 'live_chat' }, 'live_chat', 'live_chat'],
    [{ channel: 'chat', visitor_id: 'v1' }, 'chat', 'chat'],
  ]) {
    const { r, calls, posted } = await deliver(conv, stored)
    ok(r.ok && calls.length === 0 && posted.length === 1 && posted[0].delivery_channel === dc && posted[0].content === 'Your order is ready', `${conv.channel} (stored '${stored}') → posted as ${dc}, no send`, { r, calls, posted })
  }
}

console.log('What already worked is unchanged')
{
  const sms = await deliver({ channel: 'sms', sms_number: MOBILE }, 'sms')
  ok(sms.r.ok && sms.calls.length === 1 && sms.calls[0].path === SMS
    && JSON.stringify(sms.calls[0].body) === JSON.stringify({ companyId: CO, conversationId: 'cv', to: MOBILE, text: 'Your order is ready', senderName: 'Scheduled' }), 'SMS on an SMS thread: the same request as before', sms.calls)
  // An SMS thread that began as a website chat is texted as before (no new check on it).
  const moved = await deliver({ channel: 'sms', visitor_id: 'v1', contact_id: 'ct', sms_number: MOBILE, sms_enabled: false }, 'sms', { contacts: [{ id: 'ct', company_id: CO, phone: MOBILE, source: 'widget' }] })
  ok(moved.r.ok && moved.calls.length === 1 && moved.calls[0].path === SMS, 'an SMS thread that began as a website chat: texted as before', moved)
  const mail = await deliver({ channel: 'email', customer_email: 'sam@example.com' }, 'email')
  ok(mail.r.ok && mail.calls.length === 1 && mail.calls[0].path === '/api/email/reply', 'email on an email thread', mail.calls)
  for (const ch of ['instagram', 'facebook']) {
    const meta = await deliver({ channel: ch }, ch)
    ok(meta.r.ok && meta.calls.length === 1 && meta.calls[0].path === '/api/meta/send', `${ch} on its own thread`, meta.calls)
  }
  const wa = await deliver({ channel: 'whatsapp', sms_number: MOBILE }, 'whatsapp')
  ok(wa.r.ok && wa.calls.length === 1 && wa.calls[0].path === '/api/whatsapp/send', 'WhatsApp on a WhatsApp thread', wa.calls)
  // An automated text held back overnight: its message is already on the thread.
  const auto = await deliver({ channel: 'chat', sms_number: MOBILE }, 'sms_auto')
  ok(auto.r.ok && auto.calls.length === 1 && auto.calls[0].path === SMS && auto.calls[0].body.skipChatMessage === true, 'a text queued for the morning (sms_auto)', auto.calls)
}

console.log('Sent at most once')
{
  const db = fakeDb({ scheduled_messages: [{ id: 'sm', status: 'pending', conversation_id: 'cv', message: 'Hi', channel: 'sms' }] })
  const first = await claimScheduled(db, 'sm')
  const second = await claimScheduled(db, 'sm')
  ok(first?.id === 'sm' && second === null && db.tables.scheduled_messages[0].status === 'sending', 'only one caller can take a pending row', { first, second })
}

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed')
process.exit(failures ? 1 : 0)
