// Runnable tests for "Notify customer" (lib/order-notify): which requests are
// quiet, which statuses a quiet change covers, the `_colvy_quiet` order meta
// and its one-hour window, and the hold rows the store webhooks check (held,
// refreshed, released, expired, and a database outage never holding anything).
//
//   npx tsx scripts/order-notify.test.mjs
//
// Zero-dependency: a tiny fake Supabase client stands in for the database.
// Made-up companies and orders only. Exits non-zero if any check fails.

import {
  wantsNotify, quietStatuses, quietMetaValue, quietByMeta,
  holdCustomerNotice, releaseCustomerNotice, customerNoticeHeld, QUIET_META_KEY,
} from '../lib/order-notify.ts'

let failures = 0
const ok = (cond, name, extra) => { if (cond) console.log('  ok  ', name); else { failures++; console.log('  FAIL', name, extra === undefined ? '' : JSON.stringify(extra)) } }

// order_chat_events with its unique (company, order, status) index.
function fakeDb(rows = [], { broken = false } = {}) {
  const query = (op, payload) => {
    const filters = []
    const run = () => {
      if (broken) return { data: null, error: { message: 'connection refused' } }
      const hit = rows.filter(r => filters.every(f => f(r)))
      if (op === 'delete') { for (const h of hit) rows.splice(rows.indexOf(h), 1); return { data: hit, error: null } }
      return { data: hit, error: null }
    }
    const q = {
      eq(c, v) { filters.push(r => r[c] === v); return q },
      in(c, vs) { filters.push(r => vs.includes(r[c])); return q },
      limit() { return q },
      then(res, rej) { return Promise.resolve(run()).then(res, rej) },
    }
    return q
  }
  return {
    rows,
    from() {
      return {
        select: () => query('select'),
        delete: () => query('delete'),
        insert: async row => {
          if (broken) return { error: { message: 'connection refused' } }
          if (rows.some(r => r.company_id === row.company_id && r.order_id === row.order_id && r.status === row.status)) return { error: { code: '23505', message: 'duplicate key' } }
          rows.push({ created_at: new Date().toISOString(), ...row })
          return { error: null }
        },
      }
    },
  }
}

const CO = 'c0000000-0000-4000-8000-000000000001'

console.log('Which requests are quiet')
ok(wantsNotify(undefined) && wantsNotify(true) && wantsNotify(null) && wantsNotify('yes'), 'ticked unless the request says otherwise')
ok(!wantsNotify(false) && !wantsNotify('false') && !wantsNotify(0) && !wantsNotify('0'), 'false (any spelling) is quiet')

console.log('Which statuses a quiet change covers')
ok(JSON.stringify(quietStatuses('completed')) === '["completed","processing"]', 'completing also covers the paid step on the way')
ok(JSON.stringify(quietStatuses('Cancelled')) === '["cancelled"]', 'cancel covers cancelled (case-insensitive)')
ok(quietStatuses('').length === 0, 'no status, nothing to hold')

console.log('The order meta (_colvy_quiet)')
const now = Date.parse('2026-11-13T02:00:00Z')
const meta = v => [{ id: 1, key: QUIET_META_KEY, value: v }]
ok(quietMetaValue(['completed', 'processing'], now) === `completed,processing@${now / 1000}`, 'value is "<statuses>@<unix seconds>"')
ok(quietByMeta(meta(quietMetaValue(['completed', 'processing'], now)), 'processing', now + 60e3), 'fresh marker holds a listed status')
ok(!quietByMeta(meta(quietMetaValue(['completed'], now)), 'refunded', now), 'a status not listed still sends')
ok(!quietByMeta(meta(quietMetaValue(['completed'], now)), 'completed', now + 61 * 60e3), 'an hour later it no longer holds')
ok(!quietByMeta(meta('completed'), 'completed', now) && !quietByMeta(meta('completed@x'), 'completed', now), 'a malformed marker holds nothing')
ok(!quietByMeta(undefined, 'completed', now) && !quietByMeta([{ key: 'other', value: 'completed@1' }], 'completed', now), 'no marker, nothing held')

console.log('Hold rows (what the store webhooks check)')
{
  const db = fakeDb()
  ok(await holdCustomerNotice(db, CO, 501, ['completed', 'processing']), 'hold written')
  ok(db.rows.map(r => r.status).sort().join() === 'quiet:completed,quiet:processing', 'one row per status, prefixed quiet:', db.rows)
  ok(await customerNoticeHeld(db, CO, 501, 'completed') && await customerNoticeHeld(db, CO, 501, 'processing'), 'webhook sees both as held')
  ok(!(await customerNoticeHeld(db, CO, 501, 'refunded')), 'another status on the same order is not held')
  ok(!(await customerNoticeHeld(db, CO, 502, 'completed')), 'another order is not held')
  ok(await holdCustomerNotice(db, CO, 501, ['completed']) && db.rows.filter(r => r.status === 'quiet:completed').length === 1, 'holding again refreshes, never duplicates')
  await releaseCustomerNotice(db, CO, 501, ['completed', 'processing'])
  ok(db.rows.length === 0 && !(await customerNoticeHeld(db, CO, 501, 'completed')), 'released: the next change notifies as usual')
}
{
  const db = fakeDb([{ company_id: CO, order_id: 503, status: 'quiet:completed', created_at: new Date(Date.now() - 25 * 3600e3).toISOString() }])
  ok(!(await customerNoticeHeld(db, CO, 503, 'completed')), 'a hold older than a day has expired')
}
{
  const db = fakeDb([], { broken: true })
  ok(!(await holdCustomerNotice(db, CO, 504, ['cancelled'])), 'a failed write reports it (the meta still guards Woo)')
  ok(!(await customerNoticeHeld(db, CO, 504, 'cancelled')), 'a database outage holds nothing by itself')
  ok(await customerNoticeHeld(db, CO, 504, 'cancelled', meta(quietMetaValue(['cancelled']))), '…but the order meta still holds it')
}

console.log(failures ? `\n${failures} check(s) FAILED` : '\nall checks passed')
process.exit(failures ? 1 : 0)
