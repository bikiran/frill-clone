// Runnable tests for where a bell notification goes when it's clicked
// (lib/notification-path). Made-up data.
//
//   npx tsx scripts/notification-path.test.mjs

let failures = 0
const ok = (cond, name, got) => { if (cond) console.log('  ok  ', name); else { failures++; console.log('  FAIL', name, got === undefined ? '' : JSON.stringify(got)) } }
const { notificationPath, orderRefOf, conversationOfPath } = await import('../lib/notification-path.ts')
const NOW = 1700000000000
const CONV = 'aaaaaaaa-1111-4222-8333-444444444444'
const go = n => notificationPath(n, NOW)

console.log('Orders open the order')
ok(go({ type: 'order', message: 'In-store sale R51200 at Reef & Fin Coburg · #130650 from Sam Rivers — $95.88', conversation_id: CONV }) === `/admin/orders?order=130650&at=${NOW}`, 'an in-store sale opens that order (not the inbox)', go({ type: 'order', message: 'In-store sale R51200 at Reef & Fin Coburg · #130650 from Sam Rivers — $95.88', conversation_id: CONV }))
ok(go({ type: 'order', message: 'Online order #130649 from Alex Chen — $649.96' }) === `/admin/orders?order=130649&at=${NOW}`, 'an online order opens that order')
ok(go({ type: 'order', message: 'In-store sale R50090 at Shop · Order #125656 · $92.85' }) === `/admin/orders?order=125656&at=${NOW}`, 'the webhook wording too')
ok(go({ type: 'order', message: 'Order completed #9001 from Kim — $10.00' }).includes('order=9001'), 'a completed order')
ok(go({ type: 'order', message: 'A new order came in', conversation_id: CONV }) === `/admin/inbox?conversation=${CONV}`, 'no number: its conversation')
ok(go({ type: 'order', message: 'A new order came in' }) === '/admin/orders', 'no number, no conversation: the Orders board')
ok(orderRefOf({ order_number: '#77' }) === '77', 'a stored order number wins')

console.log('Messages, the AI agent and assignments open the conversation')
for (const type of ['sms', 'chat', 'call', 'email', 'whatsapp', 'messenger', 'instagram', 'agent_escalation', 'conversation_assigned', 'mention', 'cart', 'ticket'])
  ok(go({ type, conversation_id: CONV, message: 'x' }) === `/admin/inbox?conversation=${CONV}`, `${type} → its conversation`)
ok(go({ type: 'agent_escalation', message: 'Support Agent needs a person' }) === '/admin/inbox', 'AI agent without a conversation: the inbox')

console.log('Other pages, and stored links')
ok(go({ type: 'calendar', link: `/admin/inbox?conversation=${CONV}` }) === `/admin/inbox?conversation=${CONV}`, 'a stored link is used')
ok(go({ type: 'calendar' }) === '/admin/calendar', 'calendar → the calendar')
ok(go({ type: 'booking' }) === '/admin/bookings', 'booking → bookings')
ok(go({ type: 'booking', conversation_id: CONV }) === `/admin/inbox?conversation=${CONV}`, 'booking with a conversation → it')
ok(go({ type: 'task_assigned' }) === '/admin/tasks', 'task assigned → tasks')
ok(go({ type: 'integration' }) === '/admin/integrations', 'integration → integrations')
ok(go({ type: 'sms', conversation_id: CONV, link: 'https://evil.example/x' }) === `/admin/inbox?conversation=${CONV}`, 'a link to another site is never followed')
ok(go({ type: 'sms', conversation_id: CONV, link: '//evil.example/x' }) === `/admin/inbox?conversation=${CONV}`, 'nor a protocol-relative one')
ok(go({ type: 'idea', idea_id: 'i1' }) === '/?idea=i1' && go({ type: 'roadmap' }) === '/roadmap', 'board types unchanged')
ok(go({ type: 'announcement', announcement_id: 'a1' }) === '/announcements?id=a1', 'announcement unchanged')
ok(go({ type: 'something_new', conversation_id: CONV }) === `/admin/inbox?conversation=${CONV}` && go({ type: 'something_new' }) === '/admin', 'unknown types: conversation, else the admin')

console.log('Which conversation an inbox link opens')
ok(conversationOfPath(`/admin/inbox?conversation=${CONV}`) === CONV, 'read from the link')
ok(conversationOfPath(`/admin/inbox?channel=sms&conversation=${CONV}`) === CONV, 'among other parameters')
ok(conversationOfPath('/admin/orders?order=1') === null && conversationOfPath('/admin/inbox') === null, 'none otherwise')

console.log(failures ? `\n${failures} FAILED` : '\nall passed')
process.exit(failures ? 1 : 0)
