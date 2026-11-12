// Runnable tests for the Inbox-plan locks (lib/plan-gate): which plans include
// live chat, email, Instagram/Messenger, campaigns, reviews, store connections
// and automatic replies; per-company overrides (the V433 "keep what they use"
// grants); a database outage letting the action through; which conversation
// channels need the Inbox plan to reply; and which admin pages show the plan
// card (components/PlanPageLock).
//
//   npx tsx scripts/plan-gate.test.mjs
//
// Zero-dependency: a tiny fake Supabase client stands in for the database.
// Made-up companies only. Exits non-zero if any check fails.

process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'http://127.0.0.1:1'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= 'anon'
globalThis.fetch = async () => { throw new Error('network disabled in tests') }

let failures = 0
const ok = (cond, name, extra) => { if (cond) console.log('  ok  ', name); else { failures++; console.log('  FAIL', name, extra === undefined ? '' : JSON.stringify(extra)) } }

// Tables are arrays of rows; `broken` names tables whose reads fail.
function fakeDb(tables, broken = []) {
  return {
    from(table) {
      const filters = []
      const q = {
        select() { return q },
        eq(col, val) { filters.push(r => r[col] === val); return q },
        async maybeSingle() {
          if (broken.includes(table)) return { data: null, error: { message: 'connection refused' } }
          const row = (tables[table] || []).find(r => filters.every(f => f(r)))
          return { data: row || null, error: null }
        },
      }
      return q
    },
  }
}

const { planAllows, planLock, lockedBody, GATED, PLAN_LOCKED_STATUS, channelNeedsInbox, replyNeedsInbox } = await import('../lib/plan-gate.ts')
const { featureForPage } = await import('../components/PlanPageLock.tsx')

const FEATURES = ['inbox', 'campaigns', 'reviewDashboard', 'ecommerceSync', 'aiAutomation']
const future = new Date(Date.now() + 7 * 864e5).toISOString()
const past = new Date(Date.now() - 864e5).toISOString()
const companies = [
  { id: 'co-free', plan: 'free' },
  { id: 'co-feedback', plan: 'feedback' },
  { id: 'co-phone', plan: 'phone' },
  { id: 'co-inbox', plan: 'omnichannel' },
  { id: 'co-everything', plan: 'everything' },
  { id: 'co-pro', plan: 'pro' },
  { id: 'co-trial', plan: 'trial', trial_ends_at: future },
  { id: 'co-trial-over', plan: 'trial', trial_ends_at: past },
  { id: 'co-kept', plan: 'free' },
  { id: 'co-removed', plan: 'everything' },
]
const db = fakeDb({
  companies,
  company_entitlements: [
    // V433: a Free workspace that already used email and campaigns keeps them.
    { company_id: 'co-kept', features: { inbox: true, campaigns: true } },
    // A super admin switched one feature off for an Everything workspace.
    { company_id: 'co-removed', features: { campaigns: false } },
  ],
})

console.log('Which plans include the Inbox features')
for (const id of ['co-free', 'co-feedback', 'co-phone', 'co-trial-over']) {
  for (const f of FEATURES) ok((await planAllows(db, id, f)) === false, `${id} has no ${f}`)
}
for (const id of ['co-inbox', 'co-everything', 'co-pro', 'co-trial']) {
  for (const f of FEATURES) ok((await planAllows(db, id, f)) === true, `${id} has ${f}`)
}

console.log('Per-company overrides')
ok(await planAllows(db, 'co-kept', 'inbox'), 'a kept grant unlocks inbox on Free')
ok(await planAllows(db, 'co-kept', 'campaigns'), 'a kept grant unlocks campaigns on Free')
ok(!(await planAllows(db, 'co-kept', 'reviewDashboard')), 'features without a grant stay locked')
ok(!(await planAllows(db, 'co-removed', 'campaigns')), 'an explicit false locks it on Everything')
ok(await planAllows(db, 'co-removed', 'inbox'), 'other Everything features unaffected')

