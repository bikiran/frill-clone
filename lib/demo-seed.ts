import { createClient } from '@supabase/supabase-js'

// Seeds (and re-seeds) demo workspaces with realistic, entirely fictional sample
// data across Colvy's real tables. Safe to run repeatedly: it wipes a demo
// company's own data and rebuilds it, and never touches any other tenant. All
// names/emails/phones/addresses are made up.

export const DEMO_SLUG = 'demo'
export const DEMO_EMAIL = 'demo@colvy.com'
export const DEMO_COMPANY_NAME = 'Harbour & Bean Café'
export function demoPassword() { return process.env.DEMO_PASSWORD || 'ColvyDemo2026!' }

export function demoAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Deterministic pseudo-random so re-seeds produce the same showcase.
function rng(seed: number) { let s = seed % 2147483647; if (s <= 0) s += 2147483646; return () => (s = (s * 16807) % 2147483647) / 2147483647 }
const pick = <T,>(arr: T[], r: number) => arr[Math.floor(r * arr.length) % arr.length]
const daysAgo = (d: number) => new Date(Date.now() - d * 86400000).toISOString()
const minsAgo = (m: number) => new Date(Date.now() - m * 60000).toISOString()

const TEAM = [
  { name: 'Mia Nguyen', email: 'mia@harbourbean.example', role: 'admin' },
  { name: 'Noah Patel', email: 'noah@harbourbean.example', role: 'editor' },
  { name: 'Olivia Chen', email: 'olivia@harbourbean.example', role: 'editor' },
  { name: 'Ethan Walker', email: 'ethan@harbourbean.example', role: 'editor' },
  { name: 'Ava Rossi', email: 'ava@harbourbean.example', role: 'viewer' },
  { name: 'Liam Murphy', email: 'liam@harbourbean.example', role: 'viewer' },
]
const SUBURBS = [
  { s: 'Brunswick', c: 'Melbourne' }, { s: 'Footscray', c: 'Melbourne' }, { s: 'Fitzroy', c: 'Melbourne' },
  { s: 'Carlton', c: 'Melbourne' }, { s: 'Richmond', c: 'Melbourne' }, { s: 'St Kilda', c: 'Melbourne' },
  { s: 'Point Cook', c: 'Melbourne' }, { s: 'Essendon', c: 'Melbourne' }, { s: 'Geelong', c: 'Geelong' },
  { s: 'Caroline Springs', c: 'Melbourne' },
]
const FIRST = ['Amelia', 'Oliver', 'Charlotte', 'Jack', 'Isla', 'Leo', 'Mia', 'Noah', 'Ruby', 'Henry', 'Grace', 'Thomas', 'Chloe', 'Lucas', 'Zoe', 'Max', 'Ella', 'Finn', 'Ivy', 'Sam']
const LAST = ['Carter', 'Nguyen', 'Smith', 'Brown', 'Wilson', 'Lee', 'Taylor', 'Martin', 'Singh', 'OBrien', 'Kelly', 'Ryan', 'Chen', 'Walker', 'Rossi', 'Murphy']
const CHANNELS = ['instagram', 'facebook', 'email', 'chat', 'sms']
const TAGS_POOL = ['VIP', 'Repeat Buyer', 'Wholesale', 'Catering', 'Loyalty', 'New Customer', 'Reviewer']
const AGENT_LINES = ['Thanks for reaching out! Happy to help with that.', 'Absolutely — weu2019ve got you sorted.', 'Great question! Let me check and get back to you.', 'Yes we do — would you like me to book that in?', 'No problem at all, see you soon ☕']

