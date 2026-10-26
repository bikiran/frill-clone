// Runnable tests for SMS credit billed through Shopify (lib/shopify-usage and
// the Shopify parts of lib/sms-credits).
//
//   npx tsx scripts/shopify-sms-billing.test.mjs
//
// Zero-dependency (same pattern as scripts/form-logic.test.mjs): a small fake
// Supabase client stands in for the database, and fakes stand in for Shopify's
// App Events API and Stripe. Exits non-zero if any check fails.

let failures = 0
const ok = (cond, name) => { if (cond) console.log('  ok  ', name); else { failures++; console.log('  FAIL', name) } }

// ── A tiny fake Supabase client ──────────────────────────────────────────────
function fakeDb(tables, rpcImpl) {
  const calls = { rpc: [], updates: [] }
  const from = (table) => {
    const q = { table, filters: [], op: 'select', patch: null, single: false }
    const rows = () => (tables[table] || []).filter(r => q.filters.every(f => f(r)))
    const run = () => {
      if (q.op === 'update') {
        const hit = rows(); hit.forEach(r => Object.assign(r, q.patch)); calls.updates.push({ table, patch: q.patch, n: hit.length })
        return { data: q.single ? (hit[0] || null) : hit, error: null }
      }
      if (q.op === 'upsert') {
        const list = (tables[table] ||= []); const key = q.conflict
        const ex = list.find(r => r[key] === q.patch[key]); if (ex) Object.assign(ex, q.patch); else list.push({ ...q.patch })
        calls.updates.push({ table, patch: q.patch, n: 1 })
        return { data: null, error: null }
      }
      const r = rows()
      return { data: q.single ? (r[0] || null) : r, error: null }
    }
    const chain = {
      select: () => chain,
      eq: (k, v) => { q.filters.push(r => r[k] === v); return chain },
      in: (k, vs) => { q.filters.push(r => vs.includes(r[k])); return chain },
      not: () => chain, order: () => chain, limit: () => chain,
      or: (expr) => {
        // auto_topup_pending_at.is.null,auto_topup_pending_at.lt.<iso>
        const m = /lt\.(.+)$/.exec(expr); const cutoff = m ? m[1] : null
        q.filters.push(r => r.auto_topup_pending_at == null || (cutoff && r.auto_topup_pending_at < cutoff)); return chain
      },
      update: (patch) => { q.op = 'update'; q.patch = patch; return chain },
      upsert: (patch, o) => { q.op = 'upsert'; q.patch = patch; q.conflict = o?.onConflict || 'id'; return chain },
      insert: () => chain,
      maybeSingle: () => { q.single = true; return Promise.resolve(run()) },
      single: () => { q.single = true; return Promise.resolve(run()) },
      then: (res, rej) => Promise.resolve(run()).then(res, rej),
    }
    return chain
  }
  return { from, rpc: async (fn, args) => { calls.rpc.push({ fn, args }); return rpcImpl ? rpcImpl(fn, args) : { data: { ok: true, balance_cents: 0 }, error: null } }, calls, auth: { admin: { getUserById: async () => ({ data: null }) } } }
}

// Never reach the network.
globalThis.fetch = async () => { throw new Error('network disabled in tests') }

const usage = await import('../lib/shopify-usage.ts')
const credits = await import('../lib/sms-credits.ts')

console.log('Helpers')
{
  ok(usage.creditUnits(5000) === 50 && usage.creditUnits(1250) === '12.50', 'whole dollars go as a number, cents as a "12.50" string')
  const key = usage.usageKey('auto', '0b9c1d2e-3f4a-5b6c-7d8e-9f0a1b2c3d4e', new Date('2026-10-26T00:00:00Z'))
  ok(key.length <= 64 && key.startsWith('sms-auto-0b9c1d2e'), `idempotency key fits Shopify's 64 characters (${key.length})`)
  process.env.SHOPIFY_SMS_METER = 'sms_credit'
  const items = [{ handle: 'everything', price: { __typename: 'FlatRatePrice' } }, { handle: 'other_meter', price: { __typename: 'TieredPrice' } }, { handle: 'sms_credit', price: { __typename: 'TieredPrice' } }]
  ok(usage.meterItem(items)?.handle === 'sms_credit', 'finds the meter by its handle first')
  ok(usage.meterItem([{ handle: 'x', price: { __typename: 'FlatRatePrice' } }, { handle: 'usage', price: { __typename: 'TieredPrice' } }])?.handle === 'usage', 'else a usage (tiered) item')
  ok(usage.meterItem([{ handle: 'everything', price: { __typename: 'FlatRatePrice' } }]) === null, 'a flat plan alone has no meter')
}

