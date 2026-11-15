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
ok(m?.by !== 'receipt' && !m?.saleId, 'a receipt for a different total is not this sale', m)
m = P.decidePosCopy({ ...base, receipts: [receipt('R50806', 0, { units: 3 })] })
ok(m?.by !== 'receipt' && !m?.saleId, 'a receipt with a different number of items is not this sale', m)
m = P.decidePosCopy({ ...base, receipts: [receipt('R50806', -240)] })
ok(m?.by !== 'receipt' && !m?.saleId, 'a receipt from four hours earlier is too long ago', m)

console.log('without receipts (Prexty webhook not set up)')
m = P.decidePosCopy({ ...base, learnedVia: ['rest-api'] })
ok(m?.by === 'likely' && m.inStore && m.saleId === null, 'made the way this store’s Prexty orders are: an in-store sale, no receipt number', m)
m = P.decidePosCopy({ ...base, learnedVia: ['rest-api'], twins: [twin(128880, 3, { isPos: true })] })
ok(m?.by === 'copy' && m.inStore && m.copyOf?.number === '128880', 'and the later copies are copies of it, in store', m)
m = P.decidePosCopy({ ...base, twins: [twin(128880, 3)] })
ok(m?.by === 'copy' && !m.inStore && m.copyOf?.number === '128880', 'a copy of an ordinary order: flagged as a copy, not called in store', m)
m = P.decidePosCopy({ ...base, order: { ...base.order, createdVia: 'admin' } })
ok(m === null, 'nothing to go on (made in WooCommerce admin, nothing learned): left as it was')
m = P.decidePosCopy({ ...base })
ok(m?.by === 'likely' && m.inStore, 'nothing learned yet: an order sent through the REST API (how Prexty sends sales) is in store', m)
m = P.decidePosCopy({ ...base, learnedVia: ['prexty-pos'] })
ok(m === null, 'once the store’s Prexty orders show how they’re made, only that counts', m)
m = P.decidePosCopy({ ...base, order: { ...base.order, createdVia: 'checkout' }, learnedVia: ['checkout'] })
ok(m === null, 'a website checkout is never called in store')
m = P.decidePosCopy({ ...base, twins: [twin(128890, 5)] })
ok(!m?.copyOf, 'an identical order placed AFTER this one is not its original', m)

