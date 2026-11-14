// In-store sales that reach WooCommerce without Prexty's tag, or more than once
// (lib/pos-copies). Made-up orders only.
//
//   npx tsx scripts/pos-copies.test.mjs

process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'http://127.0.0.1:1'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= 'anon'
globalThis.fetch = async () => { throw new Error('network disabled in tests') }

const P = await import('../lib/pos-copies.ts')

let failures = 0
const ok = (cond, name, extra) => { if (cond) console.log('  ok  ', name); else { failures++; console.log('  FAIL', name, extra === undefined ? '' : JSON.stringify(extra)) } }

const MIN = 60_000
const T0 = Date.parse('2026-11-15T10:14:00+11:00')   // the sale at the till
const leaf = { product_id: 501, sku: '331229', name: 'Almond leaves', quantity: 1, total: '13.59' }
const guestOrder = (id, minsAfter, x = {}) => ({
  id, number: String(id), total: '14.95', created_via: 'rest-api',
  date_created_gmt: new Date(T0 + minsAfter * MIN).toISOString().replace('Z', ''),
  billing: { first_name: 'Customer', email: '', phone: '', address_1: '' }, shipping: {},
  line_items: [leaf], meta_data: [], ...x,
})

console.log('what counts as an untagged in-store copy')
ok(P.isGuestShape(guestOrder(1, 0)), 'no email, phone or address: guest shape')
ok(!P.isGuestShape(guestOrder(1, 0, { billing: { email: 'sam@example.com' } })), 'an email: a website order, never touched')
ok(!P.isGuestShape(guestOrder(1, 0, { shipping: { address_1: '1 Example St' } })), 'a delivery address: never touched')
ok(P.madeByColvy(guestOrder(1, 0, { meta_data: [{ key: '_colvy_created_by', value: 'Alex' }] })), 'an order Colvy created is recognised')
ok(P.fingerprint(guestOrder(1, 0)) === P.fingerprint(guestOrder(2, 3)), 'same items and total: same fingerprint')
ok(P.fingerprint(guestOrder(1, 0)) !== P.fingerprint(guestOrder(2, 0, { total: '29.90', line_items: [{ ...leaf, quantity: 2 }] })), 'two packs: a different fingerprint')
ok(P.orderTime(guestOrder(1, 4)) === T0 + 4 * MIN, 'the order time is read from date_created_gmt (UTC)')

console.log('the decision')
const base = { order: { totalCents: 1495, units: 1, time: T0 + 4 * MIN, createdVia: 'rest-api' }, eligible: true, receipts: [], twins: [], usedSaleIds: new Set(), learnedVia: [] }
const receipt = (saleNo, minsAfter = 0, x = {}) => ({ saleNo, totalCents: 1495, units: 1, soldAt: T0 + minsAfter * MIN, outlet: 'Somerton', locationId: 'loc-somerton', ...x })
const twin = (wooOrderId, minsAfter, x = {}) => ({ wooOrderId, number: String(wooOrderId), time: T0 + minsAfter * MIN, isPos: false, saleId: null, outlet: null, locationId: null, copyOf: null, ...x })

ok(P.decidePosCopy({ ...base, eligible: false, receipts: [receipt('R50806')] }) === null, 'not eligible (tagged, has an email, Prexty off): left alone')
let m = P.decidePosCopy({ ...base, receipts: [receipt('R50806')] })
ok(m?.by === 'receipt' && m.inStore && m.saleId === 'R50806' && m.locationId === 'loc-somerton' && !m.copyOf, 'the first copy takes its Prexty receipt and shop', m)
m = P.decidePosCopy({ ...base, receipts: [receipt('R50806')], usedSaleIds: new Set(['R50806']), twins: [twin(128880, 3, { isPos: true, saleId: 'R50806', outlet: 'Somerton', locationId: 'loc-somerton' })] })
ok(m?.by === 'copy' && m.inStore && m.saleId === 'R50806' && m.copyOf?.number === '128880', 'the next copy is a copy of #128880, same receipt', m)
m = P.decidePosCopy({ ...base, receipts: [receipt('R50806')], usedSaleIds: new Set(['R50806']), twins: [twin(128880, 3, { isPos: true, saleId: 'R50806' }), twin(128881, 3.5, { isPos: true, saleId: 'R50806', copyOf: '128880' })] })
ok(m?.copyOf?.number === '128880', 'a third copy still points at the original, not at another copy', m)
m = P.decidePosCopy({ ...base, receipts: [receipt('R50806'), receipt('R50807', 2)], usedSaleIds: new Set(['R50806']), twins: [twin(128880, 3, { isPos: true, saleId: 'R50806' })] })
ok(m?.by === 'receipt' && m.saleId === 'R50807' && !m.copyOf, 'two walk-ins buying the same thing: two receipts, two sales', m)
m = P.decidePosCopy({ ...base, receipts: [receipt('R50806', 0, { totalCents: 2990 })] })
ok(m === null, 'a receipt for a different total is not this sale')
m = P.decidePosCopy({ ...base, receipts: [receipt('R50806', 0, { units: 3 })] })
ok(m === null, 'a receipt with a different number of items is not this sale')
m = P.decidePosCopy({ ...base, receipts: [receipt('R50806', -240)] })
ok(m === null, 'a receipt from four hours earlier is too long ago')