// Per-template flavour: featured conversations, visitor lines and review text.
type Template = 'cafe' | 'retail' | 'automotive' | 'aquarium'
const TEMPLATES: Record<Template, { featured: any[]; lines: Record<string, string[]>; reviews: string[] }> = {
  cafe: {
    featured: [
      { channel: 'instagram', subject: 'Order tracking', last: 'Hi, I placed a catering order two days ago but havenu2019t had a confirmation yet.', status: 'open', unread: true, assigned: 'Mia Nguyen', mins: 12 },
      { channel: 'facebook', subject: 'Product availability', last: 'Do you still have the single-origin Ethiopian beans in stock at Footscray?', status: 'open', unread: true, assigned: 'Noah Patel', mins: 40 },
      { channel: 'email', subject: 'Catering enquiry', last: 'Iu2019d like to organise catering for 30 people next Friday — whatu2019s available?', status: 'open', unread: true, assigned: 'Olivia Chen', mins: 90 },
      { channel: 'chat', subject: 'Delivery to Geelong', last: 'Do you deliver beans and hampers to Geelong?', status: 'open', unread: true, assigned: '', mins: 6 },
      { channel: 'sms', subject: 'Pickup running late', last: 'Running 10 mins late for my pickup, is that ok?', status: 'open', unread: false, assigned: 'Ethan Walker', mins: 150 },
    ],
    lines: {
      instagram: ['Hi, do you do oat milk?', 'Are you open on public holidays?', 'Loved the flat white today ❤️', 'Do you cater for events?', 'Can I book a table for 6?'],
      facebook: ['Is the courtyard dog-friendly?', 'Do you have gluten-free cakes?', 'What time does the kitchen close?', 'Do you take bookings for brunch?'],
      email: ['Do you sell your house blend beans by the kilo?', 'Following up on my wholesale enquiry.', 'Can I get a tax invoice for my order?'],
      chat: ['Whatu2019s on the specials board today?', 'Do you have oat and almond milk?', 'Can I pre-order a birthday cake?'],
      sms: ['Is my catering order ready?', 'Can I add two croissants to order #1042?'],
    },
    reviews: ['Best coffee in Brunswick, hands down.', 'Lovely spot, friendly team, great cakes.', 'Amazing catering for our office — will book again.', 'Great service and quick delivery of our bean order.'],
  },
  retail: {
    featured: [
      { channel: 'instagram', subject: 'Order tracking', last: 'Hi, I placed an order two days ago but havenu2019t received the tracking number yet.', status: 'open', unread: true, assigned: 'Mia Nguyen', mins: 12 },
      { channel: 'facebook', subject: 'Product availability', last: 'Is the navy jacket available in size M at your Footscray store?', status: 'open', unread: true, assigned: 'Noah Patel', mins: 40 },
      { channel: 'email', subject: 'Return request', last: 'The item arrived with a small mark. Iu2019ve attached photos and would like a return.', status: 'open', unread: true, assigned: 'Olivia Chen', mins: 90 },
      { channel: 'chat', subject: 'Delivery enquiry', last: 'Do you deliver to Geelong and how much is shipping?', status: 'open', unread: true, assigned: '', mins: 6 },
    ],
    lines: {
      instagram: ['Do you restock sold-out items?', 'Is there a sale on this week?', 'Whatu2019s your return window?'],
      facebook: ['Do you price match?', 'Can I click and collect?', 'Do you gift wrap?'],
      email: ['Following up on my order status.', 'Can I change my delivery address?', 'Do you offer wholesale pricing?'],
      chat: ['Is this in stock in size L?', 'How long is delivery to Melbourne?', 'Can I exchange for a different colour?'],
      sms: ['Has my order shipped yet?', 'Can I add an item to order #1042?'],
    },
    reviews: ['Fast shipping and great quality.', 'Easy returns, helpful staff.', 'Great range and good prices.'],
  },
  automotive: {
    featured: [
      { channel: 'sms', subject: 'Service booking', last: 'Hi, can I book my Hilux in for a logbook service next week?', status: 'open', unread: true, assigned: 'Ethan Walker', mins: 20 },
      { channel: 'facebook', subject: 'Quote request', last: 'How much for front brake pads and rotors on a 2018 Mazda 3?', status: 'open', unread: true, assigned: 'Noah Patel', mins: 55 },
      { channel: 'email', subject: 'Repair update', last: 'Any update on my car? You mentioned parts were on order.', status: 'open', unread: true, assigned: 'Olivia Chen', mins: 120 },
      { channel: 'chat', subject: 'Missed call follow-up', last: 'I tried calling about a roadworthy — can someone call me back?', status: 'open', unread: true, assigned: '', mins: 8 },
    ],
    lines: {
      instagram: ['Do you do pink slips?', 'Are you open Saturdays?', 'Do you service EVs?'],
      facebook: ['How long is a major service?', 'Do you offer a loan car?', 'Can you fit tyres I supply?'],
      email: ['Following up on my quote.', 'Can I reschedule my booking?', 'Do you offer a warranty on repairs?'],
      chat: ['Whatu2019s the wait for a logbook service?', 'Do you take EFTPOS?', 'Can I drop off tonight?'],
      sms: ['Is my car ready?', 'Running late for my 9am booking.'],
    },
    reviews: ['Honest mechanics, fair prices.', 'Sorted my brakes same day, great service.', 'Clear quote and no surprises.'],
  },
  aquarium: {
    featured: [
      { channel: 'instagram', subject: 'Order tracking', last: 'Hi, I placed an order two days ago but havenu2019t received the tracking number yet.', status: 'open', unread: true, assigned: 'Mia Nguyen', mins: 12 },
      { channel: 'facebook', subject: 'Product availability', last: 'Is the blue aquarium cabinet available at your Footscray location?', status: 'open', unread: true, assigned: 'Noah Patel', mins: 40 },
      { channel: 'email', subject: 'Damage on delivery', last: 'The aquarium delivered today has a small mark on the cabinet. Iu2019ve attached photos.', status: 'open', unread: true, assigned: 'Olivia Chen', mins: 90 },
      { channel: 'chat', subject: 'Delivery to Geelong', last: 'Do you provide installation and delivery to Geelong?', status: 'open', unread: true, assigned: '', mins: 6 },
    ],
    lines: {
      instagram: ['Do you have clownfish in stock?', 'Whatu2019s good for a beginner tank?', 'Do you test water samples?'],
      facebook: ['Is the 4ft tank on special?', 'Do you deliver and install?', 'Whatu2019s your DOA policy?'],
      email: ['Following up on my tank warranty.', 'Can you recommend a filter for a 200L tank?', 'Do you do maintenance visits?'],
      chat: ['Do you sell live plants?', 'Whatu2019s the delivery cost to Point Cook?', 'Can I order online and pick up?'],
      sms: ['Is my order ready for pickup?', 'Can I add a heater to my order?'],
    },
    reviews: ['Excellent service and quick delivery. Staff helped me choose the right setup.', 'Great advice for my first reef tank.', 'Healthy fish and fast delivery.'],
  },
}

