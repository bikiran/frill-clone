// Runnable tests for the Colvy chat (lib/colvy-chat-core, lib/colvy-chat):
// what a person's thread shows, what counts as unread, and how their messages
// reach Colvy's own inbox.
//
//   npx tsx scripts/colvy-chat.test.mjs
//
// Zero-dependency: a small in-memory Supabase stand-in. Exits non-zero if any
// check fails.

let failures = 0
const ok = (cond, name) => { if (cond) console.log('  ok  ', name); else { failures++; console.log('  FAIL', name) } }

// Never reach the network.
globalThis.fetch = async () => { throw new Error('network disabled in tests') }

const core = await import('../lib/colvy-chat-core.ts')
const chatLib = await import('../lib/colvy-chat.ts')

const DAY = 864e5
const iso = (t) => new Date(t).toISOString()
const NOW = Date.parse('2026-10-27T09:00:00Z')

console.log('What a thread shows')
{
  const chat = { started_at: iso(NOW - 2 * DAY), last_read_at: null }
  const fresh = core.buildThread({ chat, updates: [], messages: [], now: NOW })
  ok(fresh.items.length === 1 && fresh.items[0].kind === 'welcome' && fresh.unread === 1, 'a new chat: the welcome, unread')

  const updates = [
    { id: 'u1', title: 'SMS is live', body: 'Text customers.', published_at: iso(NOW - 1 * DAY), link_url: '/admin/crm-settings/channels', link_label: 'Open Channels' },
    { id: 'draft', title: 'Draft', body: '', published_at: null },
    { id: 'future', title: 'Not yet', body: '', published_at: iso(NOW + DAY) },
    { id: 'old', title: 'Too old', body: '', published_at: iso(NOW - 2 * DAY - 31 * DAY) },
    { id: 'recent', title: 'Before you joined', body: '', published_at: iso(NOW - 2 * DAY - 29 * DAY) },
  ]
  const messages = [
    { id: 'm1', sender_type: 'visitor', content: 'How do I add a number?', created_at: iso(NOW - 3600e3) },
    { id: 'n1', sender_type: 'agent', sender_name: 'Bikiran Simkhada', content: 'Internal: VIP, call them', created_at: iso(NOW - 3000e3), is_internal: true },
    { id: 's1', sender_type: 'system', content: 'Conversation assigned', created_at: iso(NOW - 2900e3) },
    { id: 'e1', sender_type: 'agent', content: '   ', created_at: iso(NOW - 2800e3) },
    { id: 'm2', sender_type: 'agent', sender_name: 'Bikiran Simkhada', content: 'Settings → Channels → Calls.', created_at: iso(NOW - 2000e3) },
  ]
  const t = core.buildThread({ chat, updates, messages, now: NOW })
  const ids = t.items.map(i => i.id)
  ok(ids.includes('update:u1') && ids.includes('update:recent'), 'shows published updates, including ones from the month before they joined')
  ok(!ids.includes('update:draft') && !ids.includes('update:future') && !ids.includes('update:old'), 'never drafts, scheduled-later or older than that')
  ok(!ids.includes('n1') && !ids.includes('s1') && !ids.includes('e1'), 'never internal notes, system rows or empty ones')
  ok(t.items.find(i => i.id === 'm1')?.kind === 'me' && t.items.find(i => i.id === 'm2')?.kind === 'team', 'their messages and the team’s answers')
  ok(t.items.find(i => i.id === 'm2')?.from === 'Bikiran', 'an answer says who wrote it (first name)')
  ok(t.items.find(i => i.id === 'update:u1')?.link?.url === '/admin/crm-settings/channels', 'an update keeps its button')
  const times = t.items.map(i => Date.parse(i.at))
  ok(times.every((x, i) => i === 0 || x >= times[i - 1]), 'oldest first')

  const read = core.buildThread({ chat: { ...chat, last_read_at: iso(NOW - 2500e3) }, updates, messages, now: NOW })
  ok(read.unread === 1, `unread counts only what came after they last read, not their own (${read.unread})`)
}

