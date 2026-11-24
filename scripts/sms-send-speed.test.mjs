// Runnable tests for how quickly a text reply gets going: the lookups every
// send waits on are read together (one round trip, not one after another),
// the same answers come back as before, and bookkeeping that needn't hold up
// the reply waits until after it.
//
//   npx tsx scripts/sms-send-speed.test.mjs
//
// Zero-dependency: a small fake Supabase client answers each read after a
// short delay, so the time a call takes shows how many round trips it made
// one after another. Made-up data. Exits non-zero if any check fails.

let failures = 0
const ok = (cond, name, extra) => { if (cond) console.log('  ok  ', name); else { failures++; console.log('  FAIL', name, extra === undefined ? '' : JSON.stringify(extra)) } }

const D = 30   // ms each read takes
const rounds = ms => Math.round(ms / D)

// ── A fake Supabase client: every read answers after D ms ────────────────────
function fakeDb(tables, rpcImpl) {
  const log = []
  const from = (table) => {
    const q = { table, filters: [], op: 'select', patch: null, single: false }
    const rows = () => (tables[table] || []).filter(r => q.filters.every(f => f(r)))
    const run = async () => {
      log.push({ table, op: q.op })
      await new Promise(r => setTimeout(r, D))
      if (q.op === 'update') { const hit = rows(); hit.forEach(r => Object.assign(r, q.patch)); return { data: q.single ? (hit[0] || null) : hit, error: null } }
      if (q.op === 'insert') { (tables[table] ||= []).push({ ...q.patch }); return { data: q.single ? q.patch : [q.patch], error: null } }
      const r = rows()
      return { data: q.single ? (r[0] || null) : r, error: null }
    }
    const chain = {
      select: () => chain,
      eq: (k, v) => { q.filters.push(r => r[k] === v); return chain },
      in: (k, vs) => { q.filters.push(r => vs.includes(r[k])); return chain },
      not: () => chain, order: () => chain, limit: () => chain, or: () => chain, gte: () => chain, lt: () => chain,
      update: (patch) => { q.op = 'update'; q.patch = patch; return chain },
      insert: (patch) => { q.op = 'insert'; q.patch = patch; return chain },
      maybeSingle: () => { q.single = true; return run() },
      single: () => { q.single = true; return run() },
      then: (res, rej) => run().then(res, rej),
    }
    return chain
  }
  const rpc = async (fn, args) => { log.push({ rpc: fn }); await new Promise(r => setTimeout(r, D)); return rpcImpl ? rpcImpl(fn, args) : { data: { ok: true, balance_cents: 0 }, error: null } }
  return { from, rpc, log }
}
const reads = (db, table) => db.log.filter(l => l.table === table).length
const timed = async (fn) => { const t = Date.now(); const v = await fn(); return { v, ms: Date.now() - t } }

// The provider's API, faked: no request leaves this machine.
const sentToCarrier = []
globalThis.fetch = async (url, init) => {
  const u = String(url)
  if (u.includes('api.telnyx.com')) { sentToCarrier.push(JSON.parse(init?.body || '{}')); return new Response(JSON.stringify({ data: { id: 'tx-test-1' } }), { status: 200, headers: { 'content-type': 'application/json' } }) }
  throw new Error('network disabled in tests')
}

const plan = await import('../lib/plan.ts')
const policyLib = await import('../lib/sms-policy.ts')
const credits = await import('../lib/sms-credits.ts')
const provider = await import('../lib/sms-provider.ts')
const lines = await import('../lib/location-lines.ts')

const CO = 'co-test-1'