// ── matchPosCopy against a small fake database ──────────────────────────────
function fakeDb(tables) {
  return {
    from(table) {
      if (!tables[table]) tables[table] = []
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
        update: (patch) => {
          const uf = []
          const u = {
            eq: (k, v) => { uf.push(r => r[k] === v); return u },
            then: (res, rej) => { for (const r of tables[table]) if (uf.every(f => f(r))) Object.assign(r, patch); return Promise.resolve({ error: null }).then(res, rej) },
          }
          return u
        },
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
  ok(await P.matchPosCopy(db, CO, guestOrder(128880, 3, { created_via: 'checkout', billing: { email: 'sam@example.com', address_1: '1 Example St' } })) === null, 'a website checkout order is never touched')
  ok(await P.matchPosCopy(db, CO, guestOrder(128880, 3, { created_via: 'store-api', billing: { email: 'sam@example.com' } })) === null, '…nor a block-checkout one')
  ok(await P.matchPosCopy(db, CO, guestOrder(128880, 3, { meta_data: [{ key: '_colvy_created_by', value: 'Alex' }], billing: { email: 'sam@example.com' } })) === null, '…nor one made in Colvy')
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

// ── The same receipt on several orders (tagged copies) ──────────────────────
console.log('one receipt on several WooCommerce orders')
const sale = (id, x = {}) => ({ woo_order_id: id, pos_source: 'prexty', pos_sale_id: 'R10001', pos_outlet: 'Coburg', total: 80, status: 'completed', ...x })
ok(P.saleKey(sale(1)) === P.saleKey(sale(2, { total: '80.00', pos_sale_id: 'r10001', pos_outlet: 'COBURG' })), 'same receipt, total and shop: the same sale (case and number format aside)')
ok(P.saleKey(sale(1)) !== P.saleKey(sale(2, { total: -80 })), 'a refund under the same receipt number is not a copy')
ok(P.saleKey(sale(1)) !== P.saleKey(sale(2, { pos_outlet: 'Preston' })), 'the same receipt number at another shop is another sale')
ok(P.saleKey({ woo_order_id: 3, total: 80, status: 'completed' }) === null, 'an online order has no sale key')
{
  const online = { woo_order_id: 90, total: 80, status: 'completed' }
  const rows = [sale(103), sale(101), online, sale(102)]
  const { kept, copies } = P.splitPosCopies(rows)
  ok(kept.length === 2 && kept[0].woo_order_id === 101 && kept[1] === online, 'three copies of one sale: one shown (the earliest), the online order untouched, order kept', kept.map(r => r.woo_order_id))
  ok(copies.map(r => r.woo_order_id).join() === '103,102', 'the other two are the copies', copies.map(r => r.woo_order_id))
  const lifetime = kept.filter(r => !['cancelled', 'refunded'].includes(r.status)).reduce((s, r) => s + Number(r.total), 0)
  ok(lifetime === 160, 'lifetime counts the sale once ($80 + $80 online)', lifetime)
}
{
  const { kept } = P.splitPosCopies([sale(101, { status: 'cancelled' }), sale(102), sale(103)])
  ok(kept.length === 1 && kept[0].woo_order_id === 102, 'the first copy was cancelled in WooCommerce: the live one is shown', kept)
  const all = P.splitPosCopies([sale(101, { status: 'cancelled' }), sale(102, { status: 'cancelled' })]).kept
  ok(all.length === 1 && all[0].woo_order_id === 101, 'all cancelled: one shown, still cancelled', all)
}
{
  const marked = { woo_order_id: 128881, total: 14.95, detail: { pos_match: { copyOf: { number: '128880' } } } }
  const orig = { woo_order_id: 128880, total: 14.95 }
  ok(P.splitPosCopies([marked, orig]).kept.length === 1, 'an order marked as a copy is dropped when its original is listed')
  ok(P.splitPosCopies([marked]).kept.length === 1, '…and kept when the original is not (nothing to show it under)')
  ok(P.collapsePosCopies([]).length === 0 && P.collapsePosCopies(null).length === 0, 'empty or missing lists are fine')
}
{
  const tagged = (id, x = {}) => ({ id, number: String(id), total: '80.00', billing: { email: 'sam@example.com' }, line_items: [leaf],
    meta_data: [{ key: '_prexty_source', value: 'pos' }, { key: '_prexty_sale_id', value: 'R10001' }, { key: '_prexty_outlet', value: 'Coburg' }], ...x })
  const db = fakeDb({ woocommerce_orders: [{ company_id: CO, woo_order_id: 500, total: 80, pos_source: 'prexty', pos_sale_id: 'R10001', pos_outlet: 'Coburg', pos_location_id: 'loc-coburg' }] })
  let map = await P.findTaggedCopies(db, CO, [tagged(501), tagged(502)])
  ok(map.get(501)?.copyOf?.number === '500' && map.get(502)?.copyOf?.number === '500' && map.get(501)?.inStore && map.get(501)?.locationId === 'loc-coburg', 'two more orders with a saved receipt: both copies of the saved one, at its shop', [...map.entries()])
  map = await P.findTaggedCopies(fakeDb({ woocommerce_orders: [] }), CO, [tagged(602), tagged(601)])
  ok(!map.has(601) && map.get(602)?.copyOf?.number === '601', 'both arrive together: the lower order id is the sale', [...map.entries()])
  map = await P.findTaggedCopies(db, CO, [tagged(500)])
  ok(map.size === 0, 'the sale itself is never a copy of itself')
  map = await P.findTaggedCopies(db, CO, [tagged(503, { total: '-80.00' })])
  ok(map.size === 0, 'a refund under the same receipt is not a copy')
  map = await P.findTaggedCopies(db, CO, [{ ...tagged(504), meta_data: [] }])
  ok(map.size === 0, 'an untagged order is left to the receipt matcher')
}

// ── From Prexty without the tag, with a placeholder email or a walk-in account ──
console.log('never an "Online order" when it came from Prexty')
{
  const walkIn = (id, mins, x = {}) => guestOrder(id, mins, { customer_id: 77, billing: { first_name: 'Customer', email: 'walkin@shop.example', phone: '' }, ...x })
  ok(P.isEligible(walkIn(1, 0)), 'a walk-in "Customer" with a placeholder email, sent through the REST API: checked')
  ok(!P.isEligible(walkIn(1, 0, { created_via: 'checkout' })), 'the same through the website checkout: an online order, not checked')
  ok(P.buyerKey(walkIn(1, 0)) === 'e:walkin@shop.example' && P.buyerKey(guestOrder(1, 0, { customer_id: 77 })) === 'c:77' && P.buyerKey(guestOrder(1, 0)) === 'guest', 'buyer: email, else phone, else account, else guest')
  const db = fakeDb({
    prexty_integrations: [{ company_id: CO, is_active: true }], prexty_receipts: [],
    woocommerce_orders: [row(127000, -600, { pos_source: 'prexty', pos_sale_id: 'R49000', detail: { created_via: 'rest-api' } })],
  })
  m = await P.matchPosCopy(db, CO, walkIn(128912, 3))
  ok(m?.by === 'likely' && m.inStore, 'it is an in-store sale (made the way this store’s Prexty orders are)', m)
  db.from('woocommerce_orders') // keep the fake honest
  const saved = { ...row(128912, 3), woo_customer_id: 77, billing: { first_name: 'Customer', email: 'walkin@shop.example' }, customer_email: 'walkin@shop.example', pos_source: 'prexty', detail: { created_via: 'rest-api', pos_match: { by: 'likely', inStore: true, saleId: null, copyOf: null } } }
  const db2 = fakeDb({ prexty_integrations: [{ company_id: CO, is_active: true }], prexty_receipts: [], woocommerce_orders: [saved] })
  m = await P.matchPosCopy(db2, CO, walkIn(128913, 4))
  ok(m?.by === 'copy' && m.inStore && m.copyOf?.number === '128912', 'the same sale again a minute later, same walk-in account: a copy', m)
  m = await P.matchPosCopy(db2, CO, walkIn(128914, 4, { billing: { first_name: 'Robin', email: 'robin@example.com' } }))
  ok(m?.by === 'likely' && !m.copyOf, 'someone else buying the same thing: their own sale, not a copy', m)
}
{
  // Today's orders saved as online orders before this check: put right by the scheduled sync.
  const rows = [
    { ...row(128893, 1), woo_customer_id: 77, customer_email: 'walkin@shop.example', billing: { email: 'walkin@shop.example' }, detail: { created_via: 'rest-api' } },
    { ...row(128894, 1.5), woo_customer_id: 77, customer_email: 'walkin@shop.example', billing: { email: 'walkin@shop.example' }, detail: { created_via: 'rest-api' } },
    { ...row(128895, 2), customer_email: 'sam@example.com', billing: { email: 'sam@example.com' }, detail: { created_via: 'checkout' } },
    { ...row(128896, 2.5), customer_email: 'jo@example.com', billing: { email: 'jo@example.com' }, attribution: 'chat_order', detail: { created_via: 'rest-api' } },
  ].map(r => ({ ...r, order_date: new Date(Date.now() - 30 * MIN + (r.woo_order_id - 128893) * MIN).toISOString() }))
  const db = fakeDb({ prexty_integrations: [{ company_id: CO, is_active: true }], prexty_receipts: [], woocommerce_orders: rows.map(r => ({ ...r })) })
  const n = await P.rematchRecent(db, CO, rows)
  const by = id => rows.find(r => r.woo_order_id === id)
  ok(n === 2, 'two of today’s orders put right', n)
  ok(by(128893).pos_source === 'prexty' && by(128893).detail.pos_match?.by === 'likely', '#128893 is now an in-store sale', by(128893))
  ok(by(128894).pos_source === 'prexty' && by(128894).detail.pos_match?.copyOf?.number === '128893', '#128894 is a copy of it', by(128894).detail)
  ok(!by(128895).pos_source && !by(128895).detail.pos_match, 'the website checkout order is left alone')
  ok(!by(128896).pos_source && !by(128896).detail.pos_match, 'an order linked to a chat (possibly made in Colvy) is left alone')
  ok(P.orderTime({ order_date: '2026-11-15T00:00:00Z' }) === Date.parse('2026-11-15T00:00:00Z'), 'a saved row’s time is read from order_date')
}

console.log(failures ? `\n${failures} failed` : '\nall passed')
process.exit(failures ? 1 : 0)
