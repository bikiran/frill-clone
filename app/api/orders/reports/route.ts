import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { statusMeta, channelMeta, CARRIER_LABEL } from '@/lib/orders'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

async function isMember(db: any, req: NextRequest, companyId: string): Promise<boolean> {
  const token = (req.headers.get('authorization') || '').replace('Bearer ', '')
  if (!token) return false
  try {
    const { data } = await db.auth.getUser(token)
    const uid = data?.user?.id
    if (!uid) return false
    const { data: co } = await db.from('companies').select('owner_id').eq('id', companyId).maybeSingle()
    if (co?.owner_id === uid) return true
    const { data: tm } = await db.from('team_members').select('id').eq('company_id', companyId).eq('user_id', uid).maybeSingle()
    return !!tm?.id
  } catch { return false }
}

const RANGE_DAYS: Record<string, number | null> = { '7d': 7, '30d': 30, '90d': 90, all: null }

/**
 * GET /api/orders/reports?companyId=…&range=30d
 *
 * Computes the Orders Reports aggregates SERVER-SIDE and returns a compact
 * summary (a few KB) instead of shipping every order row to the browser. The
 * heavy rows are loaded here — same datacenter, index-served — and reduced to
 * KPIs / buckets / series / small detail tables the page renders as-is.
 */