console.log('without receipts (Prexty webhook not set up)')
m = P.decidePosCopy({ ...base, learnedVia: ['rest-api'] })
ok(m?.by === 'likely' && m.inStore && m.saleId === null, 'made the way this store’s Prexty orders are: an in-store sale, no receipt number', m)
m = P.decidePosCopy({ ...base, learnedVia: ['rest-api'], twins: [twin(128880, 3, { isPos: true })] })
ok(m?.by === 'copy' && m.inStore && m.copyOf?.number === '128880', 'and the later copies are copies of it, in store', m)
m = P.decidePosCopy({ ...base, twins: [twin(128880, 3)] })
ok(m?.by === 'copy' && !m.inStore && m.copyOf?.number === '128880', 'a copy of an ordinary order: flagged as a copy, not called in store', m)
m = P.decidePosCopy({ ...base })
ok(m === null, 'nothing to go on: left as it was')
m = P.decidePosCopy({ ...base, order: { ...base.order, createdVia: 'checkout' }, learnedVia: ['checkout'] })
ok(m === null, 'a website checkout is never called in store')
m = P.decidePosCopy({ ...base, twins: [twin(128890, 5)] })
ok(m === null, 'an identical order placed AFTER this one is not its original')

// ── matchPosCopy against a small fake database ──────────────────────────────
function fakeDb(tables) {
  return {
    from(table) {
      const filters = []
      let limit = Infinity, order = null, single = false
      const q = {
        select: () => q,
        eq: (k, v) => { filters.push(r => r[k] === v); return q },
        neq: (k, v) => { filters.push(r => r[k] !== v); return q },
        gte: (k, v) => { filters.push(r => r[k] != null && String(r[k]) >= v); return q },
        lte: (k, v) => { filters.push(r => r[k] != null && String(r[k]) <= v); return q },
        in: (k, vs) => { filters.push(r => vs.includes(r[k])); return q },
        order: (k, o) => { order = [k, o?.ascending !== false]; return q },
        limit: (n) => { limit = n; return q },
        maybeSingle: () => { single = true; return q },
        then: (res, rej) => {
          let rows = (tables[table] || []).filter(r => filters.every(f => f(r)))
          if (order) rows = [...rows].sort((a, b) => (a[order[0]] < b[order[0]] ? -1 : 1) * (order[1] ? 1 : -1))
          rows = rows.slice(0, limit)
          return Promise.resolve({ data: single ? rows[0] || null : rows, error: null }).then(res, rej)
        },
      }
      return q
    },
  }
}
const iso = (mins) => new Date(T0 + mins * MIN).toISOString()
const CO = 'co-1'
const row = (id, mins, x = {}) => ({ company_id: CO, woo_order_id: id, total: 14.95, line_items: [leaf], billing: { email: '' }, customer_email: null, order_date: iso(mins), pos_source: null, pos_sale_id: null, pos_outlet: null, pos_location_id: null, detail: { created_via: 'rest-api' }, ...x })

console.log('the database lookup')
{
  const db = fakeDb({
    prexty_integrations: [{ company_id: CO, is_active: true }],
    prexty_receipts: [{ company_id: CO, sale_no: 'R50806', prexty_order_id: '9001', total: 14.95, units: 1, sold_at: iso(0), outlet_name: 'Somerton', location_id: 'loc-somerton', status: 'completed' }],
    woocommerce_orders: [],
  })
  m = await P.matchPosCopy(db, CO, guestOrder(128880, 3))
  ok(m?.by === 'receipt' && m.saleId === 'R50806' && m.locationId === 'loc-somerton', 'the first untagged copy finds receipt R50806', m)
  db.from('x') // keep the fake honest
}
{
  const db = fakeDb({
    prexty_integrations: [{ company_id: CO, is_active: true }],
    prexty_receipts: [{ company_id: CO, sale_no: 'R50806', prexty_order_id: '9001', total: 14.95, units: 1, sold_at: iso(0), outlet_name: 'Somerton', location_id: 'loc-somerton', status: 'completed' }],
    woocommerce_orders: [row(128880, 3, { pos_source: 'prexty', pos_sale_id: 'R50806', pos_outlet: 'Somerton', pos_location_id: 'loc-somerton', detail: { created_via: 'rest-api', pos_match: { by: 'receipt', inStore: true, saleId: 'R50806', copyOf: null } } })],
  })
  m = await P.matchPosCopy(db, CO, guestOrder(128881, 4))
  ok(m?.by === 'copy' && m.saleId === 'R50806' && m.copyOf?.number === '128880' && m.locationId === 'loc-somerton', 'the second copy is a copy of #128880, in store at Somerton', m)
}
{
  const db = fakeDb({ prexty_integrations: [{ company_id: CO, is_active: false }], prexty_receipts: [], woocommerce_orders: [] })
  ok(await P.matchPosCopy(db, CO, guestOrder(128880, 3)) === null, 'Prexty disconnected: nothing happens')
}
{
  const db = fakeDb({ prexty_integrations: [{ company_id: CO, is_active: true }], prexty_receipts: [], woocommerce_orders: [] })
  ok(await P.matchPosCopy(db, CO, guestOrder(128880, 3, { meta_data: [{ key: '_prexty_source', value: 'pos' }] })) === null, 'a tagged order is handled the normal way')
  ok(await P.matchPosCopy(db, CO, guestOrder(128880, 3, { billing: { email: 'sam@example.com' } })) === null, 'a website order with an email is never touched')
}
{
  // No Prexty webhook: learn from the store's tagged orders, then catch the copies.
  const db = fakeDb({
    prexty_integrations: [{ company_id: CO, is_active: true }],
    prexty_receipts: [],
    woocommerce_orders: [row(127000, -600, { pos_source: 'prexty', pos_sale_id: 'R49000', detail: { created_via: 'rest-api' }, total: 31.84, line_items: [{ sku: 'X', quantity: 2 }] })],
  })
  m = await P.matchPosCopy(db, CO, guestOrder(128880, 3))
  ok(m?.by === 'likely' && m.inStore, 'no receipts: an order made the way Prexty makes them is called in store', m)
}

console.log(failures ? `\n${failures} failed` : '\nall passed')
process.exit(failures ? 1 : 0)
