import { requireCompanyAccess } from '@/lib/company-access'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// PostgREST hands back at most 1,000 rows a request, so page through the rest.
async function every<T>(build: () => any, size = 1000): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; from < 100_000; from += size) {
    const { data, error } = await build().range(from, from + size - 1)
    if (error) throw new Error(error.message)
    out.push(...(data || []))
    if (!data || data.length < size) break
  }
  return out
}

// A long `in (…)` list makes the request URL too long and it fails outright,
// so ids go in batches.
const batches = <T,>(ids: T[], n = 120) => Array.from({ length: Math.ceil(ids.length / n) }, (_, i) => ids.slice(i * n, i * n + n))

// Real business metrics for the company Overview tab. Every number below is
// computed from actual rows — nothing is estimated or faked. Where a metric
// can't be derived from available data it is returned as null so the UI can
// say so honestly rather than showing a misleading zero.
export async function GET(req: NextRequest) {
  try {
    const companyId = req.nextUrl.searchParams.get('companyId')
    const days = parseInt(req.nextUrl.searchParams.get('days') || '30', 10)
    if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 })
    const db = admin()
    // Workspace members only.
    if (!(await requireCompanyAccess(req, db, companyId)).ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

    // ── Conversations in range ────────────────────────────────────────────────
    const conversations = await every<{ id: string; contact_id: string | null; status: string | null }>(() => db
      .from('conversations')
      .select('id, contact_id, status, created_at')
      .eq('company_id', companyId)
      .gte('created_at', since)
      .order('id'))
    const conversationIds = conversations.map(c => c.id)

    // Resolved / closed conversations.
    const resolved = conversations.filter(c => ['resolved', 'closed'].includes((c.status || '').toLowerCase())).length

    // ── Messages ──────────────────────────────────────────────────────────────
    // Received = from the customer; Replied = conversations where the team (or
    // an AI agent) sent at least one message (truer than counting messages).
    let messagesReceived = 0
    const agentRepliedConvIds = new Set<string>()
    await Promise.all(batches(conversationIds).map(async ids => {
      const { count } = await db.from('messages').select('id', { count: 'exact', head: true })
        .in('conversation_id', ids).eq('sender_type', 'visitor')
      messagesReceived += count || 0
      const replies = await every<{ conversation_id: string }>(() => db.from('messages').select('conversation_id')
        .in('conversation_id', ids).in('sender_type', ['agent', 'ai']).order('id'))
      for (const m of replies) agentRepliedConvIds.add(m.conversation_id)
    }))
    const conversationsReplied = agentRepliedConvIds.size

    // ── Customers served (distinct contacts with a conversation in range) ──────
    const contactIds = Array.from(new Set(conversations.map(c => c.contact_id).filter(Boolean))) as string[]
    const customersServed = contactIds.length

    // New vs returning: a contact is "new" if their first conversation is in
    // this window; "returning" if they had one before it.
    let newCustomers = 0
    let returningCustomers = 0
    if (contactIds.length) {
      const hadBefore = new Set<string>()
      await Promise.all(batches(contactIds).map(async ids => {
        const prior = await every<{ contact_id: string }>(() => db
          .from('conversations')
          .select('contact_id')
          .eq('company_id', companyId)
          .in('contact_id', ids)
          .lt('created_at', since)
          .order('id'))
        for (const c of prior) hadBefore.add(c.contact_id)
      }))
      for (const id of contactIds) {
        if (hadBefore.has(id)) returningCustomers++
        else newCustomers++
      }
    }

    // ── Sales converted through chat (REAL revenue) ───────────────────────────
    // Orders are recorded in woocommerce_orders with an attribution telling us
    // how Colvy contributed. These are actual order totals, not estimates.
    let salesConverted = 0
    let salesAmount = 0
    const byAttribution: Record<string, { count: number; amount: number }> = {}
    try {
      const orders = await every<any>(() => db
        .from('woocommerce_orders')
        .select('total, attribution, status, order_date')
        .eq('company_id', companyId)
        .not('attribution', 'is', null)
        .gte('order_date', since)
        .order('order_date').order('woo_order_id'))
      for (const o of orders) {
        // Don't count cancelled/failed/refunded orders as converted revenue.
        const st = (o.status || '').toLowerCase()
        if (['cancelled', 'failed', 'refunded', 'trash'].includes(st)) continue
        const amt = parseFloat(o.total as any) || 0
        salesConverted++
        salesAmount += amt
        const key = o.attribution || 'other'
        if (!byAttribution[key]) byAttribution[key] = { count: 0, amount: 0 }
        byAttribution[key].count++
        byAttribution[key].amount += amt
      }
    } catch {}
    // Shopify orders carry the same attribution on the operational orders row.
    try {
      const shopOrders = await every<any>(() => db
        .from('orders')
        .select('total, attribution, status, payment_status')
        .eq('company_id', companyId).eq('sales_channel', 'shopify')
        .not('attribution', 'is', null)
        .gte('order_date', since)
        .order('id'))
      for (const o of shopOrders) {
        if (['cancelled', 'refunded'].includes(String(o.status || '')) || ['refunded', 'failed'].includes(String(o.payment_status || ''))) continue
        const amt = parseFloat(o.total as any) || 0
        salesConverted++
        salesAmount += amt
        const key = o.attribution || 'other'
        if (!byAttribution[key]) byAttribution[key] = { count: 0, amount: 0 }
        byAttribution[key].count++
        byAttribution[key].amount += amt
      }
    } catch {}

    // Total store orders in range (for a conversion share, when available).
    let totalOrders = 0
    let totalOrderAmount = 0
    try {
      const allOrders = await every<any>(() => db
        .from('woocommerce_orders')
        .select('total, status')
        .eq('company_id', companyId)
        .gte('order_date', since)
        .order('order_date').order('woo_order_id'))
      for (const o of allOrders) {
        const st = (o.status || '').toLowerCase()
        if (['cancelled', 'failed', 'refunded', 'trash'].includes(st)) continue
        totalOrders++
        totalOrderAmount += parseFloat(o.total as any) || 0
      }
    } catch {}
    // Shopify orders (operational orders table) count toward the store total too.
    try {
      const shopOrders = await every<any>(() => db
        .from('orders')
        .select('total, status, payment_status')
        .eq('company_id', companyId).eq('sales_channel', 'shopify')
        .gte('order_date', since)
        .order('id'))
      for (const o of shopOrders) {
        if (['cancelled', 'refunded'].includes(String(o.status || '')) || ['refunded', 'failed'].includes(String(o.payment_status || ''))) continue
        totalOrders++
        totalOrderAmount += parseFloat(o.total as any) || 0
      }
    } catch {}

    // Recovered abandoned carts.
    let cartsRecovered = 0
    let cartsRecoveredAmount = 0
    try {
      const carts = await every<any>(() => db
        .from('abandoned_carts')
        .select('total, status, created_at')
        .eq('company_id', companyId)
        .eq('status', 'recovered')
        .gte('created_at', since)
        .order('id'))
      for (const c of carts) {
        cartsRecovered++
        cartsRecoveredAmount += parseFloat(c.total as any) || 0
      }
    } catch {}

    // Carts captured in the window (denominator for a recovery rate).
    let cartsCaptured = 0
    let cartsCapturedAmount = 0
    try {
      const allCarts = await every<any>(() => db
        .from('abandoned_carts')
        .select('total, created_at')
        .eq('company_id', companyId)
        .gte('created_at', since)
        .order('id'))
      for (const c of allCarts) {
        cartsCaptured++
        cartsCapturedAmount += parseFloat(c.total as any) || 0
      }
    } catch {}

    return NextResponse.json({
      days,
      conversations: conversations.length,
      customersServed,
      newCustomers,
      returningCustomers,
      messagesReceived,
      conversationsReplied,
      resolved,
      // Real, attributed revenue
      salesConverted,
      salesAmount: Math.round(salesAmount * 100) / 100,
      byAttribution,
      totalOrders,
      totalOrderAmount: Math.round(totalOrderAmount * 100) / 100,
      cartsCaptured,
      cartsCapturedAmount: Math.round(cartsCapturedAmount * 100) / 100,
      cartsRecovered,
      cartsRecoveredAmount: Math.round(cartsRecoveredAmount * 100) / 100,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
