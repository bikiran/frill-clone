// Runnable tests for keyword auto-replies (lib/keyword-reply): the answer is
// delivered over the customer's channel BEFORE it is written into the thread;
// one that didn't go out is not written, doesn't use up the rule's one answer
// per conversation and comes back as not matched (so Colvy AI or a person
// answers); a website chat answer, which needs no delivery, is written as before.
//
//   npx tsx scripts/keyword-reply.test.mjs
//
// Zero-dependency: runKeywordReply makes its own database client, so a stub
// answers its requests from made-up rows. Nothing is sent and nothing leaves
// this machine. Exits non-zero if any check fails.

let failures = 0
const ok = (cond, name, got) => { if (cond) console.log('  ok  ', name); else { failures++; console.log('  FAIL', name, got === undefined ? '' : JSON.stringify(got)) } }

process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:1'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only'
delete process.env.ANTHROPIC_API_KEY   // no "is it really a question?" check: the keyword match alone decides
console.error = () => {}              // a failed delivery is logged; not wanted in the test output

// The database, as the REST calls the client makes: rows filtered by col=eq.value.
let tables = {}
const value = v => (v === 'true' ? true : v === 'false' ? false : v === 'null' ? null : v)
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(String(url))
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  if (!u.pathname.startsWith('/rest/v1/')) return json({})
  const rows = (tables[u.pathname.slice('/rest/v1/'.length)] ||= [])
  const filters = [...u.searchParams].filter(([, v]) => v.startsWith('eq.')).map(([k, v]) => r => r[k] === value(v.slice(3)))
  const hit = () => rows.filter(r => filters.every(f => f(r)))
  const method = String(init.method || 'GET').toUpperCase()
  if (method === 'POST') { const b = JSON.parse(init.body); rows.push(...(Array.isArray(b) ? b : [b])); return json([], 201) }
  if (method === 'PATCH') { const b = JSON.parse(init.body); hit().forEach(r => Object.assign(r, b)); return json([]) }
  return json(hit())
}

const { runKeywordReply } = await import('../lib/keyword-reply.ts')

const CO = 'co-1', CV = 'cv-1'
const ANSWER = 'We are open 9 to 5, Monday to Saturday.'
const world = () => ({
  conversations: [{ id: CV, company_id: CO, is_spam: false, contact_id: null }],
  companies: [{ id: CO, name: 'Reef & Co', plan: 'everything', trial_ends_at: null }],
  company_entitlements: [{ company_id: CO, features: { aiAutomation: true } }],
  keyword_replies: [{ id: 'kr-1', company_id: CO, is_active: true, name: 'Hours', keywords: ['opening hours'], reply: ANSWER, once_per_conversation: true, match_count: 0 }],
  keyword_reply_hits: [], messages: [],
})
const ask = (extra = {}) => runKeywordReply({ conversationId: CV, companyId: CO, text: 'Hi, what are your opening hours?', ...extra })
const answers = () => tables.messages.filter(m => m.metadata?.keyword_reply)

console.log('A text that is delivered')
{
  tables = world()
  let rowsWhenSent = null, sent = []
  const res = await ask({ channel: 'sms', deliver: async (reply) => { rowsWhenSent = answers().length; sent.push(reply) } })
  ok(res.matched === true && res.reply === ANSWER, 'it counts as answered', res)
  ok(sent.length === 1 && sent[0] === ANSWER, 'delivered once, the saved answer word for word', sent)
  ok(rowsWhenSent === 0, 'delivered before anything is written into the thread', rowsWhenSent)
  ok(answers().length === 1 && answers()[0].delivery_channel === 'sms' && answers()[0].content === ANSWER, 'then written once, as a text', answers())
  ok(tables.keyword_reply_hits.length === 1 && tables.keyword_replies[0].match_count === 1, 'and counted against the rule')

  const again = await ask({ channel: 'sms', deliver: async (reply) => { sent.push(reply) } })
  ok(again.matched === false && sent.length === 1 && answers().length === 1, 'the same rule doesn’t answer the conversation twice', again)
}

console.log('A text that can’t be delivered')
{
  tables = world()
  let tries = 0
  const res = await ask({ channel: 'sms', deliver: async () => { tries++; throw new Error('This customer has opted out of texts (they replied STOP), so it wasn’t texted.') } })
  ok(tries === 1, 'tried once, not again')
  ok(res.matched === false && res.reason === 'not delivered', 'it does not count as answered, so Colvy AI or a person takes the message', res)
  ok(answers().length === 0, 'nothing is written into the thread as if it had been sent', answers())
  ok(tables.conversations[0].last_message === undefined, 'the conversation’s last message is left alone')
  ok(tables.keyword_reply_hits.length === 0 && tables.keyword_replies[0].match_count === 0, 'the rule’s one answer for this conversation isn’t used up')

  let sent = []
  const later = await ask({ channel: 'sms', deliver: async (reply) => { sent.push(reply) } })
  ok(later.matched === true && sent.length === 1 && answers().length === 1, 'so the next matching message is answered when delivery works', later)
}

console.log('An email the mail service refuses')
{
  tables = world()
  const res = await ask({ channel: 'email', deliver: async () => { throw new Error('The answer couldn’t be emailed (403)') } })
  ok(res.matched === false && answers().length === 0, 'is not written into the thread marked Email', res)
}

console.log('Website chat (nothing to deliver: the visitor sees the thread)')
{
  tables = world()
  const res = await ask()
  ok(res.matched === true && answers().length === 1 && answers()[0].delivery_channel === 'chat', 'written into the chat as before', answers())
  ok(tables.keyword_reply_hits.length === 1, 'and counted against the rule')
}

console.log('No rule matches')
{
  tables = world()
  let tries = 0
  const res = await runKeywordReply({ conversationId: CV, companyId: CO, text: 'Do you sell clownfish?', channel: 'sms', deliver: async () => { tries++ } })
  ok(res.matched === false && tries === 0 && answers().length === 0, 'nothing is sent or written', res)
}

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed')
process.exit(failures ? 1 : 0)