/**
 * Populate a company with a full set of sample data for the given industry
 * template. Idempotent when called after wipeDemoData. Returns per-table counts.
 */
export async function seedSampleData(db: any, companyId: string, template: Template = 'cafe'): Promise<Record<string, number>> {
  const tpl = TEMPLATES[template] || TEMPLATES.cafe
  const counts: Record<string, number> = {}
  const r = rng(42)

  // Team members (best-effort — base columns only).
  try {
    for (const t of TEAM) await db.from('team_members').insert({ company_id: companyId, email: t.email, role: t.role, status: 'active' })
    counts.team = TEAM.length
  } catch { counts.team = 0 }

  // Contacts.
  const contacts: any[] = []
  for (let i = 0; i < 40; i++) {
    const first = pick(FIRST, r()), last = pick(LAST, r()), loc = pick(SUBURBS, r())
    const tags = [pick(TAGS_POOL, r()), ...(r() > 0.6 ? [pick(TAGS_POOL, r())] : [])]
    contacts.push({
      company_id: companyId, name: `${first} ${last}`,
      email: `${first}.${last}${i}@example.com`.toLowerCase(),
      phone: `+61 4${String(10000000 + Math.floor(r() * 89999999))}`,
      address: `${1 + Math.floor(r() * 200)} ${pick(['High', 'Sydney', 'Chapel', 'Barkly', 'Nicholson', 'Racecourse'], r())} St`,
      city: loc.s, country: 'Australia', source: pick(CHANNELS, r()),
      tags, subscribed_to_marketing: r() > 0.3, created_at: daysAgo(Math.floor(r() * 90)),
    })
  }
  const contactIds: string[] = []
  try {
    const { data } = await db.from('contacts').insert(contacts).select('id')
    ;(data || []).forEach((c: any) => contactIds.push(c.id))
    counts.contacts = contactIds.length
  } catch { counts.contacts = 0 }

  // Conversations + messages — batched so the whole seed stays well under the
  // serverless timeout (per-conversation inserts were ~160 sequential round trips).
  let msgCount = 0
  const specs: any[] = []
  for (const f of tpl.featured) specs.push({ ...f, contactId: contactIds[Math.floor(r() * contactIds.length)] || null, created: f.mins })
  for (let i = 0; i < 75; i++) {
    const channel = pick(CHANNELS, r())
    const line = pick(tpl.lines[channel] || tpl.lines.chat, r())
    const status = r() > 0.55 ? 'closed' : (r() > 0.4 ? 'open' : 'pending')
    const mins = Math.floor(r() * 90 * 1440)
    specs.push({ channel, subject: line.slice(0, 40), last: line, status, unread: status === 'open' && r() > 0.6, assigned: r() > 0.4 ? pick(TEAM, r()).name : '', mins, created: mins, contactId: contactIds[Math.floor(r() * contactIds.length)] || null })
  }
  // Insert all conversations in one statement — returning preserves input order.
  const convRows = specs.map(s => ({
    company_id: companyId, contact_id: s.contactId, channel: s.channel, status: s.status,
    subject: s.subject, assigned_name: s.assigned || null, last_message: s.last,
    last_message_at: minsAgo(s.mins ?? s.created), is_unread: !!s.unread,
    unread_count: s.unread ? 1 : 0, created_at: minsAgo(s.created),
  }))
  let convIds: string[] = []
  try { const { data } = await db.from('conversations').insert(convRows).select('id'); convIds = (data || []).map((c: any) => c.id) } catch { convIds = [] }
  counts.conversations = convIds.length
  // Build every message, then insert in chunks.
  const allMsgs: any[] = []
  convIds.forEach((cid, idx) => {
    const s = specs[idx]
    const turns = 2 + Math.floor(r() * 4)
    for (let t = 0; t < turns; t++) {
      const isVisitor = t % 2 === 0
      allMsgs.push({
        conversation_id: cid, company_id: companyId, sender_type: isVisitor ? 'visitor' : 'agent',
        sender_name: isVisitor ? null : (s.assigned || pick(TEAM, r()).name),
        content: t === 0 ? s.last : (isVisitor ? pick(tpl.lines[s.channel] || tpl.lines.chat, r()) : pick(AGENT_LINES, r())),
        created_at: minsAgo((s.mins ?? s.created) + (turns - t) * 3),
      })
    }
  })
  for (let i = 0; i < allMsgs.length; i += 200) {
    try { const { data } = await db.from('messages').insert(allMsgs.slice(i, i + 200)).select('id'); msgCount += (data || []).length } catch {}
  }
  counts.messages = msgCount

  // Calls (incl. missed + voicemail).
  try {
    const calls: any[] = []
    for (let i = 0; i < 12; i++) {
      const inbound = r() > 0.3, missed = r() > 0.7, started = daysAgo(Math.floor(r() * 30))
      calls.push({
        company_id: companyId, direction: inbound ? 'inbound' : 'outbound',
        from_number: `+61 4${String(10000000 + Math.floor(r() * 89999999))}`, to_number: '+61 3 9000 1234',
        caller_name: `${pick(FIRST, r())} ${pick(LAST, r())}`, status: missed ? 'missed' : 'completed',
        duration_seconds: missed ? 0 : 60 + Math.floor(r() * 600), is_voicemail: missed && r() > 0.5,
        sentiment: pick(['positive', 'neutral', 'negative'], r()), started_at: started, ended_at: started, created_at: started,
      })
    }
    const { data } = await db.from('calls').insert(calls).select('id')
    counts.calls = (data || []).length
  } catch { counts.calls = 0 }

  // Reviews.
  try {
    const reviews: any[] = []
    for (let i = 0; i < 20; i++) {
      const rating = r() > 0.2 ? 5 : (r() > 0.5 ? 4 : 3)
      reviews.push({
        company_id: companyId, platform: 'google', reviewer_name: `${pick(FIRST, r())} ${pick(LAST, r())}`,
        rating, review_text: pick(tpl.reviews, r()), review_date: daysAgo(Math.floor(r() * 60)),
        reply: r() > 0.6 ? 'Thanks so much for the kind words — see you again soon!' : null, created_at: daysAgo(Math.floor(r() * 60)),
      })
    }
    const { data } = await db.from('reviews').insert(reviews).select('id')
    counts.reviews = (data || []).length
  } catch { counts.reviews = 0 }

  // Orders (drive customer spend / AOV in profiles + map).
  try {
    const orders: any[] = []
    for (let i = 0; i < 25; i++) {
      const total = (20 + Math.floor(r() * 480)).toFixed(2)
      orders.push({
        company_id: companyId, woo_order_id: 1000 + i,
        customer_email: contacts[Math.floor(r() * contacts.length)]?.email || 'guest@example.com',
        status: pick(['completed', 'processing', 'completed', 'completed'], r()), total, currency: 'AUD',
        order_date: daysAgo(Math.floor(r() * 90)),
        line_items: [{ name: pick(['House Blend 1kg', 'Catering Platter', 'Gift Hamper', 'Cold Brew Case', 'Accessory Pack'], r()), quantity: 1 + Math.floor(r() * 3), total }],
        billing: { first_name: pick(FIRST, r()), last_name: pick(LAST, r()), city: pick(SUBURBS, r()).s },
        created_at: daysAgo(Math.floor(r() * 90)),
      })
    }
    const { data } = await db.from('woocommerce_orders').insert(orders).select('id')
    counts.orders = (data || []).length
  } catch { counts.orders = 0 }

  // Tasks (base columns only).
  try {
    const tasks: any[] = []
    const titles = ['Follow up on quote', 'Reply to Google review', 'Check fulfilment status for order #1042', 'Call back missed enquiry', 'Confirm wholesale pricing', 'Send pre-order details']
    for (let i = 0; i < 15; i++) tasks.push({ company_id: companyId, text: pick(titles, r()), done: r() > 0.7, due_date: daysAgo(-Math.floor(r() * 7)), created_at: daysAgo(Math.floor(r() * 20)) })
    const { data } = await db.from('conversation_tasks').insert(tasks).select('id')
    counts.tasks = (data || []).length
  } catch { counts.tasks = 0 }

  return counts
}

