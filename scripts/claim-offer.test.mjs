// Runnable tests for the automatic claim offer (app/api/inbox/smart-trigger):
// the offer is a card in the website chat, so it is only made where the
// customer will see it. A text that mentions a problem no longer gets an offer
// written into its thread as if it had been sent (it was never texted), and
// the conversation's one offer is kept for when they write in the chat.
//
//   npx tsx scripts/claim-offer.test.mjs
//
// Zero-dependency: the route makes its own database client, so a stub answers
// its requests from made-up rows. Nothing is sent and nothing leaves this
// machine. Exits non-zero if any check fails.

let failures = 0
const ok = (cond, name, got) => { if (cond) console.log('  ok  ', name); else { failures++; console.log('  FAIL', name, got === undefined ? '' : JSON.stringify(got)) } }

process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:1'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only'

// The database, as the REST calls the client makes: rows filtered by col=eq.value.
let tables = {}
let outside = []
const value = v => (v === 'true' ? true : v === 'false' ? false : v === 'null' ? null : v)
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(String(url))
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  if (!u.pathname.startsWith('/rest/v1/')) { outside.push(String(url)); return json({}) }
  const rows = (tables[u.pathname.slice('/rest/v1/'.length)] ||= [])
  const filters = [...u.searchParams].filter(([, v]) => v.startsWith('eq.')).map(([k, v]) => r => r[k] === value(v.slice(3)))
  const hit = () => rows.filter(r => filters.every(f => f(r)))
  const method = String(init.method || 'GET').toUpperCase()
  if (method === 'POST') { const b = JSON.parse(init.body); rows.push(...(Array.isArray(b) ? b : [b])); return json([], 201) }
  if (method === 'PATCH') { const b = JSON.parse(init.body); hit().forEach(r => Object.assign(r, b)); return json([]) }
  return json(hit())
}

const { NextRequest } = await import('next/server')
const { internalHeaders } = await import('../lib/internal-call.ts')
const { POST } = await import('../app/api/inbox/smart-trigger/route.ts')

const CO = 'co-1', CV = 'cv-1'
const world = (conv = {}) => ({
  conversations: [{ id: CV, company_id: CO, contact_id: 'ct-1', channel: 'widget', sms_number: '+61400111222', claim_offered: false, is_spam: false, page_seen_at: null, ...conv }],
  companies: [{ id: CO, name: 'Reef & Co', plan: 'everything', trial_ends_at: null, conversation_actions: { doa: { enabled: true } } }],
  company_entitlements: [{ company_id: CO, features: { aiAutomation: true } }],
  contacts: [{ id: 'ct-1', company_id: CO, name: 'Emma Lane', email: 'emma@example.test', phone: '+61400111222', is_blocked: false }],
  woocommerce_customers: [{ id: 'wc-1', company_id: CO, email: 'emma@example.test', phone: '0400111222' }],
  messages: [],
})
const say = async (text, headers = internalHeaders({ 'Content-Type': 'application/json' })) => {
  outside = []
  const res = await POST(new NextRequest('http://127.0.0.1:1/api/inbox/smart-trigger', { method: 'POST', headers, body: JSON.stringify({ conversationId: CV, text }) }))
  return { status: res.status, ...(await res.json()) }
}
const offers = () => tables.messages.filter(m => m.metadata?.smart_trigger)
const conv = () => tables.conversations[0]
const seconds = s => new Date(Date.now() - s * 1000).toISOString()

console.log('A website chat visitor mentions a problem')
{
  tables = world({ channel: 'widget', page_seen_at: seconds(1) })
  const res = await say('My fish arrived dead')
  ok(res.triggered === true && offers().length === 1 && conv().claim_offered === true, 'the claim is offered in the chat, as before', res)
  const again = await say('It was dead on arrival')
  ok(again.skipped === 'already offered' && offers().length === 1, 'and only once per conversation', again)

  tables = world({ channel: 'chat', page_seen_at: null })
  const chat = await say('I would like a refund')
  ok(chat.triggered === true && offers().length === 1, 'a chat conversation is offered it as before', chat)
}

console.log('A customer texts about a problem')
{
  tables = world({ channel: 'sms', page_seen_at: null })
  const res = await say('My fish arrived dead')
  ok(res.triggered === false && res.reason === 'not a live chat', 'no offer is made: it was never texted', res)
  ok(offers().length === 0 && tables.messages.length === 0, 'nothing is written into the thread as if it had been sent', tables.messages)
  ok(conv().claim_offered === false && conv().last_message === undefined, 'the conversation’s one offer is not used up')
  ok(outside.length === 0, 'and nothing is sent anywhere', outside)

  // They open the website chat and write there: page_seen_at is fresh (app/api/widget/message).
  conv().page_seen_at = seconds(1)
  const later = await say('Still waiting on that refund')
  ok(later.triggered === true && offers().length === 1 && conv().claim_offered === true, 'when they next write in the website chat, the offer is made there', later)

  tables = world({ channel: 'sms', page_seen_at: seconds(600) })
  const gone = await say('It came broken')
  ok(gone.triggered === false && offers().length === 0, 'a chat they left ten minutes ago doesn’t count as watching', gone)

  tables = world({ channel: 'email', page_seen_at: null })
  const email = await say('I want a refund')
  ok(email.triggered === false && offers().length === 0, 'the same for any conversation that isn’t a website chat', email)
}

console.log('Unchanged')
{
  tables = world({ channel: 'widget' })
  const none = await say('What are your opening hours?')
  ok(none.triggered === false && offers().length === 0, 'no trigger word, no offer', none)
  const anon = await say('My fish arrived dead', { 'Content-Type': 'application/json' })
  ok(anon.status === 403 && offers().length === 0, 'only our own server may call it', anon)
}

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed')
process.exit(failures ? 1 : 0)