const account = () => ({ company_id: 'co1', balance_cents: 500, auto_topup_enabled: true, auto_topup_threshold_cents: 1000, auto_topup_amount_cents: 5000, stripe_customer_id: 'cus_1', stripe_payment_method_id: 'pm_1', auto_topup_failures: 0, auto_topup_pending_at: null })
const baseTables = () => ({ companies: [{ id: 'co1', plan: 'everything', trial_ends_at: null }], sms_credit_accounts: [account()] })
const okRpc = (fn, args) => ({ data: { ok: true, balance_cents: 500 + (args.p_delta || 0) }, error: null })
const stripeFake = () => { const s = { calls: 0, paymentIntents: { create: async (p) => { s.calls++; return { id: 'pi_1', status: 'succeeded', amount: p.amount, amount_received: p.amount } } } }; return s }

console.log('Auto top-up through Shopify')
{
  const db = fakeDb(baseTables(), okRpc)
  const stripe = stripeFake(); const sent = []
  const r = await credits.maybeAutoTopUp(db, 'co1', {
    stripe, shopify: async () => ({ ready: true, shopGid: 'gid://shopify/Shop/1', integrationId: 'i1', planUrl: null, usage: null }),
    sendShopifyEvent: async (e) => { sent.push(e); return { ok: true, status: 202 } },
  })
  ok(r.ok && r.reason === 'topped_up', 'tops up')
  ok(sent.length === 1 && sent[0].value === 50 && sent[0].shopGid === 'gid://shopify/Shop/1', 'sends one billable event for A$50')
  ok(stripe.calls === 0, 'never charges the saved card')
  const apply = db.calls.rpc.find(c => c.fn === 'sms_credit_apply')
  ok(apply && apply.args.p_delta === 5000 && apply.args.p_kind === 'auto_topup' && apply.args.p_payment_intent === `shopify:${sent[0].key}`, 'credits A$50, recorded against the Shopify charge')
  ok(db.calls.rpc.length === 1, 'credited once')
}

console.log('Shopify workspace without the meter: no card, no event')
{
  const db = fakeDb(baseTables(), okRpc)
  const stripe = stripeFake(); const sent = []
  const r = await credits.maybeAutoTopUp(db, 'co1', {
    stripe, shopify: async () => ({ ready: false, reason: 'no_meter', planUrl: null }),
    sendShopifyEvent: async (e) => { sent.push(e); return { ok: true, status: 202 } },
  })
  ok(!r.ran && r.reason === 'shopify_not_ready', 'doesn’t run')
  ok(stripe.calls === 0 && sent.length === 0 && db.calls.rpc.length === 0, 'the card saved before Shopify is never charged (App Store rule 1.2.1)')
}

console.log('Not a Shopify workspace: the card as before')
{
  const db = fakeDb(baseTables(), okRpc)
  const stripe = stripeFake()
  const r = await credits.maybeAutoTopUp(db, 'co1', { stripe, shopify: async () => null })
  ok(r.ok && stripe.calls === 1, 'charges the saved card')
}

console.log('Shopify refuses twice: auto top-up switches off, the owner is told')
{
  const tables = baseTables()
  const db = fakeDb(tables, okRpc)
  const notes = []
  const deps = {
    shopify: async () => ({ ready: true, shopGid: 'gid://shopify/Shop/1', integrationId: 'i1', planUrl: null, usage: null }),
    sendShopifyEvent: async () => ({ ok: false, status: 500, error: 'boom' }),
    notifyDisabled: async (_db, _id, error, o) => { notes.push({ error, o }) },
  }
  const t0 = new Date('2026-10-26T00:00:00Z')
  const r1 = await credits.maybeAutoTopUp(db, 'co1', { ...deps, now: () => t0 })
  ok(!r1.ok && r1.reason === 'failed' && tables.sms_credit_accounts[0].auto_topup_failures === 1, 'first refusal counted')
  const r2 = await credits.maybeAutoTopUp(db, 'co1', { ...deps, now: () => new Date(t0.getTime() + 2 * 60 * 60 * 1000) })
  ok(r2.disabled === true && tables.sms_credit_accounts[0].auto_topup_enabled === false, 'second refusal switches it off')
  ok(notes.length === 1 && notes[0].o?.viaShopify === true, 'the owner hears it was Shopify, not a card')
  ok(db.calls.rpc.length === 0, 'nothing credited')
}