export async function seedHarbourBean(db: any = demoAdmin()): Promise<{ companyId: string; userId: string | null; counts: Record<string, number> }> {
  const userId = await ensureDemoUser(db)
  const companyId = await ensureDemoCompany(db, userId)
  await wipeDemoData(db, companyId)
  const counts = await seedSampleData(db, companyId, 'cafe')
  // Registry + reset audit.
  try {
    const { data: existing } = await db.from('demo_workspaces').select('id').eq('company_id', companyId).eq('demo_type', 'shared_showcase').maybeSingle()
    if (existing) await db.from('demo_workspaces').update({ last_reset_at: new Date().toISOString(), status: 'active' }).eq('id', existing.id)
    else await db.from('demo_workspaces').insert({ company_id: companyId, demo_type: 'shared_showcase', template: 'cafe', business_name: DEMO_COMPANY_NAME, slug: DEMO_SLUG, status: 'active', external_sending: false, read_only: false, last_reset_at: new Date().toISOString() })
  } catch {}
  try { await db.from('demo_analytics').insert({ company_id: companyId, event: 'seed_reset', meta: counts }) } catch {}
  return { companyId, userId, counts }
}

export async function ensureDemoUser(db: any): Promise<string | null> {
  try {
    const { data, error } = await db.auth.admin.createUser({ email: DEMO_EMAIL, password: demoPassword(), email_confirm: true })
    if (data?.user?.id) return data.user.id
    if (error && !/already|registered|exists/i.test(error.message)) return null
  } catch { /* fall through */ }
  // Fast path on reseeds: the demo company already records the owner id.
  try {
    const { data: co } = await db.from('companies').select('owner_id').eq('slug', DEMO_SLUG).maybeSingle()
    if (co?.owner_id) { try { await db.auth.admin.updateUserById(co.owner_id, { password: demoPassword() }) } catch {}; return co.owner_id }
  } catch {}
  // Fallback: paginate the user list to find the demo user.
  try {
    for (let page = 1; page <= 6; page++) {
      const { data } = await db.auth.admin.listUsers({ page, perPage: 200 })
      const u = (data?.users || []).find((x: any) => (x.email || '').toLowerCase() === DEMO_EMAIL)
      if (u) { try { await db.auth.admin.updateUserById(u.id, { password: demoPassword() }) } catch {}; return u.id }
      if (!data?.users?.length || data.users.length < 200) break
    }
  } catch {}
  return null
}