console.log('The channels check from a row in hand gives the same answer')
{
  const plans = ['free', 'trial', 'phone', 'feedback', 'omnichannel', 'everything', 'pro', 'enterprise', 'suspended', 'something-else']
  const rowsToTry = [null, { company_id: CO, features: { channels: true } }, { company_id: CO, features: { channels: false } }, { company_id: CO, features: {}, limits: { smsPerMonth: 50 } }]
  let same = 0, total = 0, entSame = 0
  for (const p of plans) for (const row of rowsToTry) {
    const db = fakeDb({ company_entitlements: row ? [row] : [] })
    total++
    if (plan.hasFeatureFromRow(p, row, 'channels') === await plan.companyHasFeature(db, CO, 'channels', p)) same++
    const viaDb = await plan.resolveEntitlements(db, CO, p)
    if (JSON.stringify(viaDb) === JSON.stringify(plan.entitlementsFromRow(p, row))) entSame++
  }
  ok(same === total, `hasFeatureFromRow matches companyHasFeature (${same}/${total})`)
  ok(entSame === total, `entitlementsFromRow matches resolveEntitlements (${entSame}/${total})`)
}

const tables = () => ({
  companies: [{ id: CO, plan: 'everything', trial_ends_at: null, sms_provider: 'telnyx' }],
  company_entitlements: [{ company_id: CO, features: {}, limits: {} }],
  telnyx_integrations: [{ company_id: CO, api_key: 'KEY_madeup', phone_number: '+61400000999', messaging_profile_id: 'mp1' }],
  twilio_integrations: [],
  sms_usage: [{ company_id: CO, period: 'x', sent: 3 }],
})

console.log('The SMS policy: one round trip, the overrides read once')
{
  const db = fakeDb(tables())
  await policyLib.readPlanPolicies(db)   // the platform-wide policies are cached between sends
  const { v, ms } = await timed(() => policyLib.getSmsPolicy(db, CO, { fresh: false }))
  ok(rounds(ms) === 1, `one round trip (${ms} ms)`)
  ok(reads(db, 'company_entitlements') === 1, 'company_entitlements read once', reads(db, 'company_entitlements'))
  ok(v.entitled === true, 'Everything plan: texting is on')
  const free = fakeDb({ ...tables(), companies: [{ id: CO, plan: 'free' }] })
  ok((await policyLib.getSmsPolicy(free, CO)).entitled === false, 'Free plan: texting is off, as before')
  const off = fakeDb({ ...tables(), company_entitlements: [{ company_id: CO, features: { channels: false }, limits: {} }] })
  ok((await policyLib.getSmsPolicy(off, CO)).entitled === false, 'channels switched off for the company: texting is off (the override row is still honoured)')
  const capped = fakeDb({ ...tables(), company_entitlements: [{ company_id: CO, features: {}, limits: { smsPerMonth: 7 } }] })
  ok((await policyLib.getSmsPolicy(capped, CO)).allowance === 7, 'a per-company monthly limit still applies', (await policyLib.getSmsPolicy(capped, CO)).allowance)
}

console.log('The price check: one round trip')
{
  const db = fakeDb(tables())
  const { v, ms } = await timed(() => credits.quoteSend(db, CO, 1))
  ok(rounds(ms) === 1, `one round trip (${ms} ms)`)
  ok(v.parts === 1 && v.entitled, 'a one-part text on the Everything plan')
}

console.log('The provider: setting and numbers read together')
{
  const db = fakeDb(tables())
  const { v: sender, ms } = await timed(() => provider.resolveSmsSender(db, CO))
  ok(rounds(ms) === 1, `one round trip (${ms} ms)`)
  ok(sender?.provider === 'telnyx' && sender.from === '+61400000999', 'Telnyx with its number')
  const tw = fakeDb({ ...tables(), companies: [{ id: CO, plan: 'everything', sms_provider: 'twilio' }], twilio_integrations: [{ company_id: CO, account_sid: 'AC_madeup', auth_token: 't', phone_number: '+61400000888' }] })
  ok((await provider.resolveSmsSender(tw, CO))?.provider === 'twilio', 'Twilio when chosen and set up')
  const twBroken = fakeDb({ ...tables(), companies: [{ id: CO, plan: 'everything', sms_provider: 'twilio' }], twilio_integrations: [{ company_id: CO, account_sid: 'AC_madeup' }] })
  ok((await provider.resolveSmsSender(twBroken, CO))?.provider === 'telnyx', 'Twilio chosen but not set up: Telnyx, as before')
  ok(await provider.resolveSmsSender(fakeDb({ companies: [{ id: CO }] }), CO) === null, 'nothing set up: no sender')
}

