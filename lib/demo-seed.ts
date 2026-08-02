import { createClient } from '@supabase/supabase-js'

// Seeds (and re-seeds) the public "Harbour & Bean Café" showcase workspace with
// realistic, entirely fictional sample data across Colvy's real tables. Safe to
// run repeatedly: it wipes the demo company's own data and rebuilds it, and
// never touches any other tenant. All names/emails/phones/addresses are made up.

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

const VISITOR_LINES: Record<string, string[]> = {
  instagram: ['Hi, do you do oat milk?', 'Are you open on public holidays?', 'Loved the flat white today ❤️', 'Do you cater for events?', 'Can I book a table for 6?'],
  facebook: ['Is the courtyard dog-friendly?', 'Do you have gluten-free cakes?', 'What time does the kitchen close?', 'Do you take bookings for brunch?'],
  email: ['Iu2019d like to organise catering for 30 people next Friday.', 'Do you sell your house blend beans by the kilo?', 'Following up on my wholesale enquiry.', 'Can I get a tax invoice for my order?'],
  chat: ['Do you deliver to Geelong?', 'Whatu2019s on the specials board today?', 'Do you have oat and almond milk?', 'Can I pre-order a birthday cake?'],
  sms: ['Running 10 mins late for my pickup, is that ok?', 'Is my catering order ready?', 'Can I add two croissants to order #1042?'],
}
const AGENT_LINES = ['Thanks for reaching out! Happy to help with that.', 'Absolutely — weu2019ve got you sorted.', 'Great question! Let me check and get back to you.', 'Yes we do — would you like me to book that in?', 'No problem at all, see you soon ☕']

