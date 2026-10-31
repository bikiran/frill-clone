import { statusMeta, channelMeta, displayStatus } from '@/lib/orders'
import { requireCompanyAccess, isStaffRow } from '@/lib/company-access'
import { canUseFeature, hasFullAccess } from '@/lib/permissions'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { linkedContacts } from '@/lib/identity'
import { phoneKey, emailKey } from '@/lib/phone'
import { ROLE_NAMES } from '@/lib/agent/results'
import { isValidTimeZone } from '@/lib/booking-time'
import { cutPage, toMs, KIND_GROUP, TIMELINE_GROUP_KEYS, type TimelineEvent, type TimelineGroup, type TimelineSummary } from '@/lib/customer-timeline'

export const dynamic = 'force-dynamic'

// Rows from the service-role client are untyped, and so is its query builder.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Builder = any

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// GET /api/contacts/timeline?contactId=…[&before=ISO][&types=orders,calls][&summary=1]
//
// Everything that has happened with one customer, newest first: messages on
// every channel (live chat, SMS, email, Messenger, Instagram, WhatsApp) plus
// orders from every sales channel, bookings, calls, tasks and notes, tickets,
// contact-form submissions, recorded sales, payments, link clicks, media
// requests, AI agent actions, reviews, comments and identity changes.
//
// The person may be several linked contacts (identity_group_id); we gather all
// of them. A contact that isn't linked to anyone is simply itself.
//
//   before   — "Load older": only things older than this time (the
//              nextBefore the previous page returned).
//   types    — only these filter groups (lib/customer-timeline.ts), so a
//              filter chip reads just what it shows.
//   summary  — 1 adds the at-a-glance numbers (first page only).
//
// Each kind needs the same Team permission as the page it links to (orders,
// calls, bookings…), so a restricted member never sees more here than they
// could open.

const MSG_LIMIT = 120          // messages per page
const EVENT_LIMIT = 40         // rows per other source per page
const PAGE_SIZE = 160          // most items one page shows
const MAX_CONVERSATIONS = 1000 // newest conversations read (one database page)
const ID_CHUNK = 200           // ids per request: the list goes in the URL

// Team permission (lib/permissions feature keys) each kind needs — any one of
// them. Messages, contact-form submissions and media requests are the
// conversations themselves, so they need the inbox, like the page they open.
// Kinds not listed (notes, tasks, identity changes) are part of the customer
// record itself, which the profile already shows to anyone allowed in.
const NEEDS: Record<string, string[]> = {
  message: ['inbox'], form: ['inbox'], media: ['inbox'],
  order: ['orders'], sale: ['payments'], payment: ['payments'], call: ['calls'], booking: ['bookings'],
  ticket: ['tickets'], review: ['reviews'], comment: ['social'], agent: ['agents'], link: ['links', 'link_reports'],
  campaign: ['campaigns'],
}

// What this member may see, from their Team permissions. Owners, admins and
// the platform admin (who passed the access check without being on the team)
// see everything. If the lookup fails, the gated kinds stay hidden.
async function memberCan(db: Builder, companyId: string, userId?: string): Promise<(feature: string) => boolean> {
  const all = () => true
  if (!userId) return all
  try {
    const [{ data: co }, { data: rows, error }] = await Promise.all([
      db.from('companies').select('owner_id').eq('id', companyId).maybeSingle(),
      db.from('team_members').select('role, status, permissions').eq('company_id', companyId).eq('user_id', userId).limit(5),
    ])
    if (co?.owner_id === userId) return all
    if (error) return () => false
    const row = (rows || []).find(isStaffRow)
    if (!row) return all
    const role = String(row.role || 'viewer').toLowerCase()
    if (hasFullAccess(role)) return all
    const perms = row.permissions && typeof row.permissions === 'object' ? row.permissions : null
    return (f: string) => canUseFeature(role, perms, f)
  } catch { return () => false }
}

