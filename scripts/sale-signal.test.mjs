// Tests for the "Record this as a Colvy sale?" prompt (lib/sale-signal.ts) and
// the agent's recent-purchases lines (lib/agent/customer-activity.ts).
// Made-up people and numbers only. Run:
//
//   npx tsx scripts/sale-signal.test.mjs

import { paymentClaim, methodIn, amountIn, suggestSale } from '../lib/sale-signal.ts'
import { wooItem, paymentItem, saleItem, formatActivity } from '../lib/agent/customer-activity.ts'

let passed = 0, failed = 0
const ok = (name, cond) => { if (cond) { passed++; console.log(`  ✓ ${name}`) } else { failed++; console.log(`  ✗ ${name}`) } }
const eq = (name, a, b) => ok(`${name} (got ${JSON.stringify(a)})`, JSON.stringify(a) === JSON.stringify(b))

console.log('Says they’ve paid')
for (const t of [
  'Payment is now made\nWe are available to receive delivery all of next week monday to Friday 7am -4pm\n Thanks\nSam',
  'Hi, I have transferred $500 this morning',
  'just paid via payid',
  'Payment sent!',
  'Sent the funds over, cheers',
  'Done the bank transfer 👍',
  'paid in full, thanks',
  'I’ve paid the invoice',
  'Transfer has been completed',
  'Here is the receipt for the deposit',
  'payment has gone through on my end',
]) ok(`yes: “${t.split('\n')[0]}”`, !!paymentClaim(t))

console.log('Doesn’t (questions, promises, not yet)')
for (const t of [
  'How do I pay?',
  'Can I pay by bank transfer?',
  'I’ll transfer it tomorrow morning',
  'Haven’t paid yet, will do tonight',
  'Do you take cash',
  'Once I’ve paid can you deliver Monday',
  'I paid for delivery last time, is it included?',
  'When I paid last time it took ages to arrive',
  'Can you send me the invoice so I can pay',
  'What are your bank details',
  'Thanks!',
]) ok(`no: “${t}”`, !paymentClaim(t))

console.log('How they paid, and amounts')
eq('bank transfer', methodIn('done the bank transfer'), 'Bank transfer')
eq('PayID counts as a bank transfer', methodIn('sent by payid'), 'Bank transfer')
eq('cash', methodIn('paid cash at the counter'), 'Cash')
eq('card', methodIn('paid with my visa'), 'Card')
eq('not said', methodIn('payment is now made'), null)
eq('the last amount', amountIn('Quote was $1,200 but total is $2,295.00'), 2295)
eq('no amount', amountIn('all paid'), null)

const T = Date.parse('2026-11-06T00:00:00Z')
const at = mins => new Date(T + mins * 60_000).toISOString()
const msg = (id, sender_type, content, mins, metadata) => ({ id, sender_type, content, created_at: at(mins), metadata })
const now = T + 120 * 60_000

console.log('The prompt: a chat-assisted sale (chat, a call, a quote rung up in the shop, a bank transfer)')
{
  const thread = [
    msg('m1', 'visitor', 'Hi, do you have the 8ft tank in stock?', 0),
    msg('c1', 'system', 'Call · 6 min', 5, { call_event: true, call_id: 'call-1' }),
    msg('m2', 'agent', 'Quote sent through, total $2,295.00. Bank details are on the quote.', 10),
    msg('m3', 'visitor', 'Payment is now made\nWe can take delivery Mon–Fri next week', 60),
    msg('p1', 'system', 'In-store sale R10234 at Example Shop · Order #50001 · $2295.00', 70, { order_event: true, order_id: 50001, status: 'completed', pos: 'prexty', pos_sale_id: 'R10234' }),
  ]
  const s = suggestSale(thread, { now, contactName: 'Sam Rivera' })
  ok('asks', !!s)
  eq('both triggers seen', s?.reason, 'both')
  eq('amount from the in-store sale', s?.amount, 2295)
  eq('note names the receipt and order', s?.note, 'Prexty receipt R10234 · order #50001')
  eq('about the latest of the two', s?.messageId, 'p1')
  ok('plain summary', /Sam says they’ve paid by bank transfer for receipt R10234/.test(s?.summary || ''))
  ok('a sale recorded after it: no prompt', !suggestSale(thread, { now, lastSaleAt: at(80) }))
  ok('…or a “Sale recorded” line in the thread', !suggestSale([...thread, msg('s1', 'system', 'Sale recorded · $2,295.00', 85, { sale_event: true })], { now }))
  ok('an older sale doesn’t hide a new one', !!suggestSale(thread, { now, lastSaleAt: at(-600) }))
  const claimOnly = suggestSale(thread.slice(0, 4), { now, contactName: 'Sam Rivera' })
  eq('claim only: the amount the team quoted', claimOnly?.amount, 2295)
  eq('claim only: reason', claimOnly?.reason, 'claim')
  eq('how they paid, from the bank details the team sent', s?.method, 'Bank transfer')
  const noBank = suggestSale([msg('a', 'agent', 'That will be $80 thanks', 0), msg('b', 'visitor', 'All paid!', 5)], { now })
  eq('no bank details sent: method left for the team', noBank?.method, null)
}

