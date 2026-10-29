import { requireCompanyAccess } from '@/lib/company-access'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { customerSummary, locationSummary, parseTs, windowFor, type ItemRow, type OrderRow } from '@/lib/insights-summary'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// The order rows behind Insights, per workspace, for a few minutes: switching
// the date range or the suburb is then instant instead of another full read.
const TTL = 5 * 60 * 1000
const rowsCache = new Map<string, { at: number; p: Promise<OrderRow[]> }>()
const itemsCache = new Map<string, { at: number; p: Promise<ItemRow[]> }>()
const PAGE = 1000
const MAX = 30000

async function readAll<T>(db: any, companyId: string, cols: string, since: number | null, map: (r: any) => T, cap = MAX): Promise<T[]> {
  let head = db.from('woocommerce_orders').select('id', { count: 'exact', head: true }).eq('company_id', companyId)
  if (since) head = head.gte('order_date', new Date(since).toISOString())
  const { count } = await head
  const total = Math.min(cap, count || 0)
  const offsets = Array.from({ length: Math.ceil(total / PAGE) }, (_, i) => i * PAGE)
  const out: T[] = []
  for (let i = 0; i < offsets.length; i += 6) {
    const batch = await Promise.all(offsets.slice(i, i + 6).map(o => {
      let q = db.from('woocommerce_orders').select(cols).eq('company_id', companyId)
      if (since) q = q.gte('order_date', new Date(since).toISOString())
      return q.order('order_date', { ascending: false }).range(o, o + PAGE - 1)
    }))
    for (const r of batch) for (const row of r.data || []) out.push(map(row))
  }
  return out
}

// Only the fields the summaries use; the address comes out of the billing
// JSON as plain columns rather than the whole object.
const ORDER_COLS = 'total, status, order_date, customer_email, woo_customer_id, city:billing->>city, pc:billing->>postcode, st:billing->>state, fn:billing->>first_name, ln:billing->>last_name, em:billing->>email'
function orderRow(o: any): OrderRow {
  const email = String(o.customer_email || o.em || '').toLowerCase()
  const name = [o.fn, o.ln].filter(Boolean).join(' ').trim() || email || 'Guest'
  return { cid: (o.woo_customer_id ? `c${o.woo_customer_id}` : email) || 'guest', name, total: Number(o.total) || 0, status: String(o.status || ''), at: parseTs(o.order_date), city: String(o.city || ''), pc: String(o.pc || ''), state: String(o.st || '') }
}

function cached<T>(map: Map<string, { at: number; p: Promise<T> }>, key: string, load: () => Promise<T>): Promise<T> {
  const hit = map.get(key)
  if (hit && Date.now() - hit.at < TTL) return hit.p
  const p = load().catch(e => { map.delete(key); throw e })
  map.set(key, { at: Date.now(), p })
  if (map.size > 200) map.delete(map.keys().next().value as string)
  return p
}

/**
 * GET /api/insights/summary?kind=customers|location&range=day|week|month|all|custom&from&to&suburb
 * The numbers the Customer / Location Insights pages show, worked out here
 * (lib/insights-summary) from Colvy's synced copy of the store's orders.
 * { empty: true } when nothing is synced yet.
 */
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams
    let companyId = sp.get('companyId')
    const db = admin()
    if (!companyId) {
      const m = (req.headers.get('host') || '').match(/^([^.]+)\.colvy\.com$/)
      if (m && m[1] !== 'www') {
        const { data: co } = await db.from('companies').select('id').eq('slug', m[1]).maybeSingle()
        if (co) companyId = co.id
      }
    }
    if (!companyId) return NextResponse.json({ empty: true })
    if (!(await requireCompanyAccess(req, db, companyId)).ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })

    const kind = sp.get('kind') === 'location' ? 'location' : 'customers'
    const w = windowFor(sp.get('range') || (kind === 'location' ? 'month' : 'all'), sp.get('from'), sp.get('to'))
    const rows = await cached(rowsCache, companyId, () => readAll(db, companyId!, ORDER_COLS, null, orderRow))
    if (!rows.length) return NextResponse.json({ empty: true })

    if (kind === 'customers') return NextResponse.json({ customers: customerSummary(rows, w), at: Date.now() })

    // Products need the line items, which are heavy: only the orders in the
    // window (all time is capped to the latest 8,000 orders).
    const since = w.all ? null : w.start
    const itemKey = `${companyId}:${since ? Math.floor(since / 3600000) : 'all'}`
    const items = await cached(itemsCache, itemKey, () => readAll(db, companyId!, 'status, order_date, line_items', since, (o: any): ItemRow => ({
      at: parseTs(o.order_date), status: String(o.status || ''),
      items: (o.line_items || []).map((li: any) => ({ name: String(li?.name || 'Item'), total: Number(li?.total) || 0, qty: Number(li?.quantity) || 1 })),
    }), since ? MAX : 8000)).catch(() => null)
    return NextResponse.json({ location: locationSummary(rows, items, w, sp.get('suburb') || ''), productsCapped: !since, at: Date.now() })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Could not load insights' }, { status: 500 })
  }
}