const uniq = <T,>(xs: T[]) => Array.from(new Set(xs))
const clip = (s: unknown, n: number) => { const t = String(s ?? '').trim(); return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t }
const iso = (v: unknown) => { const ms = toMs(v); return Number.isFinite(ms) ? new Date(ms).toISOString() : '' }
const money = (n: unknown, cur?: string) => {
  const v = Number(n); if (!Number.isFinite(v)) return ''
  try { return new Intl.NumberFormat('en-AU', { style: 'currency', currency: String(cur || 'aud').toUpperCase() }).format(v) } catch { return `$${v.toFixed(2)}` }
}
const cap = (s: unknown) => { const t = String(s || '').replace(/[_-]+/g, ' ').trim(); return t ? t[0].toUpperCase() + t.slice(1) : '' }
// Emails go into PostgREST filters as they are, so an address with list
// punctuation, quotes or backslashes is left out rather than cleaned up — a
// cleaned-up address could be somebody else's. In an in-list the rest
// (unicode, * and %) is literal.
const LIST_UNSAFE = /[,()"\\]/
// An ilike pattern also reads % and * (PostgREST's %) as wildcards, so an
// address with either isn't matched that way at all…
const LIKE_UNSAFE = /[%*]/
// …and _ is a wildcard too, so escape it.
const likeSafe = (s: string) => s.replace(/_/g, '\\_')
// A booking's times read in its own time zone — what the customer was told
// (lib/booking.ts) and what the Bookings page shows — not the viewer's.
const bookingTz = (b: Row) => { const tz = String(b.timezone || '').trim(); return tz && isValidTimeZone(tz) ? tz : 'Australia/Melbourne' }
const hostOf = (u: unknown) => { try { return new URL(String(u)).hostname.replace(/^www\./, '') } catch { return '' } }
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

const BOOKING_STATUS: Record<string, { label: string; tone: TimelineEvent['tone'] }> = {
  pending: { label: 'Pending', tone: 'warn' }, confirmed: { label: 'Confirmed', tone: 'good' }, completed: { label: 'Completed', tone: 'good' },
  cancelled: { label: 'Cancelled', tone: 'muted' }, no_show: { label: 'No-show', tone: 'bad' },
}
const MISSED = ['missed', 'no-answer', 'no_answer', 'failed', 'busy', 'canceled', 'cancelled']
const AGENT_OUTCOME: Record<string, string> = {
  replied: 'replied', escalated: 'handed it to the team', needs_info: 'asked for more information',
  refused: 'declined', incomplete: 'didn’t finish',
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const contactId = sp.get('contactId')
  if (!contactId) return NextResponse.json({ error: 'contactId required' }, { status: 400 })
  let before: string | null = null
  if (sp.get('before')) {
    const ms = toMs(sp.get('before'))
    if (!Number.isFinite(ms)) return NextResponse.json({ error: 'before must be a date' }, { status: 400 })
    before = new Date(ms).toISOString()
  }
  const wanted = (sp.get('types') || '').split(',').map(s => s.trim()).filter(g => (TIMELINE_GROUP_KEYS as string[]).includes(g)) as TimelineGroup[]
  const wantSummary = sp.get('summary') === '1' && !before

  const db: Builder = admin()
  // Members of the contact's workspace only.
  const { data: owner } = await db.from('contacts').select('id, company_id, name, email, phone, channels_seen, created_at').eq('id', contactId).maybeSingle()
  const access: { ok: boolean; userId?: string } = owner ? await requireCompanyAccess(req, db, owner.company_id) : { ok: false }
  if (!owner || !access.ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  const companyId: string = owner.company_id
  const can = await memberCan(db, companyId, access.userId)
  // The history belongs to the customer record: the inbox or Contacts.
  if (!can('contacts') && !can('inbox')) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  const allowed = (kind: string) => { const f = NEEDS[kind]; return !f || f.some(can) }
  const want = (kind: string) => allowed(kind) && (wanted.length === 0 || wanted.includes(KIND_GROUP[kind]))

  // Everyone who is this person: their linked contacts in this workspace, or
  // just this contact when it isn't linked to anyone.
  const linked = (await linkedContacts(db, contactId).catch(() => [] as Row[])).filter((c: Row) => c.company_id === companyId)
  const people: Row[] = linked.length ? linked : [owner]
  if (!people.some(p => p.id === owner.id)) people.push(owner)
  const contactIds: string[] = people.map(p => p.id)
  const emails = uniq(people.map(c => emailKey(c.email)).filter(e => e && !LIST_UNSAFE.test(e)))
  const likeEmails = emails.filter(e => !LIKE_UNSAFE.test(e))
  const phones = uniq(people.map(c => phoneKey(c.phone)).filter(k => k.length >= 8))

  // Their conversations — newest first. A customer with only orders or
  // reviews simply has none; everything else still shows.
  const { data: convRows } = await db.from('conversations')
    .select('id, channel, subject, created_at').eq('company_id', companyId).in('contact_id', contactIds)
    .order('last_message_at', { ascending: false, nullsFirst: false }).limit(MAX_CONVERSATIONS)
  const convById: Record<string, Row> = {}
  for (const c of convRows || []) convById[c.id] = c
  const convIds = Object.keys(convById)

  const list = (ids: string[]) => `(${ids.join(',')})`
  // Ids go in the request URL, so a long list is read 200 at a time (as
  // elsewhere in the codebase) and the answers merged. Most people have one chunk.
  const chunk = (ids: string[]) => { const out: string[][] = []; for (let i = 0; i < ids.length; i += ID_CHUNK) out.push(ids.slice(i, i + ID_CHUNK)); return out }
  const convChunks = convIds.length ? chunk(convIds) : [[]]
  // "This person's" rows on a table with contact_id + conversation_id, for one
  // chunk of their conversations.
  const byPerson = (ids: string[]) => [`contact_id.in.${list(contactIds)}`, ids.length ? `conversation_id.in.${list(ids)}` : ''].filter(Boolean).join(',')
  // A card only links to a page this member can open: the admin layout sends
  // anyone else back to the dashboard (lib/permissions canAccessPath).
  const inboxLink = (convId?: string | null) => allowed('message') && convId && convById[convId] ? `/admin/inbox?conversation=${convId}` : undefined
  // A link click shows for Links or Link Reports: open whichever they have.
  const linkClickHref = can('link_reports') ? '/admin/link-reports' : can('links') ? '/admin/links' : undefined

  // Read rows from a table, trying each column set in turn (a column added by a
  // later migration may not be in this database yet). null = the table isn't
  // there at all, so that kind is skipped. With `ids` (chunks of ids), one
  // request per chunk — base and extra get the chunk — merged back into one
  // list: each row once, in order, up to the limit. The chunks go one after
  // another, so a long history doesn't fire dozens of requests at once.
  type Try = [cols: string, extra?: (q: Builder, ids: string[]) => Builder]
  type Read = { ts?: string; ascending?: boolean; limit: number; paged?: boolean; ids?: string[][] }
  const fetchRows = async (table: string, tries: Try[], base: (q: Builder, ids: string[]) => Builder, o: Read): Promise<Row[] | null> => {
    for (const [cols, extra] of tries) {
      try {
        const res: Row[] = []
        for (const ids of o.ids || [[]]) {
          let q = base(db.from(table).select(cols), ids)
          if (extra) q = extra(q, ids)
          if (o.paged && before && o.ts) q = q.lt(o.ts, before)
          if (o.ts) q = q.order(o.ts, { ascending: !!o.ascending, nullsFirst: false })
          const r = await q.limit(o.limit)
          res.push(r)
          if (r.error) break
        }
        if (res.some(r => r.error)) continue
        if (res.length === 1) return res[0].data || []
        const seen = new Set<unknown>()
        const rows = res.flatMap(r => (r.data || []) as Row[]).filter(r => r.id == null || (!seen.has(r.id) && !!seen.add(r.id)))
        const ts = o.ts
        if (ts) {
          const dir = o.ascending ? 1 : -1
          rows.sort((a, b) => {
            const x = toMs(a[ts]), y = toMs(b[ts])
            return Number.isFinite(x) && Number.isFinite(y) ? (x - y) * dir : Number.isFinite(x) ? -1 : Number.isFinite(y) ? 1 : 0
          })
        }
        return rows.slice(0, o.limit)
      } catch { /* try the next column set */ }
    }
    return null
  }
  // One page of a source, newest first, older than the cursor. Notes when the
  // source came back full, so the merge knows how far down it's complete.
  const fullOldest: number[] = []
  const pull = async (table: string, ts: string, limit: number, tries: Try[], base: (q: Builder, ids: string[]) => Builder, ids?: string[][]): Promise<Row[]> => {
    const rows = await fetchRows(table, tries, base, { ts, limit, paged: true, ids })
    if (!rows) return []
    if (rows.length >= limit) {
      const oldest = Math.min(...rows.map(r => toMs(r[ts])).filter(Number.isFinite))
      if (Number.isFinite(oldest)) fullOldest.push(oldest)
    }
    return rows
  }
  const none = Promise.resolve([] as Row[])

  // ── Orders: every sales channel, plus WooCommerce rows not yet synced ──────
  const ORDER_COLS = 'id, order_number, total, currency, status, payment_status, order_date, sales_channel, source_order_id, external_order_id'
  const orderOr = [`contact_id.in.${list(contactIds)}`, emails.length ? `customer_email.in.(${emails.join(',')})` : ''].filter(Boolean)
  const orderTries = (cols: string): Try[] => [
    // customer_phone_norm came with V340; without it, match on contact and email.
    ...(phones.length ? [[cols, (q: Builder) => q.or([...orderOr, `customer_phone_norm.in.(${phones.join(',')})`].join(','))] as Try] : []),
    [cols, (q: Builder) => q.or(orderOr.join(','))],
  ]
  const WOO_COLS = 'id, woo_order_id, total, currency, status, order_date'
  // By email: the lower-cased customer_email_norm (V265), which an index
  // serves; before V265, a case-insensitive match over the store's orders.
  const wooByEmail = (cols: string, o: { limit: number; paged?: boolean }) => emails.length
    ? fetchRows('woocommerce_orders', [
      [cols, (q: Builder) => q.in('customer_email_norm', emails)],
      ...(likeEmails.length ? [[cols, (q: Builder) => q.or(likeEmails.map(e => `customer_email.ilike.${likeSafe(e)}`).join(','))] as Try] : []),
    ], q => q.eq('company_id', companyId), { ts: 'order_date', ...o })
    : Promise.resolve([] as Row[])
  const wooByPhone = (cols: string, o: { limit: number; paged?: boolean }) => phones.length
    ? fetchRows('woocommerce_orders', [[cols]], q => q.eq('company_id', companyId).in('billing_phone_norm', phones), { ts: 'order_date', ...o })
    : Promise.resolve([] as Row[])
  const pullWoo = async (by: typeof wooByEmail) => {
    const rows = await by(WOO_COLS, { limit: EVENT_LIMIT, paged: true })
    if (rows && rows.length >= EVENT_LIMIT) {
      const oldest = Math.min(...rows.map(r => toMs(r.order_date)).filter(Number.isFinite))
      if (Number.isFinite(oldest)) fullOldest.push(oldest)
    }
    return rows || []
  }
  // A WooCommerce order is usually also in the orders table (synced from it):
  // show it once, as the orders row, which opens in Orders.
  const mergeOrders = (orderRows: Row[], wooRows: Row[]) => {
    const synced = new Set<string>()
    for (const o of orderRows) {
      if (o.source_order_id) synced.add('id:' + o.source_order_id)
      if (o.sales_channel === 'woocommerce' && o.external_order_id) synced.add('woo:' + o.external_order_id)
    }
    const seen = new Set<string>()
    const woo = wooRows.filter(w => {
      if (seen.has(w.id) || synced.has('id:' + w.id) || synced.has('woo:' + String(w.woo_order_id))) return false
      seen.add(w.id); return true
    })
    return { orders: orderRows, woo }
  }

  // Short links sent to this person (for click events).
  const personLinks = async (): Promise<Row[]> => {
    const tries: Try[] = [
      ['id, label, kind, link_type, target_url', (q: Builder, ids: string[]) => q.or(byPerson(ids))],
      ['id, label, target_url', (q: Builder, ids: string[]) => q.or(byPerson(ids))],
      // short_links.contact_id came with V189; before that only the conversation.
      ...(convIds.length ? [['id, label, target_url', (q: Builder, ids: string[]) => q.in('conversation_id', ids)] as Try] : []),
    ]
    return (await fetchRows('short_links', tries, q => q.eq('company_id', companyId), { limit: 300, ids: convChunks })) || []
  }

  // What the page reads from the messages table: the conversation itself, and
  // the team-only notes kept in it (a Tasks & notes item, never a message).
  const readMsgs = want('message') && convIds.length > 0
  const readTeamNotes = allowed('message') && want('note') && convIds.length > 0
  const MSG_COLS = 'id, conversation_id, sender_type, sender_name, content, delivery_channel, created_at, attachments, metadata'

  // The at-a-glance numbers run alongside the page itself.
  const summaryP = wantSummary ? summarise().catch(() => null) : null

  const [
    msgRows, orderRows, wooEmailRows, wooPhoneRows, bookingRows, taskRows, convNoteRows, custNoteRows,
    callRows, ticketRows, formRows, saleRows, payRows, linkClicks, mediaRows, agentRows,
    reviewRows, gReviewRows, commentRows, auditRows, emailSentRows, emailEventRows,
  ] = await Promise.all([
    readMsgs || readTeamNotes ? pull('messages', 'created_at', MSG_LIMIT, [
      // is_internal (V188) marks a team-only note the customer never got;
      // is_ai (V164) a reply the AI sent; message_type (V119) a payment or
      // upload request. Only what this page shows is read.
      [MSG_COLS + ', is_internal, is_ai, message_type', (q: Builder) => readMsgs && readTeamNotes ? q : q.eq('is_internal', readTeamNotes)],
      // A database from before those has no team notes.
      ...(readMsgs ? [[MSG_COLS], ['id, conversation_id, sender_type, sender_name, content, created_at']] as Try[] : []),
    ], (q, ids) => q.in('conversation_id', ids), convChunks) : none,
    want('order') ? pull('orders', 'order_date', EVENT_LIMIT, orderTries(ORDER_COLS), q => q.eq('company_id', companyId)) : none,
    want('order') ? pullWoo(wooByEmail) : none,
    want('order') ? pullWoo(wooByPhone) : none,
    want('booking') ? pull('bookings', 'created_at', EVENT_LIMIT, [['id, service_name, starts_at, timezone, status, staff_name, location_label, conversation_id, created_at']],
      (q, ids) => q.eq('company_id', companyId).or(byPerson(ids)), convChunks) : none,
    want('task') && convIds.length ? pull('conversation_tasks', 'created_at', EVENT_LIMIT, [
      ['id, conversation_id, text, title, done, status, due_date, created_by, created_at'],
      ['id, conversation_id, text, done, due_date, created_at'],
    ], (q, ids) => q.in('conversation_id', ids), convChunks) : none,
    want('note') && convIds.length ? pull('conversation_notes', 'created_at', EVENT_LIMIT, [['id, conversation_id, author_name, content, created_at']],
      (q, ids) => q.in('conversation_id', ids), convChunks) : none,
    // Notes kept on a WooCommerce customer record (customer_notes is keyed on
    // woocommerce_customers, matched to this person by email).
    want('note') && likeEmails.length ? (async () => {
      const custs = await fetchRows('woocommerce_customers', [['id']],
        q => q.eq('company_id', companyId).or(likeEmails.map(e => `email.ilike.${likeSafe(e)}`).join(',')), { limit: 20 })
      const ids = (custs || []).map((c: Row) => c.id)
      if (!ids.length) return []
      return pull('customer_notes', 'created_at', EVENT_LIMIT, [['id, customer_id, content, created_at']], q => q.eq('company_id', companyId).in('customer_id', ids))
    })() : none,
    want('call') ? pull('calls', 'created_at', EVENT_LIMIT, [
      ['id, conversation_id, direction, status, duration_seconds, recording_url, ai_summary, is_voicemail, agent_name, created_at'],
      ['id, conversation_id, direction, status, duration_seconds, recording_url, ai_summary, agent_name, created_at'],
    ], (q, ids) => q.eq('company_id', companyId).or(byPerson(ids)), convChunks) : none,
    want('ticket') ? pull('support_tickets', 'created_at', EVENT_LIMIT, [['id, ticket_number, subject, status, priority, conversation_id, created_at']],
      (q, ids) => q.eq('company_id', companyId).or(byPerson(ids)), convChunks) : none,
    want('form') ? pull('contact_form_submissions', 'created_at', EVENT_LIMIT, [['id, form_id, data, conversation_id, created_at']],
      (q, ids) => q.eq('company_id', companyId).or(byPerson(ids)), convChunks) : none,
    want('sale') ? pull('conversation_sales', 'created_at', EVENT_LIMIT, [['id, amount, currency, payment_method, sold_by_name, note, conversation_id, created_at']],
      (q, ids) => q.eq('company_id', companyId).or(byPerson(ids)), convChunks) : none,
    want('payment') && convIds.length ? pull('chat_payments', 'created_at', EVENT_LIMIT, [
      // card_brand / card_last4 came with V289.
      ['id, conversation_id, amount_cents, currency, description, status, payment_method, saved_card_id, card_brand, card_last4, paid_at, created_at'],
      ['id, conversation_id, amount_cents, currency, description, status, payment_method, paid_at, created_at'],
      ['*'],
    ], (q, ids) => q.in('conversation_id', ids), convChunks) : none,
    want('link') ? (async () => {
      const links = await personLinks()
      if (!links.length) return []
      const byId: Record<string, Row> = {}
      for (const l of links) byId[l.id] = l
      const ids = chunk(links.map(l => l.id))
      const clicks = await fetchRows('link_clicks', [['id, link_id, clicked_at, city, region, country, device']], (q, part) => q.in('link_id', part), { ts: 'clicked_at', limit: EVENT_LIMIT, paged: true, ids })
      if (clicks) {
        if (clicks.length >= EVENT_LIMIT) fullOldest.push(Math.min(...clicks.map(c => toMs(c.clicked_at)).filter(Number.isFinite)))
        return clicks.map(c => ({ ...c, link: byId[c.link_id] }))
      }
      // No per-click table (before V189): the link's last click is all we know.
      const last = await pull('short_links', 'last_clicked_at', EVENT_LIMIT, [['id, last_clicked_at']], (q, part) => q.in('id', part), ids)
      return last.filter(l => l.last_clicked_at).map(l => ({ id: l.id, link_id: l.id, clicked_at: l.last_clicked_at, link: byId[l.id] }))
    })() : none,
    want('media') ? pull('media_requests', 'created_at', EVENT_LIMIT, [['id, prompt, status, created_by, conversation_id, created_at']],
      (q, ids) => q.eq('company_id', companyId).or(byPerson(ids)), convChunks) : none,
    want('agent') ? pull('agent_runs', 'created_at', EVENT_LIMIT, [['id, role_key, status, outcome, summary, conversation_id, created_at']],
      (q, ids) => q.eq('company_id', companyId).eq('mode', 'live').in('status', ['completed', 'escalated', 'awaiting_approval']).or(byPerson(ids)), convChunks) : none,
    want('review') ? pull('reviews', 'review_date', EVENT_LIMIT, [['id, platform, rating, review_text, review_date']], q => q.eq('company_id', companyId).in('contact_id', contactIds)) : none,
    want('review') ? pull('google_reviews', 'review_created_at', EVENT_LIMIT, [['id, star_rating, comment, review_created_at']], q => q.eq('company_id', companyId).in('contact_id', contactIds)) : none,
    want('comment') ? pull('social_comments', 'commented_at', EVENT_LIMIT, [['id, platform, message, commented_at']], q => q.eq('company_id', companyId).in('contact_id', contactIds)) : none,
    want('audit') ? pull('customer_identity_audit', 'created_at', EVENT_LIMIT, [['id, action, detail, actor_name, created_at']], q => q.eq('company_id', companyId).in('contact_id', contactIds)) : none,
    // Campaign emails they were sent, and what they did with them (V396).
    want('campaign') ? pull('email_campaign_recipients', 'sent_at', EVENT_LIMIT, [['id, campaign_id, sent_at']], q => q.eq('company_id', companyId).in('contact_id', contactIds).eq('status', 'sent')) : none,
    want('campaign') ? pull('email_events', 'occurred_at', EVENT_LIMIT, [['id, campaign_id, type, link, occurred_at']], q => q.eq('company_id', companyId).in('contact_id', contactIds).in('type', ['opened', 'clicked', 'unsubscribed', 'complained', 'bounced'])) : none,
  ])

  // ── Messages ───────────────────────────────────────────────────────────────
  // Some messages stand for something shown as its own card, so they're shown
  // once, as the card: a call's card in the thread (metadata.call_id) and the
  // AI phone agent's transcript are the call itself — with its recording and
  // summary — when this member can see calls; a payment request is its payment,
  // as are the "✅ Payment received" pill (lib/chat-payment-confirm.ts) and the
  // saved-card charge note (app/api/stripe/cards), and an upload request its
  // media request when those are on this page too; and the "📅 Booked online"
  // note (lib/booking.ts) is the booking. (A refund pill stays: the card can't
  // say how much of it was refunded.)
  const showCalls = allowed('call')
  const asCard = (m: Row) =>
    (showCalls && m.metadata?.call_id && (m.metadata?.call_event || m.metadata?.phone_agent))
    || (m.message_type === 'payment' && want('payment'))
    || (m.metadata?.payment_id && (m.metadata?.payment_confirmed || m.metadata?.charge) && want('payment'))
    || (m.message_type === 'media_request' && want('media'))
    || (m.sender_type === 'system' && m.metadata?.booking_id && want('booking') && String(m.content || '').startsWith('📅 Booked'))
  // An AI phone agent call has no summary (there's no recording to summarise),
  // so what it was about comes from its transcript (lib/phone-agent): the
  // message it took, or what the caller said.
  const aiCallGist: Record<string, string> = {}
  const keepGist = (m: Row) => {
    if (!m.metadata?.phone_agent || !m.metadata?.call_id) return
    const about = String(m.metadata.message_about || '').trim()
    aiCallGist[m.metadata.call_id] = about ? `Took a message: ${about}` : String(m.content || '').split('\n').filter(l => l.startsWith('Caller: ')).join('\n')
  }
  // A team-only note (is_internal) was never sent to the customer: it's a note,
  // not a message, like the inbox's "Team only" card.
  const teamNotes: Row[] = [], msgList: Row[] = []
  for (const m of msgRows as Row[]) {
    if (asCard(m)) { keepGist(m); continue }
    if (m.is_internal) { if (readTeamNotes) teamNotes.push(m) } else if (readMsgs) msgList.push(m)
  }

  // Detail some cards need from rows this page didn't read, in one more round:
  //  • an AI call's transcript when it isn't among this page's messages — it's
  //    saved a little after the call, so a page can end between the two, and
  //    the Calls filter reads no messages. Only for members with the inbox, as
  //    it's what was said.
  //  • the card a saved-card charge went on: its payment row keeps only
  //    saved_card_id (V289's card_brand / card_last4 are for link payments).
  const gistless = (callRows as Row[]).filter(c => !c.ai_summary && c.agent_name === 'AI phone agent' && c.conversation_id && !(c.id in aiCallGist))
  const savedCardIds = uniq((payRows as Row[]).filter(p => p.saved_card_id && !p.card_brand).map(p => String(p.saved_card_id)))
  const [transcripts, savedCardRows] = await Promise.all([
    gistless.length && allowed('message')
      ? fetchRows('messages', [['content, metadata']], q => q.in('conversation_id', uniq(gistless.map(c => c.conversation_id)))
        .eq('is_internal', true).in('metadata->>call_id', gistless.map(c => c.id)), { limit: 2 * gistless.length })
      : none,
    savedCardIds.length ? fetchRows('saved_cards', [['id, brand, last4']], q => q.eq('company_id', companyId).in('id', savedCardIds), { limit: savedCardIds.length }) : none,
  ])
  for (const m of transcripts || []) keepGist(m)
  const savedCard: Record<string, Row> = {}
  for (const c of savedCardRows || []) savedCard[c.id] = c
  // As the Payments page writes a card: "VISA •••• 4242".
  const cardLabel = (brand: unknown, last4: unknown) => brand ? `${String(brand).toUpperCase()} •••• ${last4 || '••••'}` : ''
  const messages = msgList
    .map(m => {
      const conv = convById[m.conversation_id] || {}
      // delivery_channel defaults to 'chat', so a plain 'chat' says nothing —
      // the conversation's own channel is the better guess then.
      const dc = String(m.delivery_channel || '').toLowerCase()
      return {
        id: m.id,
        conversation_id: m.conversation_id,
        sender_type: m.sender_type,
        sender_name: m.sender_name || null,
        // AI replies are saved as the business's (sender_type 'agent', is_ai).
        is_ai: !!m.is_ai || m.sender_type === 'ai',
        content: clip(m.content, 2000),
        channel: dc && dc !== 'chat' ? dc : String(conv.channel || dc || 'chat').toLowerCase(),
        delivery_channel: m.delivery_channel || null,
        created_at: iso(m.created_at),
        attachments: Array.isArray(m.attachments) ? m.attachments : [],
        attachment_count: Array.isArray(m.attachments) ? m.attachments.length : 0,
        conversation_subject: conv.subject || null,
        link: `/admin/inbox?conversation=${m.conversation_id}`,
      }
    })

  // ── Everything else ────────────────────────────────────────────────────────
  const activity: TimelineEvent[] = []
  const push = (e: Omit<TimelineEvent, 'group'> | null) => { if (e && e.date) activity.push({ ...e, group: KIND_GROUP[e.kind] || 'other' }) }

  const { orders: ordRows, woo: wooRows } = mergeOrders(orderRows as Row[], [...(wooEmailRows as Row[]), ...(wooPhoneRows as Row[])])
  for (const o of ordRows) {
    const st = displayStatus(o)
    push({ id: 'order-' + o.id, kind: 'order', source: channelMeta(o.sales_channel).label, date: iso(o.order_date), title: `Order #${o.order_number || o.external_order_id || ''}`.trim(),
      detail: money(o.total, o.currency), status: statusMeta(st).label, tone: ['cancelled', 'refunded', 'alert'].includes(st) ? 'bad' : st === 'shipped' ? 'good' : 'warn', link: `/admin/orders/${o.id}` })
  }
  for (const o of wooRows) {
    const st = String(o.status || '')
    push({ id: 'woo-' + o.id, kind: 'order', source: 'WooCommerce', date: iso(o.order_date), title: `Order #${o.woo_order_id}`,
      detail: money(o.total, o.currency), status: cap(st), tone: ['cancelled', 'refunded', 'failed'].includes(st) ? 'bad' : st === 'completed' ? 'good' : 'warn', link: '/admin/orders' })
  }
  for (const b of bookingRows as Row[]) {
    if (b.status === 'expired') continue   // a hold that was never paid for or confirmed
    const st = BOOKING_STATUS[b.status] || { label: cap(b.status), tone: 'muted' as const }
    push({ id: 'booking-' + b.id, kind: 'booking', source: 'Booking', date: iso(b.created_at), at: iso(b.starts_at) || undefined, tz: bookingTz(b),
      title: `Booked ${b.service_name || 'an appointment'}`, detail: [b.staff_name ? `with ${b.staff_name}` : '', b.location_label].filter(Boolean).join(' · '),
      status: st.label, tone: st.tone, link: '/admin/bookings?tab=bookings', conversationId: b.conversation_id || undefined })
  }
  for (const t of taskRows as Row[]) {
    const done = !!t.done || t.status === 'done'
    push({ id: 'task-' + t.id, kind: 'task', source: 'Task', date: iso(t.created_at), at: !done && t.due_date ? iso(t.due_date) : undefined,
      title: clip(t.title || t.text || 'Task', 140), detail: t.created_by ? `Added by ${t.created_by}` : undefined,
      status: done ? 'Done' : 'Open', tone: done ? 'good' : 'warn', link: can('tasks') ? `/admin/tasks?task=${t.id}` : inboxLink(t.conversation_id), conversationId: t.conversation_id || undefined })
  }
  for (const n of convNoteRows as Row[]) {
    push({ id: 'note-' + n.id, kind: 'note', source: n.author_name || 'Team', date: iso(n.created_at), title: 'Note', detail: clip(n.content, 400), link: inboxLink(n.conversation_id), conversationId: n.conversation_id || undefined })
  }
  for (const n of custNoteRows as Row[]) {
    push({ id: 'cnote-' + n.id, kind: 'note', source: 'Profile', date: iso(n.created_at), title: 'Note', detail: clip(n.content, 400), link: can('contacts') ? `/admin/customers/profile?id=${n.customer_id}` : undefined })
  }
  for (const m of teamNotes) {
    push({ id: 'tnote-' + m.id, kind: 'note', source: m.sender_name || 'Team', date: iso(m.created_at), title: 'Team note', detail: clip(m.content, 400) || undefined,
      status: 'Team only', tone: 'muted', link: inboxLink(m.conversation_id), conversationId: m.conversation_id || undefined })
  }
  for (const c of callRows as Row[]) {
    const st = String(c.status || '').toLowerCase()
    const secs = Number(c.duration_seconds) || 0
    const voicemail = !!c.is_voicemail || st.startsWith('voicemail')
    const missed = !voicemail && MISSED.includes(st)
    const connected = secs > 0 || !!c.recording_url || !!c.ai_summary || ['completed', 'answered'].includes(st)
    if (!connected && !voicemail && !missed) continue   // still ringing / in progress
    const inbound = c.direction === 'inbound'
    const title = voicemail ? 'Voicemail' : missed ? (inbound ? 'Missed call' : 'Outgoing call · no answer') : `${inbound ? 'Incoming' : 'Outgoing'} call${secs ? ` · ${mmss(secs)}` : ''}`
    const who = c.agent_name ? `${inbound ? 'Answered by' : 'Called by'} ${c.agent_name}` : ''
    push({ id: 'call-' + c.id, kind: 'call', source: 'Phone', date: iso(c.created_at), title,
      detail: c.ai_summary ? clip(c.ai_summary, 320) : clip([who, aiCallGist[c.id]].filter(Boolean).join('\n'), 320) || undefined,
      status: voicemail ? 'Voicemail' : missed ? 'Missed' : undefined, tone: missed ? 'bad' : voicemail ? 'warn' : undefined,
      recordingUrl: /^https?:\/\//i.test(String(c.recording_url || '')) ? c.recording_url : undefined, link: inboxLink(c.conversation_id) || '/admin/calls', conversationId: c.conversation_id || undefined })
  }
  for (const t of ticketRows as Row[]) {
    const st = String(t.status || 'open').toLowerCase()
    push({ id: 'ticket-' + t.id, kind: 'ticket', source: 'Ticket', date: iso(t.created_at), title: `Ticket${t.ticket_number ? ` #${t.ticket_number}` : ''} opened`,
      detail: clip(t.subject, 160) || undefined, status: cap(st), tone: ['resolved', 'closed'].includes(st) ? 'good' : 'warn', link: `/admin/tickets/${t.id}` })
  }
  // A submission is also the first message of the conversation it opened
  // (app/api/contact-form/submit), which shows in full with the messages: a card
  // as well would say it twice. Only one with no conversation gets a card.
  const forms = (formRows as Row[]).filter(f => !(readMsgs && f.conversation_id && convById[f.conversation_id]))
  if (forms.length) {
    const formIds = uniq(forms.map(f => f.form_id).filter(Boolean))
    const names: Record<string, string> = {}
    try {
      const { data } = await db.from('contact_forms').select('id, name').in('id', formIds)
      for (const f of data || []) names[f.id] = f.name
    } catch { /* names are a nicety */ }
    for (const f of forms) {
      const d = f.data && typeof f.data === 'object' ? f.data : {}
      const said = d.message || d.enquiry || d.comments || d.notes
        || Object.values(d).filter(v => typeof v === 'string').sort((a: string, b: string) => b.length - a.length)[0]
      push({ id: 'form-' + f.id, kind: 'form', source: 'Contact form', date: iso(f.created_at), title: `Sent the ${names[f.form_id] || 'contact'} form`,
        detail: clip(said, 200) || undefined, conversationId: f.conversation_id || undefined,
        link: inboxLink(f.conversation_id) || (f.form_id && can('inbox_settings') ? `/admin/crm-settings/contact-form/${f.form_id}` : undefined) })
    }
  }
  for (const s of saleRows as Row[]) {
    push({ id: 'sale-' + s.id, kind: 'sale', source: 'Sale', date: iso(s.created_at), title: `Sale recorded · ${money(s.amount, s.currency)}`,
      detail: [s.payment_method, s.sold_by_name ? `sold by ${s.sold_by_name}` : '', clip(s.note, 120)].filter(Boolean).join(' · ') || undefined,
      link: '/admin/payments', conversationId: s.conversation_id || undefined })
  }
  for (const p of payRows as Row[]) {
    const amt = p.amount_cents != null ? Number(p.amount_cents) / 100 : p.amount
    const st = String(p.status || 'pending').toLowerCase()
    const title = st === 'paid' ? 'Payment received' : st === 'refunded' ? 'Payment refunded' : st === 'failed' ? 'Payment failed'
      : p.payment_method === 'saved_card' ? 'Card charge started' : 'Payment link sent'
    const sc = p.saved_card_id ? savedCard[p.saved_card_id] : null
    const card = cardLabel(p.card_brand, p.card_last4) || (sc ? cardLabel(sc.brand, sc.last4) : '')
    push({ id: 'pay-' + p.id, kind: 'payment', source: 'Payment', date: iso(p.created_at), at: st === 'paid' && p.paid_at ? iso(p.paid_at) : undefined, title,
      detail: [money(amt, p.currency), p.payment_method === 'saved_card' ? 'Saved card' : '', card, clip(p.description, 120)].filter(Boolean).join(' · '),
      status: st === 'paid' ? 'Paid' : cap(st), tone: st === 'paid' ? 'good' : st === 'failed' ? 'bad' : st === 'refunded' ? 'muted' : 'warn',
      link: '/admin/payments', conversationId: p.conversation_id || undefined })
  }
  for (const c of linkClicks as Row[]) {
    const l = c.link || {}
    const kind = String(l.kind || l.link_type || '').toLowerCase()
    const where = [[c.city, c.region].filter(Boolean).join(', '), c.device].filter(Boolean).join(' · ')
    push({ id: 'click-' + c.id, kind: 'link', source: 'Link', date: iso(c.clicked_at),
      title: kind === 'payment' ? 'Opened a payment link' : kind === 'media' || kind === 'file' ? 'Opened shared files' : 'Clicked a link',
      detail: [l.label || hostOf(l.target_url), where].filter(Boolean).join(' · ') || undefined, link: linkClickHref })
  }
  if ((emailSentRows as Row[]).length || (emailEventRows as Row[]).length) {
    const ids = uniq([...(emailSentRows as Row[]), ...(emailEventRows as Row[])].map(r => r.campaign_id).filter(Boolean))
    const names: Record<string, string> = {}
    for (let i = 0; i < ids.length; i += 200) {
      const { data } = await db.from('campaigns').select('id, name').eq('company_id', companyId).in('id', ids.slice(i, i + 200))
      for (const c of (data || []) as Row[]) names[c.id] = c.name
    }
    const called = (id: string) => `“${clip(names[id] || 'a campaign email', 60)}”`
    const report = (id: string) => (id ? `/admin/campaigns/${id}/report` : undefined)
    for (const r of emailSentRows as Row[]) push({ id: 'esent-' + r.id, kind: 'campaign', source: 'Email campaign', date: iso(r.sent_at), title: `Sent ${called(r.campaign_id)}`, link: report(r.campaign_id) })
    // Opens: one card per email, at the first open, with how many times.
    const opens: Record<string, Row[]> = {}
    for (const e of emailEventRows as Row[]) {
      const cid = String(e.campaign_id || '')
      if (e.type === 'opened') { (opens[cid] ||= []).push(e); continue }
      if (e.type === 'clicked') push({ id: 'eclick-' + e.id, kind: 'campaign', source: 'Email campaign', date: iso(e.occurred_at), title: `Clicked a link in ${called(cid)}`, detail: e.link ? clip(String(e.link).replace(/^https?:\/\/(www\.)?/i, ''), 120) : undefined, link: report(cid), tone: 'good' })
      else if (e.type === 'unsubscribed') push({ id: 'eunsub-' + e.id, kind: 'campaign', source: 'Email campaign', date: iso(e.occurred_at), title: 'Unsubscribed from marketing emails', detail: `From ${called(cid)}`, link: report(cid), tone: 'warn' })
      else if (e.type === 'complained') push({ id: 'espam-' + e.id, kind: 'campaign', source: 'Email campaign', date: iso(e.occurred_at), title: `Marked ${called(cid)} as spam`, detail: 'They won’t get marketing emails again.', link: report(cid), tone: 'bad' })
      else if (e.type === 'bounced') push({ id: 'ebounce-' + e.id, kind: 'campaign', source: 'Email campaign', date: iso(e.occurred_at), title: `${called(cid)} bounced`, detail: 'The email address didn’t accept it.', link: report(cid), tone: 'warn' })
    }
    for (const [cid, list] of Object.entries(opens)) {
      const first = list.reduce((a, b) => (toMs(b.occurred_at) < toMs(a.occurred_at) ? b : a))
      push({ id: 'eopen-' + first.id, kind: 'campaign', source: 'Email campaign', date: iso(first.occurred_at), title: `Opened ${called(cid)}`, detail: list.length > 1 ? `Opened ${list.length} times` : undefined, link: report(cid) })
    }
  }
  for (const m of mediaRows as Row[]) {
    const st = String(m.status || 'open').toLowerCase()
    push({ id: 'media-' + m.id, kind: 'media', source: m.created_by || 'Team', date: iso(m.created_at), title: 'Asked for photos or files',
      detail: clip(m.prompt, 160) || undefined, status: st === 'fulfilled' ? 'Received' : cap(st), tone: st === 'fulfilled' ? 'good' : st === 'open' ? 'warn' : 'muted',
      link: inboxLink(m.conversation_id), conversationId: m.conversation_id || undefined })
  }
  for (const r of agentRows as Row[]) {
    if (r.outcome === 'no_action') continue
    const who = `${ROLE_NAMES[r.role_key] || 'AI'} agent`
    const did = r.status === 'awaiting_approval' ? 'is waiting for approval' : AGENT_OUTCOME[r.outcome] || (r.status === 'escalated' ? 'handed it to the team' : 'finished')
    push({ id: 'agent-' + r.id, kind: 'agent', source: 'AI', date: iso(r.created_at), title: `${who} ${did}`, detail: clip(r.summary, 240) || undefined,
      runId: r.id, link: `/admin/agents?run=${r.id}`, conversationId: r.conversation_id || undefined })
  }
  for (const r of reviewRows as Row[]) {
    push({ id: 'review-' + r.id, kind: 'review', source: cap(r.platform) || 'Review', date: iso(r.review_date), title: `${r.rating ? r.rating + '★ ' : ''}Review`, detail: clip(r.review_text, 200) || undefined, link: '/admin/reviews' })
  }
  for (const r of gReviewRows as Row[]) {
    push({ id: 'greview-' + r.id, kind: 'review', source: 'Google', date: iso(r.review_created_at), title: `${r.star_rating ? r.star_rating + '★ ' : ''}Google review`, detail: clip(r.comment, 200) || undefined, link: `/admin/reviews?review=${r.id}` })
  }
  for (const c of commentRows as Row[]) {
    const where = c.platform === 'instagram' ? 'Instagram' : 'Facebook'
    push({ id: 'comment-' + c.id, kind: 'comment', source: where, date: iso(c.commented_at), title: `Commented on ${where}`, detail: clip(c.message, 200) || undefined, link: `/admin/social?comment=${c.id}` })
  }
  for (const a of auditRows as Row[]) {
    push({ id: 'audit-' + a.id, kind: 'audit', source: 'System', date: iso(a.created_at), title: cap(a.action), detail: [a.detail, a.actor_name ? `by ${a.actor_name}` : ''].filter(Boolean).join(' · ') || undefined })
  }

  // ── One page, newest first ─────────────────────────────────────────────────
  const merged = [
    ...messages.map(m => ({ ms: toMs(m.created_at), m })),
    ...activity.map(a => ({ ms: toMs(a.date), a })),
  ]
  const { page, nextBefore } = cutPage(merged, fullOldest, PAGE_SIZE)
  const pageMessages = page.filter((x: Row) => x.m).map((x: Row) => x.m).reverse()
  const pageActivity = page.filter((x: Row) => x.a).map((x: Row) => x.a).reverse()

  // Filter chips this member can use.
  const groups = TIMELINE_GROUP_KEYS.filter(g => g !== 'other' && Object.keys(KIND_GROUP).some(k => KIND_GROUP[k] === g && allowed(k)))

  return NextResponse.json({
    // Oldest → newest within the page (the order the drawer has always used).
    messages: pageMessages,
    activity: pageActivity,
    linkedCount: linked.length,
    companyId,
    groups,
    hasMore: !!nextBefore,
    nextBefore,
    // More conversations than one read covers: the oldest ones' messages,
    // tasks and notes aren't in here, so the end of the list isn't the start.
    olderConversations: allowed('message') && convIds.length >= MAX_CONVERSATIONS,
    ...(summaryP ? { summary: await summaryP } : {}),
  })

  // ── At a glance ────────────────────────────────────────────────────────────
  async function summarise(): Promise<TimelineSummary> {
    const canOrders = allowed('order'), canPay = allowed('payment')
    const [ords, wooE, wooP, sales, paid, tasks, lastMsg, lastCall, next, gRev, rev] = await Promise.all([
      canOrders ? fetchRows('orders', orderTries(ORDER_COLS), q => q.eq('company_id', companyId), { limit: 1000 }) : none,
      canOrders ? wooByEmail(WOO_COLS, { limit: 1000 }) : none,
      canOrders ? wooByPhone(WOO_COLS, { limit: 1000 }) : none,
      canPay ? fetchRows('conversation_sales', [['id, amount, currency']], (q, ids) => q.eq('company_id', companyId).or(byPerson(ids)), { limit: 1000, ids: convChunks }) : none,
      canPay && convIds.length ? fetchRows('chat_payments', [['amount_cents, refunded_cents, currency'], ['amount_cents, currency']], (q, ids) => q.in('conversation_id', ids).eq('status', 'paid'), { limit: 1000, ids: convChunks }) : none,
      convIds.length ? fetchRows('conversation_tasks', [['id, done, status'], ['id, done']], (q, ids) => q.in('conversation_id', ids), { limit: 1000, ids: convChunks }) : none,
      // The last message the customer sent or was sent — not a team-only note
      // (is_internal, V188), which never reached them. Only when and on which
      // channel, never what was said, so members without the inbox get it too.
      convIds.length ? fetchRows('messages', [
        ['created_at, delivery_channel, conversation_id', (q: Builder) => q.eq('is_internal', false)],
        ['created_at, delivery_channel, conversation_id'],
      ], (q, ids) => q.in('conversation_id', ids).neq('sender_type', 'system'), { ts: 'created_at', limit: 1, ids: convChunks }) : none,
      allowed('call') ? fetchRows('calls', [['created_at']], (q, ids) => q.eq('company_id', companyId).or(byPerson(ids)), { ts: 'created_at', limit: 1, ids: convChunks }) : none,
      allowed('booking') ? fetchRows('bookings', [['id, starts_at, timezone, service_name, status']],
        (q, ids) => q.eq('company_id', companyId).or(byPerson(ids)).in('status', ['pending', 'confirmed']).gte('starts_at', new Date().toISOString()), { ts: 'starts_at', ascending: true, limit: 1, ids: convChunks }) : none,
      allowed('review') ? fetchRows('google_reviews', [['star_rating']], q => q.eq('company_id', companyId).in('contact_id', contactIds), { limit: 200 }) : none,
      allowed('review') ? fetchRows('reviews', [['rating']], q => q.eq('company_id', companyId).in('contact_id', contactIds), { limit: 200 }) : none,
    ])

    let currency = ''
    const spend = (amt: unknown, cur?: string) => { const v = Number(amt); if (!Number.isFinite(v)) return 0; if (!currency && cur) currency = String(cur).toUpperCase(); return v }
    const { orders: o1, woo: o2 } = mergeOrders(ords || [], [...(wooE || []), ...(wooP || [])])
    const counted1 = o1.filter((o: Row) => !['cancelled', 'refunded'].includes(String(o.status)) && !['refunded', 'failed'].includes(String(o.payment_status)) && displayStatus(o) !== 'awaiting_payment')
    const counted2 = o2.filter((o: Row) => !['cancelled', 'refunded', 'failed', 'pending', 'checkout-draft', 'trash'].includes(String(o.status)))
    let total = 0
    for (const o of counted1) total += spend(o.total, o.currency)
    for (const o of counted2) total += spend(o.total, o.currency)
    for (const s of sales || []) total += spend(s.amount, s.currency)
    for (const p of paid || []) total += spend((Number(p.amount_cents) - (Number(p.refunded_cents) || 0)) / 100, p.currency)

    const dates = [
      ...people.map(p => toMs(p.created_at)),
      ...(convRows || []).map((c: Row) => toMs(c.created_at)),
      ...[...o1, ...o2].map((o: Row) => toMs(o.order_date)),
    ].filter(Number.isFinite)
    const lm = (lastMsg || [])[0], lc = (lastCall || [])[0]
    let lastContact: TimelineSummary['lastContact'] = null
    if (lm) {
      const dc = String(lm.delivery_channel || '').toLowerCase()
      lastContact = { at: iso(lm.created_at), channel: dc && dc !== 'chat' ? dc : String(convById[lm.conversation_id]?.channel || 'chat').toLowerCase() }
    }
    if (lc && (!lastContact || toMs(lc.created_at) > toMs(lastContact.at))) lastContact = { at: iso(lc.created_at), channel: 'call' }
    const nb = (next || [])[0]
    const ratings = [...(gRev || []).map((r: Row) => Number(r.star_rating)), ...(rev || []).map((r: Row) => Number(r.rating))].filter(n => n >= 1 && n <= 5)
    const channels = uniq([
      ...(convRows || []).map((c: Row) => String(c.channel || '').toLowerCase()),
      ...people.flatMap(p => Array.isArray(p.channels_seen) ? p.channels_seen.map((c: Row) => String(c).toLowerCase()) : []),
    ].filter(Boolean))

    return {
      lifetimeValue: canOrders || canPay ? Math.round(total * 100) / 100 : null,
      currency: currency || 'AUD',
      // Not 0 when orders are hidden from this member: that would read as "no orders".
      orderCount: canOrders ? counted1.length + counted2.length : null,
      firstSeen: dates.length ? new Date(Math.min(...dates)).toISOString() : null,
      lastContact,
      openTasks: (tasks || []).filter((t: Row) => !(t.done || t.status === 'done')).length,
      nextBooking: nb ? { id: nb.id, at: iso(nb.starts_at), tz: bookingTz(nb), service: nb.service_name || null, status: nb.status } : null,
      avgRating: ratings.length ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 : null,
      reviewCount: ratings.length,
      channels,
    }
  }
}