console.log('Unknown companies and outages')
ok(!(await planAllows(db, '', 'inbox')), 'no company id is locked')
ok(!(await planAllows(db, 'co-missing', 'inbox')), 'a company that does not exist is locked')
ok(await planAllows(fakeDb({ companies }, ['companies']), 'co-free', 'inbox'), 'a failed plan read lets the action through')
ok(!(await planAllows(fakeDb({ companies }, ['company_entitlements']), 'co-free', 'inbox')), 'a failed override read falls back to the plan')
const throwing = { from() { throw new Error('boom') } }
ok(await planAllows(throwing, 'co-free', 'inbox'), 'a thrown error lets the action through')

console.log('The locked answer')
const res = await planLock(db, 'co-free', 'campaigns')
ok(res && res.status === PLAN_LOCKED_STATUS && PLAN_LOCKED_STATUS === 402, 'locked routes answer 402', res?.status)
const body = res ? await res.json() : null
ok(body?.upgrade === true && body?.feature === 'campaigns' && body?.error === GATED.campaigns.locked, 'body carries upgrade, feature and the words', body)
ok((await planLock(db, 'co-everything', 'campaigns')) === null, 'allowed routes get null')
ok(JSON.stringify(lockedBody('inbox')) === JSON.stringify({ error: GATED.inbox.locked, upgrade: true, feature: 'inbox' }), 'lockedBody shape')
for (const f of FEATURES) ok(/Inbox and Everything plans/.test(GATED[f].locked) && !/—/.test(GATED[f].locked), `${f} message names the plans`)

console.log('Which conversations need the Inbox plan to reply')
for (const c of ['widget', 'email', 'instagram', 'messenger', 'facebook', 'Email']) ok(channelNeedsInbox(c), `${c} needs it`)
for (const c of ['sms', 'phone', 'whatsapp', 'chat', 'form', 'realestate', 'prexty', 'colvy', '', null, undefined]) ok(!channelNeedsInbox(c), `${String(c)} does not`)

console.log('Which replies need the Inbox plan (by how they go out)')
for (const [via, conv, want] of [
  ['email', 'email', true], ['instagram', 'instagram', true], ['messenger', 'facebook', true], ['widget', 'widget', true],
  ['chat', 'widget', true], ['chat', 'email', true],
  ['sms', 'widget', false], ['sms', 'email', false], ['sms', 'instagram', false],
  ['chat', 'chat', false], ['chat', 'sms', false], ['whatsapp', 'whatsapp', false], ['colvy', 'colvy', false], ['', 'widget', false],
]) ok(replyNeedsInbox(via, conv) === want, `${via || '(none)'} reply on a ${conv} thread → ${want ? 'needs it' : 'doesn’t'}`)

console.log('Which admin pages show the plan card')
const pages = {
  '/admin/campaigns': 'campaigns',
  '/admin/campaigns/abc/report': 'campaigns',
  '/admin/crm-settings/campaigns': 'campaigns',
  '/admin/reviews': 'reviewDashboard',
  '/admin/social': 'reviewDashboard',
  '/admin/crm-settings/channels/google-reviews': 'reviewDashboard',
  '/admin/crm-settings/channels/email': 'inbox',
  '/admin/crm-settings/channels/meta': 'inbox',
  '/admin/integrations/woocommerce': 'ecommerceSync',
  '/admin/integrations/prexty': 'ecommerceSync',
  '/admin/crm-settings/auto-replies': 'aiAutomation',
  '/admin/crm-settings/power-ups': 'aiAutomation',
  '/admin/crm-settings/conversation-actions': 'aiAutomation',
}
for (const [p, f] of Object.entries(pages)) ok(featureForPage(p) === f, `${p} → ${f}`, featureForPage(p))
for (const p of ['/admin', '/admin/inbox', '/admin/crm-settings/channels', '/admin/crm-settings/chat-widget', '/admin/crm-settings/channels/calls', '/admin/crm-settings/channels/web-form', '/admin/crm-settings/channels/whatsapp', '/admin/integrations/shopify', '/admin/billing', '/admin/reviewsx', '/admin/campaignsx', null]) {
  ok(featureForPage(p) === null, `${String(p)} has no card`, featureForPage(p))
}

console.log(failures ? `\n${failures} failed` : '\nAll passed')
process.exit(failures ? 1 : 0)