async function ensureDemoCompany(db: any, ownerId: string | null): Promise<string> {
  const { data: existing } = await db.from('companies').select('id').eq('slug', DEMO_SLUG).maybeSingle()
  const fields: any = {
    name: DEMO_COMPANY_NAME, slug: DEMO_SLUG, plan: 'pro', is_demo: true, demo_type: 'shared_showcase',
    demo_template: 'cafe', external_sending_enabled: false, demo_read_only: false, accent_color: '#0b8457',
    industry: 'Café & Hospitality', business_email: 'hello@harbourbean.example', website: 'https://harbourbean.example',
  }
  if (ownerId) fields.owner_id = ownerId
  if (existing?.id) {
    await db.from('companies').update(fields).eq('id', existing.id)
    if (ownerId) { try { await db.from('team_members').upsert({ company_id: existing.id, user_id: ownerId, email: DEMO_EMAIL, role: 'owner', status: 'active' }, { onConflict: 'company_id,email' }) } catch {} }
    return existing.id
  }
  const { data: created } = await db.from('companies').insert({ ...fields, created_at: daysAgo(120) }).select('id').maybeSingle()
  const id = created?.id
  if (id && ownerId) { try { await db.from('team_members').upsert({ company_id: id, user_id: ownerId, email: DEMO_EMAIL, role: 'owner', status: 'active' }, { onConflict: 'company_id,email' }) } catch {} }
  return id
}

// Wipe a demo company's own data (used before reseeding). Scoped to companyId.
export async function wipeDemoData(db: any, companyId: string, keepOwnerEmail: string = DEMO_EMAIL) {
  if (!companyId) return
  try {
    const { data: convs } = await db.from('conversations').select('id').eq('company_id', companyId)
    const ids = (convs || []).map((c: any) => c.id)
    if (ids.length) { try { await db.from('messages').delete().in('conversation_id', ids) } catch {} }
  } catch {}
  for (const t of ['messages', 'conversation_tasks', 'calls', 'reviews', 'woocommerce_orders', 'conversations', 'contacts']) {
    try { await db.from(t).delete().eq('company_id', companyId) } catch {}
  }
  try { await db.from('team_members').delete().eq('company_id', companyId).neq('email', keepOwnerEmail) } catch {}
}