console.log('Links on updates')
{
  ok(core.safeLink('https://colvy.com/blog', 'Read')?.url === 'https://colvy.com/blog', 'https links')
  ok(core.safeLink('/admin/billing', '')?.label === 'Open', 'pages inside Colvy, with a default label')
  ok(core.safeLink('//evil.example', 'x') === null && core.safeLink('javascript:alert(1)', 'x') === null && core.safeLink('http://plain.example', 'x') === null, 'nothing else becomes a button')
}

// ── A small in-memory Supabase ──────────────────────────────────────────────
function fakeDb(tables) {
  let seq = 0
  const calls = []
  const from = (table) => {
    const q = { table, filters: [], op: 'select', patch: null, single: false, ret: false }
    const list = () => (tables[table] ||= [])
    const rows = () => list().filter(r => q.filters.every(f => f(r)))
    const run = () => {
      calls.push({ table, op: q.op, patch: q.patch })
      if (q.op === 'insert') {
        const row = { id: `${table}-${++seq}`, created_at: new Date().toISOString(), ...q.patch }
        list().push(row); return { data: row, error: null }
      }
      if (q.op === 'upsert') {
        const ex = list().find(r => r[q.conflict] === q.patch[q.conflict])
        if (!ex) list().push({ started_at: new Date().toISOString(), last_read_at: null, conversation_id: null, contact_id: null, ...q.patch })
        else if (!q.ignore) Object.assign(ex, q.patch)
        return { data: null, error: null }
      }
      if (q.op === 'update') { const hit = rows(); hit.forEach(r => Object.assign(r, q.patch)); return { data: q.single ? (hit[0] || null) : hit, error: null } }
      if (q.op === 'delete') { const hit = new Set(rows()); tables[table] = list().filter(r => !hit.has(r)); return { data: null, error: null } }
      const r = rows(); return { data: q.single ? (r[0] || null) : r, error: null }
    }
    const chain = {
      select: () => chain, order: () => chain, limit: () => chain,
      eq: (k, v) => { q.filters.push(r => r[k] === v); return chain },
      is: (k, v) => { q.filters.push(r => (r[k] ?? null) === v); return chain },
      not: (k, op, v) => { q.filters.push(r => (r[k] ?? null) !== v); return chain },
      ilike: (k, v) => { q.filters.push(r => String(r[k] || '').toLowerCase() === String(v).toLowerCase()); return chain },
      insert: (patch) => { q.op = 'insert'; q.patch = patch; return chain },
      update: (patch) => { q.op = 'update'; q.patch = patch; return chain },
      upsert: (patch, o) => { q.op = 'upsert'; q.patch = patch; q.conflict = o?.onConflict || 'id'; q.ignore = !!o?.ignoreDuplicates; return chain },
      delete: () => { q.op = 'delete'; return chain },
      maybeSingle: () => { q.single = true; return Promise.resolve(run()) },
      then: (res, rej) => Promise.resolve(run()).then(res, rej),
    }
    return chain
  }
  return { from, calls, tables }
}
const alerts = () => { const sent = []; return { sent, notifyCompany: async (p) => { sent.push(['bell', p]) }, pushInboundMessage: async (p) => { sent.push(['push', p]) } } }
const user = { id: 'user-1', email: 'momo@hub.test', name: 'Momo Owner' }