console.log('Not a Colvy sale: online orders and walk-in shop sales')
{
  const walkIn = [msg('p1', 'system', 'In-store sale R20001 at Example Shop · Order #50002 · $40.00', 10, { order_event: true, pos: 'prexty', pos_sale_id: 'R20001', status: 'completed' })]
  ok('a walk-in shop sale with no chat or call before it: no prompt', !suggestSale(walkIn, { now }))
  const online = [msg('m1', 'visitor', 'Is the heater in stock?', 0), msg('o1', 'system', 'Order #50003 — processing · $89.00', 30, { order_event: true, order_id: 50003, status: 'processing' })]
  ok('a website order after a chat: no prompt', !suggestSale(online, { now }))
  const refunded = [msg('m1', 'visitor', 'hi', 0), msg('p1', 'system', 'In-store sale refunded', 30, { order_event: true, pos: 'prexty', status: 'refunded' })]
  ok('a refunded in-store sale: no prompt', !suggestSale(refunded, { now }))
  const old = [msg('m1', 'visitor', 'I have paid', -20 * 24 * 60)]
  ok('a claim from weeks ago: no prompt', !suggestSale(old, { now }))
  const asked = [msg('m1', 'visitor', 'Can I pay by bank transfer?', 0)]
  ok('a question about paying: no prompt', !suggestSale(asked, { now }))
  const internal = [{ ...msg('n1', 'visitor', 'I have paid', 0), is_internal: true }]
  ok('internal notes don’t count', !suggestSale(internal, { now }))
  const thanked = [msg('m1', 'visitor', 'ok will do', 0), msg('a1', 'agent', 'Thanks for your payment, we’ll book the delivery', 20)]
  ok('the team thanking them for the payment asks too', suggestSale(thanked, { now })?.reason === 'claim')
}

console.log('The agent’s recent purchases and payments')
{
  const pos = wooItem({ woo_order_id: 50001, status: 'completed', total: '2295.00', currency: 'AUD', order_date: at(70), pos_source: 'prexty', pos_sale_id: 'R10234', pos_outlet: 'Example Shop' })
  ok('in-store sale line', /In-store sale — receipt R10234 at Example Shop, order #50001, \$2,295\.00 — paid in store/.test(pos.text))
  const web = wooItem({ woo_order_id: 50003, status: 'on-hold', total: '89', order_date: at(30) })
  ok('online order on hold reads as not confirmed', /Online order #50003, \$89\.00 — on hold \(payment not confirmed yet\)/.test(web.text) && web.paid === false)
  const link = paymentItem({ id: 'abcd1234ef', amount_cents: 50000, status: 'pending', description: 'Deposit', created_at: at(5) })
  ok('payment link not paid yet', /Payment link \$500\.00 for “Deposit” — sent, not paid yet/.test(link.text) && link.paid === false)
  const sale = saleItem({ amount: 120, payment_method: 'Bank transfer', sold_by_name: 'Jamie Tran', created_at: at(1) })
  ok('recorded sale', /Sale recorded by the team: \$120\.00 \(Bank transfer\), sold by Jamie Tran/.test(sale.text))
  const lines = formatActivity([web, pos, link, sale], 'Australia/Melbourne', now)
  ok('newest first', /In-store sale/.test(lines[0]) && /Online order/.test(lines[1]) && /Payment link/.test(lines[2]) && /Sale recorded/.test(lines[3]))
  ok('with when, in the business’s time', /^- Fri,? 6 Nov, 12:10pm \(50 min ago\): In-store sale/.test(lines[0]))
}

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