export async function seedHarbourBean(db: any = demoAdmin()): Promise<{ companyId: string; userId: string | null; counts: Record<string, number> }> {
  const userId = await ensureDemoUser(db)
  const companyId = await ensureDemoCompany(db, userId)
  await wipeDemoData(db, companyId)

  const counts: Record<string, number> = {}
  const r = rng(42)

  // Team members (best-effort — base columns only).
  try {
    for (const t of TEAM) {
      await db.from('team_members').insert({ company_id: companyId, email: t.email, role: t.role, status: 'active' })
    }
    counts.team = TEAM.length
  } catch { counts.team = 0 }

  // Contacts.
  const contacts: any[] = []
  for (let i = 0; i < 40; i++) {
    const first = pick(FIRST, r()), last = pick(LAST, r()), loc = pick(SUBURBS, r())
    const tags = [pick(TAGS_POOL, r()), ...(r() > 0.6 ? [pick(TAGS_POOL, r())] : [])]
    contacts.push({
      company_id: companyId,
      name: `${first} ${last}`,
      email: `${first}.${last}${i}@example.com`.toLowerCase(),
      phone: `+61 4${String(10000000 + Math.floor(r() * 89999999))}`,
      address: `${1 + Math.floor(r() * 200)} ${pick(['High', 'Sydney', 'Chapel', 'Barkly', 'Nicholson', 'Racecourse'], r())} St`,
      city: loc.s, country: 'Australia', source: pick(CHANNELS, r()),
      tags, subscribed_to_marketing: r() > 0.3,
      created_at: daysAgo(Math.floor(r() * 90)),
    })
  }
  const contactIds: string[] = []
  try {
    const { data } = await db.from('contacts').insert(contacts).select('id')
    ;(data || []).forEach((c: any) => contactIds.push(c.id))
    counts.contacts = contactIds.length
  } catch { counts.contacts = 0 }

  // Featured conversations (from the showcase brief) + generated filler.
  const featured = [
    { channel: 'instagram', subject: 'Order tracking', last: 'Hi, I placed an order two days ago but havenu2019t received the tracking number yet.', status: 'open', unread: true, assigned: 'Mia Nguyen', mins: 12 },
    { channel: 'facebook', subject: 'Product availability', last: 'Is the blue aquarium cabinet available at your Footscray location?', status: 'open', unread: true, assigned: 'Noah Patel', mins: 40 },
    { channel: 'email', subject: 'Damage on delivery', last: 'The aquarium delivered today has a small mark on the cabinet. Iu2019ve attached photos.', status: 'open', unread: true, assigned: 'Olivia Chen', mins: 90 },
    { channel: 'chat', subject: 'Delivery to Geelong', last: 'Do you provide installation and delivery to Geelong?', status: 'open', unread: true, assigned: '', mins: 6 },
    { channel: 'sms', subject: 'Pickup running late', last: 'Running 10 mins late for my pickup, is that ok?', status: 'open', unread: false, assigned: 'Ethan Walker', mins: 150 },
  ]
  let convCount = 0, msgCount = 0
  const seedConv = async (spec: any, contactId: string | null, createdMinsAgo: number) => {
    try {
      const { data: conv } = await db.from('conversations').insert({
        company_id: companyId, contact_id: contactId, channel: spec.channel,
        status: spec.status, subject: spec.subject, assigned_name: spec.assigned || null,
        last_message: spec.last, last_message_at: minsAgo(spec.mins ?? createdMinsAgo),
        is_unread: !!spec.unread, unread_count: spec.unread ? 1 : 0,
        created_at: minsAgo(createdMinsAgo),
      }).select('id').maybeSingle()
      if (!conv) return
      convCount++
      const turns = 2 + Math.floor(r() * 4)
      const msgs: any[] = []
      for (let t = 0; t < turns; t++) {
        const isVisitor = t % 2 === 0
        msgs.push({
          conversation_id: conv.id, company_id: companyId,
          sender_type: isVisitor ? 'visitor' : 'agent',
          sender_name: isVisitor ? null : (spec.assigned || pick(TEAM, r()).name),
          content: t === 0 ? spec.last : (isVisitor ? pick(VISITOR_LINES[spec.channel] || VISITOR_LINES.chat, r()) : pick(AGENT_LINES, r())),
          created_at: minsAgo((spec.mins ?? createdMinsAgo) + (turns - t) * 3),
        })
      }
      const { data: ins } = await db.from('messages').insert(msgs).select('id')
      msgCount += (ins || []).length
    } catch { /* skip this conversation */ }
  }
  for (const f of featured) await seedConv(f, contactIds[Math.floor(r() * contactIds.length)] || null, f.mins)
  for (let i = 0; i < 75; i++) {
    const channel = pick(CHANNELS, r())
    const line = pick(VISITOR_LINES[channel] || VISITOR_LINES.chat, r())
    const status = r() > 0.55 ? 'closed' : (r() > 0.4 ? 'open' : 'pending')
    await seedConv({
      channel, subject: line.slice(0, 40), last: line, status,
      unread: status === 'open' && r() > 0.6, assigned: r() > 0.4 ? pick(TEAM, r()).name : '',
      mins: Math.floor(r() * 90 * 1440),
    }, contactIds[Math.floor(r() * contactIds.length)] || null, Math.floor(r() * 90 * 1440))
  }
  counts.conversations = convCount
  counts.messages = msgCount

  // Calls (incl. missed + voicemail).
  try {
    const calls: any[] = []
    for (let i = 0; i < 12; i++) {
      const inbound = r() > 0.3
      const missed = r() > 0.7
      const started = daysAgo(Math.floor(r() * 30))
      calls.push({
        company_id: companyId, direction: inbound ? 'inbound' : 'outbound',
        from_number: `+61 4${String(10000000 + Math.floor(r() * 89999999))}`,
        to_number: '+61 3 9000 1234',
        caller_name: `${pick(FIRST, r())} ${pick(LAST, r())}`,
        status: missed ? 'missed' : 'completed',
        duration_seconds: missed ? 0 : 60 + Math.floor(r() * 600),
        is_voicemail: missed && r() > 0.5,
        sentiment: pick(['positive', 'neutral', 'negative'], r()),
        started_at: started, ended_at: started, created_at: started,
      })
    }
    const { data } = await db.from('calls').insert(calls).select('id')
    counts.calls = (data || []).length
  } catch { counts.calls = 0 }

  // Reviews.
  try {
    const reviews: any[] = []
    const texts = ['Excellent service and quick delivery. Staff helped me choose the right setup.', 'Best coffee in Brunswick, hands down.', 'Lovely spot, friendly team, great cakes.', 'Order was a little late but the staff sorted it quickly.', 'Amazing catering for our office — will book again.']
    for (let i = 0; i < 20; i++) {
      const rating = r() > 0.2 ? 5 : (r() > 0.5 ? 4 : 3)
      reviews.push({
        company_id: companyId, platform: 'google', reviewer_name: `${pick(FIRST, r())} ${pick(LAST, r())}`,
        rating, review_text: pick(texts, r()), review_date: daysAgo(Math.floor(r() * 60)),
        reply: r() > 0.6 ? 'Thanks so much for the kind words — see you again soon! ☕' : null,
        created_at: daysAgo(Math.floor(r() * 60)),
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
        status: pick(['completed', 'processing', 'completed', 'completed'], r()),
        total, currency: 'AUD', order_date: daysAgo(Math.floor(r() * 90)),
        line_items: [{ name: pick(['House Blend 1kg', 'Catering Platter', 'Flat White x10', 'Gift Hamper', 'Cold Brew Case'], r()), quantity: 1 + Math.floor(r() * 3), total }],
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
    const titles = ['Follow up on catering quote', 'Reply to Google review', 'Check fulfilment status for order #1042', 'Call back missed enquiry', 'Confirm wholesale pricing', 'Send birthday cake pre-order details']
    for (let i = 0; i < 15; i++) {
      tasks.push({ company_id: companyId, text: pick(titles, r()), done: r() > 0.7, due_date: daysAgo(-Math.floor(r() * 7)), created_at: daysAgo(Math.floor(r() * 20)) })
    }
    const { data } = await db.from('conversation_tasks').insert(tasks).select('id')
    counts.tasks = (data || []).length
  } catch { counts.tasks = 0 }

  // Registry + reset audit.
  try {
    const { data: existing } = await db.from('demo_workspaces').select('id').eq('company_id', companyId).eq('demo_type', 'shared_showcase').maybeSingle()
    if (existing) await db.from('demo_workspaces').update({ last_reset_at: new Date().toISOString(), status: 'active' }).eq('id', existing.id)
    else await db.from('demo_workspaces').insert({ company_id: companyId, demo_type: 'shared_showcase', template: 'cafe', business_name: DEMO_COMPANY_NAME, slug: DEMO_SLUG, status: 'active', external_sending: false, read_only: false, last_reset_at: new Date().toISOString() })
  } catch { /* registry optional */ }
  try { await db.from('demo_analytics').insert({ company_id: companyId, event: 'seed_reset', meta: counts }) } catch {}

  return { companyId, userId, counts }
}

async function ensureDemoUser(db: any): Promise<string | null> {
  // Create the demo auth user, or find + reset its password so login is reliable.
  try {
    const { data, error } = await db.auth.admin.createUser({ email: DEMO_EMAIL, password: demoPassword(), email_confirm: true })
    if (data?.user?.id) return data.user.id
    if (error && !/already|registered|exists/i.test(error.message)) return null
  } catch { /* fall through to lookup */ }
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
    name: DEMO_COMPANY_NAME, slug: DEMO_SLUG, plan: 'pro',
    is_demo: true, demo_type: 'shared_showcase', demo_template: 'cafe',
    external_sending_enabled: false, demo_read_only: false,
    accent_color: '#0b8457', industry: 'Café & Hospitality',
    business_email: 'hello@harbourbean.example', website: 'https://harbourbean.example',
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

async function wipeDemoData(db: any, companyId: string) {
  if (!companyId) return
  // Messages before conversations (FK). Everything scoped to the demo company.
  try {
    const { data: convs } = await db.from('conversations').select('id').eq('company_id', companyId)
    const ids = (convs || []).map((c: any) => c.id)
    if (ids.length) { try { await db.from('messages').delete().in('conversation_id', ids) } catch {} }
  } catch {}
  for (const t of ['messages', 'conversation_tasks', 'calls', 'reviews', 'woocommerce_orders', 'conversations', 'contacts']) {
    try { await db.from(t).delete().eq('company_id', companyId) } catch {}
  }
  // Team members except the demo owner.
  try { await db.from('team_members').delete().eq('company_id', companyId).neq('email', DEMO_EMAIL) } catch {}
}