console.log('Charged by Shopify but the credit won’t save')
{
  const db = fakeDb(baseTables(), () => ({ data: { ok: false, reason: 'error' }, error: null }))
  const origError = console.error; console.error = () => {}
  const t = await credits.shopifyTopUp(db, { companyId: 'co1', amountCents: 2500, kind: 'topup', shopGid: 'gid://shopify/Shop/1', send: async () => ({ ok: true, status: 202 }) })
  console.error = origError
  ok(t.charged && !t.ok && t.key.startsWith('sms-buy-co1'), 'reports charged-not-credited with the reference to fix it by hand')
  ok(db.calls.rpc.length === 3 && db.calls.rpc.every(c => c.args.p_payment_intent === `shopify:${t.key}`), 'retried with the same reference (credited once at most)')
}

console.log('Shopify won’t take the event: nothing credited')
{
  const db = fakeDb(baseTables(), okRpc)
  const t = await credits.shopifyTopUp(db, { companyId: 'co1', amountCents: 2500, kind: 'topup', shopGid: 'gid://shopify/Shop/1', send: async () => ({ ok: false, status: 0, error: 'down' }) })
  ok(!t.charged && !t.ok && db.calls.rpc.length === 0, 'no credit without the charge')
}

console.log('Can this workspace buy through Shopify?')
{
  const now = new Date().toISOString()
  const tables = (meter) => ({
    companies: [{ id: 'co1', billing_provider: 'shopify', billing_integration_id: 'i1', plan: 'everything' }],
    shopify_integrations: [{ id: 'i1', company_id: 'co1', is_active: true, store_domain: 'roxy.myshopify.com', shop_gid: 'gid://shopify/Shop/1', billing: meter === undefined ? {} : { sms_meter: meter }, billing_checked_at: now }],
  })
  const env = { SHOPIFY_SMS_METER: 'sms_credit', SHOPIFY_PARTNER_API_TOKEN: 't', SHOPIFY_API_KEY: 'k', SHOPIFY_API_SECRET: 's' }
  Object.assign(process.env, env)
  const ready = await usage.shopifySmsBilling(fakeDb(tables({ metered: true, handle: 'sms_credit', usage: null, checked_at: now })), 'co1')
  ok(ready?.ready === true && ready.shopGid === 'gid://shopify/Shop/1' && /roxy\/charges\/colvy\/pricing_plans$/.test(ready.planUrl), 'ready with the meter on the plan')
  const noMeter = await usage.shopifySmsBilling(fakeDb(tables({ metered: false, handle: null, usage: null, checked_at: now })), 'co1')
  ok(noMeter && !noMeter.ready && noMeter.reason === 'no_meter', 'no meter on the plan: not ready')
  const unknown = await usage.shopifySmsBilling(fakeDb(tables(undefined)), 'co1')
  ok(unknown && !unknown.ready && unknown.reason === 'unknown', 'never checked and Shopify unreachable: not ready (fails closed)')
  delete process.env.SHOPIFY_SMS_METER
  const off = await usage.shopifySmsBilling(fakeDb(tables({ metered: true, handle: 'sms_credit', usage: null, checked_at: now })), 'co1')
  ok(off && !off.ready && off.reason === 'not_configured', 'switched off until SHOPIFY_SMS_METER is set')
  const card = await usage.shopifySmsBilling(fakeDb({ companies: [{ id: 'co2', billing_provider: null }], shopify_integrations: [] }), 'co2')
  ok(card === null, 'a card-billed workspace isn’t a Shopify one')
}

console.log(failures ? `\n${failures} failed` : '\nall passed')
process.exit(failures ? 1 : 0)