console.log('Writing to Colvy')
{
  chatLib.resetColvyWorkspaceCache()
  const db = fakeDb({ companies: [{ id: 'colvy-co', slug: 'colvy', name: 'Colvy', logo_url: null }], colvy_chats: [], contacts: [], conversations: [], messages: [] })
  const chat = await chatLib.ensureChat(db, user)
  const again = await chatLib.ensureChat(db, user)
  ok(chat && again && db.tables.colvy_chats.length === 1, 'one chat per person, however often it’s opened')

  const a = alerts()
  const out = await chatLib.sendToColvy(db, { user, chat, text: '  How do I add a number?  ', from: { id: 'momo-co', name: 'Momo Hub' } }, a)
  ok(out.ok, 'the first message is sent')
  const conv = db.tables.conversations[0]
  ok(conv?.company_id === 'colvy-co' && conv.channel === 'colvy' && conv.status === 'open', 'it opens a conversation in Colvy’s own inbox on the Colvy app channel')
  const contact = db.tables.contacts[0]
  ok(contact?.company_id === 'colvy-co' && contact.email === 'momo@hub.test' && contact.source === 'colvy_app', 'with a contact for the person')
  const m = db.tables.messages[0]
  ok(m?.sender_type === 'visitor' && m.content === 'How do I add a number?' && m.delivery_channel === 'colvy', 'the message lands as theirs, trimmed')
  ok(m?.metadata?.colvy_app?.workspace_name === 'Momo Hub' && m.metadata.colvy_app.user_id === 'user-1', 'saying which workspace they wrote from')
  const row = db.tables.colvy_chats[0]
  ok(row.conversation_id === conv.id && row.contact_id === contact.id && !!row.last_read_at, 'their chat remembers the conversation and that they’ve read it')
  ok(conv.is_unread === true && conv.last_message === 'How do I add a number?', 'Colvy’s inbox shows it unread with the text')
  ok(a.sent.length === 2 && /Momo Owner \(Momo Hub\)/.test(a.sent[0][1].message) && a.sent[0][1].companyId === 'colvy-co', 'the Colvy team is alerted (bell and push)')

  const out2 = await chatLib.sendToColvy(db, { user, chat: db.tables.colvy_chats[0], text: 'Thanks!' }, alerts())
  ok(out2.ok && db.tables.conversations.length === 1 && db.tables.contacts.length === 1 && db.tables.messages.length === 2, 'the next message joins the same conversation')

  // The team answers in Colvy's inbox, with a note only staff see.
  db.tables.messages.push({ id: 'staff-1', conversation_id: conv.id, sender_type: 'agent', sender_name: 'Bikiran', content: 'Go to Channels.', created_at: new Date(Date.now() + 1000).toISOString() })
  db.tables.messages.push({ id: 'note-1', conversation_id: conv.id, sender_type: 'agent', sender_name: 'Bikiran', content: 'Upsell them', is_internal: true, created_at: new Date(Date.now() + 2000).toISOString() })
  const view = await chatLib.loadThread(db, db.tables.colvy_chats[0])
  ok(view.items.some(i => i.id === 'staff-1' && i.kind === 'team') && !view.items.some(i => i.id === 'note-1'), 'they see the team’s answer, never its internal note')
  ok(view.unread === 1, 'and it counts as unread')

  // Colvy deletes the conversation from its inbox: the next message starts a new one.
  db.tables.conversations = []
  const out3 = await chatLib.sendToColvy(db, { user, chat: db.tables.colvy_chats[0], text: 'Still there?' }, alerts())
  ok(out3.ok && db.tables.conversations.length === 1 && db.tables.colvy_chats[0].conversation_id === db.tables.conversations[0].id, 'a deleted conversation is started again')
  ok(db.tables.contacts.length === 1, 'with the same contact')
}

console.log('Reusing a contact, and refusing')
{
  chatLib.resetColvyWorkspaceCache()
  const db = fakeDb({ companies: [{ id: 'colvy-co', slug: 'colvy', name: 'Colvy' }], colvy_chats: [], contacts: [{ id: 'old-contact', company_id: 'colvy-co', email: 'MOMO@hub.test', name: 'Momo' }], conversations: [], messages: [] })
  const chat = await chatLib.ensureChat(db, user)
  await chatLib.sendToColvy(db, { user, chat, text: 'Hi' }, alerts())
  ok(db.tables.contacts.length === 1 && db.tables.conversations[0].contact_id === 'old-contact', 'someone already in Colvy’s contacts (any case) isn’t added twice')

  const empty = await chatLib.sendToColvy(db, { user, chat, text: '   ' }, alerts())
  ok(!empty.ok && empty.status === 400, 'an empty message is refused')
  const long = await chatLib.sendToColvy(db, { user, chat, text: 'x'.repeat(4001) }, alerts())
  ok(!long.ok && long.status === 413, 'so is one over 4,000 characters')

  chatLib.resetColvyWorkspaceCache()
  const none = fakeDb({ companies: [], colvy_chats: [], contacts: [], conversations: [], messages: [] })
  const c2 = await chatLib.ensureChat(none, user)
  const out = await chatLib.sendToColvy(none, { user, chat: c2, text: 'Hello?' }, alerts())
  ok(!out.ok && out.status === 503 && none.tables.messages.length === 0, 'without Colvy’s workspace nothing is written, and they’re told to email instead')
}

if (failures) { console.log(`\n${failures} failed`); process.exit(1) }
console.log('\nall passed')