console.log('A send with the price check started early')
{
  const db = fakeDb(tables())
  const sender = await provider.resolveSmsSender(db, CO)
  const quote = credits.quoteSend(db, CO, 1)
  await quote
  const before = db.log.length
  sentToCarrier.length = 0
  const r = await sender.send({ to: '0400 111 222', text: 'Hi Sam, it is in stock.', quote, later: (run) => run() })
  const during = db.log.slice(before)
  ok(r.id === 'tx-test-1', 'the text went')
  ok(!during.some(l => ['sms_usage', 'sms_credit_accounts', 'company_entitlements', 'sms_pricing'].includes(l.table)), 'no second price check before it went', during)
  ok(sentToCarrier[0]?.to === '+61400111222' && !('quote' in sentToCarrier[0]) && !('later' in sentToCarrier[0]), 'the carrier got an E.164 number and none of the billing fields', sentToCarrier[0])

  const before2 = db.log.length
  await sender.send({ to: '+61400111222', text: 'x'.repeat(300), quote: credits.quoteSend(db, CO, 1) })
  ok(db.log.slice(before2).some(l => l.table === 'sms_usage'), 'a quote for a different length is checked afresh')
}

console.log('A paid text: the low-balance top-up waits until after')
{
  const db = fakeDb({ ...tables(), sms_credit_accounts: [{ company_id: CO, balance_cents: 500, auto_topup_enabled: false }] })
  const quote = { parts: 1, unlimited: false, freeParts: 0, billableParts: 1, pricePerPart: 8, tier: null, costCents: 8, entitled: true, ready: true, balanceCents: 500, affordable: true, shortfallCents: 0, policy: { chargesCredit: true } }
  let deferred = null
  const r = await credits.chargeSingleSend(db, { companyId: CO, parts: 1, quote: Promise.resolve(quote), deferTopUp: (run) => { deferred = run } })
  ok(r.ok && r.chargedCents === 8, 'charged for the text', r)
  ok(typeof deferred === 'function' && reads(db, 'sms_credit_accounts') === 0, 'the top-up check is handed over, not run before the text goes')
  await deferred()
  ok(reads(db, 'sms_credit_accounts') === 1, 'and runs when called')
  const db2 = fakeDb({ ...tables(), sms_credit_accounts: [{ company_id: CO, balance_cents: 500, auto_topup_enabled: false }] })
  await credits.chargeSingleSend(db2, { companyId: CO, parts: 1, quote: Promise.resolve(quote) })
  ok(reads(db2, 'sms_credit_accounts') === 1, 'without a hand-over it still runs straight away, as before')
}

console.log('The reply line from a conversation already read')
{
  const db = fakeDb({ conversations: [{ id: 'cv1', company_id: CO, channel_number: '+61400000777' }], phone_numbers: [] })
  const known = { company_id: CO, channel_number: '+61400000777', assigned_location_id: null, location_id: null }
  ok(await lines.replyLineFor(db, CO, 'cv1', known) === '+61400000777' && reads(db, 'conversations') === 0, 'uses it without reading again')
  ok(await lines.replyLineFor(db, CO, 'cv1', { ...known, company_id: 'someone-else' }) === null, 'another company’s conversation: no line')
  ok(await lines.replyLineFor(db, CO, 'cv1', { company_id: CO }) === '+61400000777' && reads(db, 'conversations') === 1, 'a row without the line columns: read as before')
  ok(await lines.replyLineFor(db, CO, 'cv1') === '+61400000777', 'nothing handed over: read as before')
}

console.log(failures ? `\n${failures} FAILED` : '\nall passed')
process.exit(failures ? 1 : 0)
