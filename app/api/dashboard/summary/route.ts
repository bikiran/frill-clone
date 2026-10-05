import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireCompanyAccess } from '@/lib/company-access'
import { computeSla, resolveSla } from '@/lib/ticket-sla'
import { dayKey, startOfDay, callOutcome } from '@/lib/dashboard-time'

// GET /api/dashboard/summary?companyId=&tz=
//
// Everything the admin home page shows, in one round trip:
//   • attention — what needs someone today (unread chats, missed calls, orders
//     to pack, overdue tasks, tickets past their deadline, reviews to answer…)
//   • today     — today's bookings and the tasks due today
//   • perf      — the last 30 days against the 30 before, plus daily revenue
//   • activity  — the latest orders, reviews, bookings and waitlist sign-ups
// Every query is independent and best-effort: a table a business doesn't use
// (or a migration that hasn't run) reads as zero rather than failing the page.

export const dynamic = 'force-dynamic'

const DAY = 864e5
const OPEN_ORDER = ['awaiting_shipment', 'packed', 'click_and_collect']

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

function validTz(tz: string | null): string {
  try { if (tz) { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return tz } } catch {}
  return 'Australia/Melbourne'
}

const isTaskDone = (t: any) => (t.status ? t.status === 'done' : !!t.done)

export async function GET(req: NextRequest) {
  const companyId = req.nextUrl.searchParams.get('companyId')
  const tz = validTz(req.nextUrl.searchParams.get('tz'))
  const db: any = admin()
  // Cheap rejections first, so an anonymous request never touches the data.
  if (!companyId || !/^Bearer\s+\S+/i.test(req.headers.get('authorization') || '')) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }
  const started = Date.now()
  // The access check is 2–3 round trips to Supabase (verify the token, then
  // owner / team member). Run it ALONGSIDE the queries rather than before
  // them; nothing is returned unless it passes.
  const accessP = requireCompanyAccess(req, db, companyId)

  const now = new Date()
  const today0 = startOfDay(now, tz)
  const tomorrow0 = startOfDay(new Date(today0.getTime() + DAY + 3 * 3600_000), tz)
  const iso = (ms: number) => new Date(ms).toISOString()
  const d7 = iso(now.getTime() - 7 * DAY), d30 = iso(now.getTime() - 30 * DAY), d60 = iso(now.getTime() - 60 * DAY)

  const safe = async <T,>(fn: () => Promise<T>, fallback: T): Promise<T> => { try { return await fn() } catch { return fallback } }
  const count = (q: any) => safe(async () => { const { count: n, error } = await q; return error ? 0 : (n || 0) }, 0)
  const rows = (q: any) => safe(async () => { const { data, error } = await q; return error ? [] : (data || []) }, [] as any[])
  // PostgREST caps a response (1000 rows by default), so page through.
  const all = (build: () => any, cap = 20000) => safe(async () => {
    const out: any[] = []
    for (let from = 0; from < cap; from += 1000) {
      const { data, error } = await build().range(from, from + 999)
      if (error || !data?.length) break
      out.push(...data)
      if (data.length < 1000) break
    }
    return out
  }, [] as any[])
  const conv = () => db.from('conversations').select('id', { count: 'exact', head: true }).eq('company_id', companyId)
  const notClosed = '(closed,resolved)'
  const notSpam = 'is_spam.is.null,is_spam.eq.false'

  const dataP = Promise.all([
    count(conv().eq('is_unread', true).not('status', 'in', notClosed).or(notSpam)),
    count(conv().is('assigned_to', null).not('status', 'in', notClosed).or(notSpam).gte('last_message_at', d7)),
    rows(db.from('calls').select('direction, status, duration_seconds, is_voicemail').eq('company_id', companyId).gte('created_at', today0.toISOString()).limit(1000)),
    count(db.from('orders').select('id', { count: 'exact', head: true }).eq('company_id', companyId).in('status', OPEN_ORDER)),
    rows(db.from('orders').select('order_date, created_at').eq('company_id', companyId).in('status', OPEN_ORDER).order('order_date', { ascending: true, nullsFirst: false }).limit(1)),
    rows(db.from('conversation_tasks').select('id, text, due_date, status, done, assigned_to, conversation_id').eq('company_id', companyId).lt('due_date', tomorrow0.toISOString()).order('due_date', { ascending: true }).limit(2000)),
    rows(db.from('support_tickets').select('id, priority, status, created_at, updated_at, first_response_at, resolved_at').eq('company_id', companyId).in('status', ['open', 'in_progress']).limit(1000)),
    safe(async () => (await db.from('companies').select('ticket_sla_settings').eq('id', companyId).maybeSingle()).data, null as any),
    count(db.from('google_reviews').select('id', { count: 'exact', head: true }).eq('company_id', companyId).is('replied_at', null).is('reply_comment', null).gte('review_created_at', d30)),
    count(db.from('google_reviews').select('id', { count: 'exact', head: true }).eq('company_id', companyId).is('replied_at', null).is('reply_comment', null).gte('review_created_at', d30).lte('star_rating', 3)),
    count(db.from('stock_waitlist').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('status', 'waiting')),
    rows(db.from('abandoned_carts').select('total').eq('company_id', companyId).eq('status', 'abandoned').gte('updated_at', d7).limit(1000)),
    rows(db.from('bookings').select('id, starts_at, ends_at, customer_name, service_name, staff_name, status').eq('company_id', companyId)
      .gte('starts_at', today0.toISOString()).lt('starts_at', tomorrow0.toISOString()).in('status', ['pending', 'confirmed', 'completed']).order('starts_at', { ascending: true }).limit(50)),
    all(() => db.from('orders').select('total, status, order_date').eq('company_id', companyId).gte('order_date', d60).order('order_date', { ascending: true })),
    count(conv().gte('created_at', d30)),
    count(conv().gte('created_at', d60).lt('created_at', d30)),
    rows(db.from('google_reviews').select('star_rating, review_created_at').eq('company_id', companyId).gte('review_created_at', d60).limit(2000)),
    count(db.from('calls').select('id', { count: 'exact', head: true }).eq('company_id', companyId).gte('created_at', d30)),
    count(db.from('calls').select('id', { count: 'exact', head: true }).eq('company_id', companyId).gte('created_at', d60).lt('created_at', d30)),
    rows(db.from('orders').select('id, order_number, total, customer_name, status, created_at').eq('company_id', companyId).order('created_at', { ascending: false }).limit(6)),
    rows(db.from('google_reviews').select('id, reviewer_name, star_rating, review_created_at').eq('company_id', companyId).order('review_created_at', { ascending: false }).limit(4)),
    rows(db.from('stock_waitlist').select('id, customer_name, item_name, created_at').eq('company_id', companyId).order('created_at', { ascending: false }).limit(4)),
    rows(db.from('bookings').select('id, customer_name, service_name, starts_at, created_at').eq('company_id', companyId).in('status', ['pending', 'confirmed']).order('created_at', { ascending: false }).limit(4)),
    rows(db.from('ideas').select('id, title, created_by_name, created_at').eq('company_id', companyId).order('created_at', { ascending: false }).limit(3)),
  ])
  const [access, results] = await Promise.all([accessP, dataP])
  if (!access.ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  const [
    unread, unassigned, callsToday, awaiting, oldestAwaiting, tasks, tickets, company,
    reviewsToAnswer, lowReviewsToAnswer, waitlist, carts, bookingsToday,
    orders60, convNow, convPrev, reviews60, callsNow, callsPrev,
    recentOrders, recentReviews, recentWaitlist, recentBookings, recentIdeas,
  ] = results

  // ── Needs attention ────────────────────────────────────────────────────────
  let missedCalls = 0, voicemails = 0
  for (const c of callsToday) {
    if (String(c.direction || '').toLowerCase() !== 'inbound') continue
    const o = callOutcome(c)
    if (o === 'missed') missedCalls++
    if (o === 'voicemail') voicemails++
  }
  const oldest = oldestAwaiting[0]?.order_date || oldestAwaiting[0]?.created_at
  const oldestDays = oldest ? Math.max(0, Math.floor((now.getTime() - Date.parse(oldest)) / DAY)) : null

  const openTasks = tasks.filter((t: any) => !isTaskDone(t) && t.due_date)
  const overdueTasks = openTasks.filter((t: any) => Date.parse(t.due_date) < today0.getTime())
  const dueToday = openTasks.filter((t: any) => Date.parse(t.due_date) >= today0.getTime())

  const sla = resolveSla(company?.ticket_sla_settings)
  let ticketsOverdue = 0, ticketsSoon = 0
  for (const t of tickets) {
    const w = computeSla(t, sla, now).worst
    if (w === 'overdue') ticketsOverdue++
    else if (w === 'soon') ticketsSoon++
  }

  const cartValue = carts.reduce((a: number, c: any) => a + (Number(c.total) || 0), 0)

  // ── Last 30 days vs the 30 before ──────────────────────────────────────────
  const cut = now.getTime() - 30 * DAY
  const sales = { now: { revenue: 0, orders: 0 }, prev: { revenue: 0, orders: 0 } }
  const byDay: Record<string, number> = {}
  for (const o of orders60) {
    if (o.status === 'cancelled' || !o.order_date) continue
    const t = Date.parse(o.order_date), amt = Number(o.total) || 0
    const bucket = t >= cut ? sales.now : sales.prev
    bucket.revenue += amt; bucket.orders++
    if (t >= cut) { const k = dayKey(new Date(t), tz); byDay[k] = (byDay[k] || 0) + amt }
  }
  const daily: { day: string; label: string; value: number }[] = []
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now.getTime() - i * DAY)
    const k = dayKey(d, tz)
    if (daily.some(x => x.day === k)) continue
    daily.push({ day: k, label: new Intl.DateTimeFormat('en-AU', { timeZone: tz, day: 'numeric', month: 'short', weekday: 'short' }).format(d), value: Math.round((byDay[k] || 0) * 100) / 100 })
  }
  const rv = { now: [] as number[], prev: [] as number[] }
  for (const r of reviews60) {
    if (r.star_rating == null) continue
    ;(Date.parse(r.review_created_at) >= cut ? rv.now : rv.prev).push(Number(r.star_rating))
  }
  const avg = (a: number[]) => (a.length ? Math.round((a.reduce((x, y) => x + y, 0) / a.length) * 10) / 10 : null)

  // ── Recent activity ────────────────────────────────────────────────────────
  const activity: any[] = []
  for (const o of recentOrders) activity.push({ kind: 'order', at: o.created_at, title: `Order #${o.order_number || '—'}`, detail: [o.customer_name, o.total != null ? `$${Number(o.total).toFixed(2)}` : ''].filter(Boolean).join(' · '), href: '/admin/orders' })
  for (const r of recentReviews) activity.push({ kind: 'review', at: r.review_created_at, title: `${r.star_rating ?? '—'}-star Google review`, detail: r.reviewer_name || '', rating: r.star_rating, href: `/admin/reviews?review=${r.id}` })
  for (const w of recentWaitlist) activity.push({ kind: 'waitlist', at: w.created_at, title: 'Joined a waitlist', detail: [w.customer_name, w.item_name].filter(Boolean).join(' · '), href: '/admin/waitlists' })
  for (const b of recentBookings) activity.push({ kind: 'booking', at: b.created_at, title: 'New booking', detail: [b.customer_name, b.service_name].filter(Boolean).join(' · '), href: '/admin/bookings' })
  for (const i of recentIdeas) activity.push({ kind: 'idea', at: i.created_at, title: 'New idea', detail: [i.created_by_name, i.title].filter(Boolean).join(' · '), href: '/' })
  activity.sort((a, b) => Date.parse(b.at || 0) - Date.parse(a.at || 0))

  return NextResponse.json({
    tz, ms: Date.now() - started,
    attention: {
      unread, unassigned,
      missedCalls, voicemails, callsToday: callsToday.length,
      awaiting, oldestDays,
      overdueTasks: overdueTasks.length, dueToday: dueToday.length,
      ticketsOverdue, ticketsSoon,
      reviewsToAnswer, lowReviewsToAnswer,
      waitlist,
      carts: carts.length, cartValue: Math.round(cartValue * 100) / 100,
      bookingsToday: bookingsToday.length,
    },
    today: {
      bookings: bookingsToday,
      tasks: [...overdueTasks.map((t: any) => ({ ...t, overdue: true })), ...dueToday].slice(0, 8)
        .map((t: any) => ({ id: t.id, text: t.text, due_date: t.due_date, assigned_to: t.assigned_to, overdue: !!t.overdue })),
    },
    perf: {
      revenue: { now: Math.round(sales.now.revenue * 100) / 100, prev: Math.round(sales.prev.revenue * 100) / 100 },
      orders: { now: sales.now.orders, prev: sales.prev.orders },
      aov: { now: sales.now.orders ? sales.now.revenue / sales.now.orders : 0, prev: sales.prev.orders ? sales.prev.revenue / sales.prev.orders : 0 },
      conversations: { now: convNow, prev: convPrev },
      calls: { now: callsNow, prev: callsPrev },
      reviews: { now: rv.now.length, prev: rv.prev.length, avgNow: avg(rv.now), avgPrev: avg(rv.prev) },
      daily,
    },
    activity: activity.slice(0, 10),
  })
}