export async function GET(req: NextRequest) {
  try {
    const companyId = req.nextUrl.searchParams.get('companyId') || ''
    if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 })
    const db = admin()
    if (!(await isMember(db, req, companyId))) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })

    const rangeKey = req.nextUrl.searchParams.get('range') || '30d'
    const days = rangeKey in RANGE_DAYS ? RANGE_DAYS[rangeKey] : 30
    // Explicit window (from/to ISO) takes precedence over the range preset, so
    // the page can offer Today / Yesterday / This month / Last month / Custom.
    const fromParam = req.nextUrl.searchParams.get('from') || ''
    const toParam = req.nextUrl.searchParams.get('to') || ''
    const startISO = fromParam || (days != null ? new Date(Date.now() - days * 864e5).toISOString() : null)
    const endISO = toParam || null
    const sinceISO = startISO   // lower bound for the orders query
    // Optional filters: outlet (store_location_id) and sales channel.
    const locationFilter = req.nextUrl.searchParams.get('location') || ''
    const channelFilter = req.nextUrl.searchParams.get('channel') || ''

    // Load the range's orders (only the columns the aggregates need) + shipments,
    // paginating past PostgREST's per-response cap.
    const PAGE = 1000
    const orders: any[] = []
    for (let from = 0; from < 500000; from += PAGE) {
      let q = db.from('orders')
        .select('id, order_number, customer_name, status, order_date, shipped_at, shipping_total, total, item_count, sales_channel, primary_sku, store_location_id')
        .eq('company_id', companyId)
      if (sinceISO) q = q.gte('order_date', sinceISO)
      if (endISO) q = q.lte('order_date', endISO)
      if (locationFilter && locationFilter !== 'all') {
        q = locationFilter === 'unassigned' ? q.is('store_location_id', null) : q.eq('store_location_id', locationFilter)
      }
      const { data, error } = await q.order('order_date', { ascending: false }).range(from, from + PAGE - 1)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      if (!data?.length) break
      orders.push(...data)
      if (data.length < PAGE) break
    }
    // Distinct channels present (before the channel filter) — drives the page's
    // channel dropdown so it only offers channels that actually have orders.
    const channelsAll = Array.from(new Set(orders.map(o => o.sales_channel || 'other'))).sort()
    // Apply the channel filter in memory so channelsAll stays complete. Only
    // mutate `orders` when actually filtering — `filter()` returns a NEW array,
    // whereas assigning `orders` to itself and then clearing it would wipe the
    // data (that emptied "All channels" while a specific channel still worked).
    if (channelFilter && channelFilter !== 'all') {
      const ordersF = orders.filter(o => (o.sales_channel || 'other') === channelFilter)
      orders.length = 0; orders.push(...ordersF)
    }
    const rangeIds = new Set(orders.map(o => o.id))

    const shipments: any[] = []
    for (let from = 0; from < 100000; from += PAGE) {
      let sq = db.from('order_shipments').select('id, order_id, carrier, service, status, cost, tracking_number, created_at').eq('company_id', companyId)
      if (sinceISO) sq = sq.gte('created_at', sinceISO)
      const { data, error } = await sq.range(from, from + PAGE - 1)
      if (error) break
      if (!data?.length) break
      shipments.push(...data)
      if (data.length < PAGE) break
    }
    // Only shipments whose order is in the (filtered) set — so an outlet/channel
    // filter flows through to the shipping report too. Falls back to date-in-range
    // shipments when no order-level filter is active so nothing is lost.
    const hasOrderFilter = (locationFilter && locationFilter !== 'all') || (channelFilter && channelFilter !== 'all')
    const shipsInRange = hasOrderFilter
      ? shipments.filter(s => rangeIds.has(s.order_id))
      : shipments.filter(s => rangeIds.has(s.order_id) || s.created_at)

    // ── Fulfilment ────────────────────────────────────────────────────────────
    const countBy = (pred: (o: any) => boolean) => orders.reduce((n, o) => n + (pred(o) ? 1 : 0), 0)
    const total = orders.length
    const shipped = countBy(o => o.status === 'shipped')
    const cancelled = countBy(o => o.status === 'cancelled')
    const awaiting = countBy(o => o.status === 'awaiting_shipment')
    const onHold = countBy(o => o.status === 'on_hold')
    const rate = total - cancelled > 0 ? Math.round((shipped / (total - cancelled)) * 100) : 0
    const shipTimes = orders.filter(o => o.status === 'shipped' && o.shipped_at && o.order_date)
      .map(o => new Date(o.shipped_at).getTime() - new Date(o.order_date).getTime()).filter(ms => ms > 0)
    const avgHrs = shipTimes.length ? shipTimes.reduce((a, b) => a + b, 0) / shipTimes.length / 3600e3 : 0
    const now = Date.now()
    const buckets = { fresh: 0, mod: 0, late: 0 }
    for (const o of orders) {
      if (['shipped', 'cancelled'].includes(o.status) || !o.order_date) continue
      const h = (now - new Date(o.order_date).getTime()) / 3600e3
      if (h < 12) buckets.fresh++; else if (h < 48) buckets.mod++; else buckets.late++
    }
    const statuses = ['awaiting_shipment', 'packed', 'on_hold', 'click_and_collect', 'shipped', 'cancelled']
    const byStatus = statuses.map(s => ({ label: statusMeta(s).label, value: countBy(o => o.status === s), color: statusMeta(s).fg })).filter(r => r.value > 0)

    // ── Shipping ──────────────────────────────────────────────────────────────
    const labels = shipsInRange.length
    const cost = shipsInRange.reduce((a, s) => a + (Number(s.cost) || 0), 0)
    const avg = labels ? cost / labels : 0
    const charged = orders.reduce((a, o) => a + (Number(o.shipping_total) || 0), 0)
    const margin = charged - cost
    const orderById = new Map(orders.map(o => [o.id, o]))
    const detail = shipsInRange.map((s: any) => {
      const o: any = orderById.get(s.order_id)
      return { id: s.id, order: o?.order_number || '—', customer: o?.customer_name || '—', carrier: CARRIER_LABEL[s.carrier] || s.carrier || '—', tracking: s.tracking_number || '—', charged: Number(o?.shipping_total) || 0, incurred: Number(s.cost) || 0 }
    }).sort((a, b) => b.charged - a.charged).slice(0, 500)
    const byCarrier: Record<string, { n: number; cost: number }> = {}
    for (const s of shipsInRange) { const k = s.carrier || 'custom'; (byCarrier[k] ||= { n: 0, cost: 0 }); byCarrier[k].n++; byCarrier[k].cost += Number(s.cost) || 0 }
    const carriers = Object.entries(byCarrier).map(([k, v]) => ({ label: CARRIER_LABEL[k] || k, value: v.n, sub: String(v.n) })).sort((a, b) => b.value - a.value)
    const byService: Record<string, number> = {}
    for (const s of shipsInRange) { const k = s.service || 'Unspecified'; byService[k] = (byService[k] || 0) + 1 }
    const services = Object.entries(byService).map(([k, v]) => ({ label: k, value: v })).sort((a, b) => b.value - a.value).slice(0, 8)
    const byTrack: Record<string, number> = {}
    for (const s of shipsInRange) { const k = s.status || 'created'; byTrack[k] = (byTrack[k] || 0) + 1 }
    const track = Object.entries(byTrack).map(([k, v]) => ({ label: k.replace(/_/g, ' '), value: v }))

    // ── Sales ─────────────────────────────────────────────────────────────────
    const nonCancelled = orders.filter(o => o.status !== 'cancelled')
    const revenue = nonCancelled.reduce((a, o) => a + (Number(o.total) || 0), 0)
    const orderN = nonCancelled.length
    const aov = orderN ? revenue / orderN : 0
    const units = nonCancelled.reduce((a, o) => a + (Number(o.item_count) || 0), 0)
    const byChannel: Record<string, { n: number; rev: number }> = {}
    for (const o of nonCancelled) { const k = o.sales_channel || 'other'; (byChannel[k] ||= { n: 0, rev: 0 }); byChannel[k].n++; byChannel[k].rev += Number(o.total) || 0 }
    const channels = Object.entries(byChannel).map(([k, v]) => ({ label: `${channelMeta(k).icon} ${channelMeta(k).label}`, value: v.rev, sub: `$${v.rev.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` })).sort((a, b) => b.value - a.value)
    const bySku: Record<string, number> = {}
    for (const o of nonCancelled) { const k = o.primary_sku; if (!k) continue; bySku[k] = (bySku[k] || 0) + 1 }
    const topSku = Object.entries(bySku).map(([k, v]) => ({ label: k, value: v, sub: `${v} orders` })).sort((a, b) => b.value - a.value).slice(0, 8)

    // ── Daily series spanning the selected window ───────────────────────────────
    const dayMs = 864e5
    const byDayCount: Record<string, number> = {}
    const byDayRev: Record<string, number> = {}
    for (const o of orders) {
      if (!o.order_date) continue
      const d = new Date(o.order_date); d.setHours(0, 0, 0, 0); const k = d.toISOString().slice(0, 10)
      byDayCount[k] = (byDayCount[k] || 0) + 1
      byDayRev[k] = (byDayRev[k] || 0) + (o.status === 'cancelled' ? 0 : (Number(o.total) || 0))
    }
    const seriesEnd = endISO ? new Date(endISO) : new Date(); seriesEnd.setHours(0, 0, 0, 0)
    let seriesStart = startISO ? new Date(startISO) : new Date(seriesEnd.getTime() - ((days || 30) - 1) * dayMs)
    seriesStart.setHours(0, 0, 0, 0)
    let dayCount = Math.floor((seriesEnd.getTime() - seriesStart.getTime()) / dayMs) + 1
    if (dayCount < 1) dayCount = 1
    if (dayCount > 180) { seriesStart = new Date(seriesEnd.getTime() - 179 * dayMs); dayCount = 180 }   // keep the chart legible
    const dailyOrders: { day: string; value: number }[] = []
    const dailyRevenue: { day: string; value: number }[] = []
    for (let i = 0; i < dayCount; i++) {
      const d = new Date(seriesStart.getTime() + i * dayMs); const k = d.toISOString().slice(0, 10)
      const label = d.toLocaleDateString('en-AU', { day: '2-digit', month: 'short' })
      dailyOrders.push({ day: label, value: byDayCount[k] || 0 })
      dailyRevenue.push({ day: label, value: byDayRev[k] || 0 })
    }

    return NextResponse.json({
      fulfil: { total, shipped, cancelled, awaiting, onHold, rate, avgHrs, buckets, byStatus },
      shipping: { labels, cost, avg, charged, margin, detail, carriers, services, track },
      sales: { revenue, orderN, aov, units, channels, topSku },
      dailyOrders, dailyRevenue,
      channelsAll,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 })
  }
}
