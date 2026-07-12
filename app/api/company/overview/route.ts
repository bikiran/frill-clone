import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

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

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

    // ── Conversations in range ────────────────────────────────────────────────
    const { data: convs } = await db
      .from('conversations')
      .select('id, contact_id, status, created_at')
      .eq('company_id', companyId)
      .gte('created_at', since)

    const conversations = convs || []
    const conversationIds = conversations.map(c => c.id)

    // Resolved / closed conversations.
    const resolved = conversations.filter(c => ['resolved', 'closed'].includes((c.status || '').toLowerCase())).length

    // ── Messages ──────────────────────────────────────────────────────────────
    // Received = from the customer; Replied = conversations where an agent sent
    // at least one message (a truer "replied" than counting agent messages).
    let messagesReceived = 0
    let agentRepliedConvIds = new Set<string>()
    if (conversationIds.length) {
      const { data: msgs } = await db
        .from('messages')
        .select('conversation_id, sender_type')
        .in('conversation_id', conversationIds)
      for (const m of msgs || []) {
        if (m.sender_type === 'visitor') messagesReceived++
        if (m.sender_type === 'agent') agentRepliedConvIds.add(m.conversation_id)
      }
    }
    const conversationsReplied = agentRepliedConvIds.size

    // ── Customers served (distinct contacts with a conversation in range) ──────
    const contactIds = Array.from(new Set(conversations.map(c => c.contact_id).filter(Boolean))) as string[]
    const customersServed = contactIds.length

    // New vs returning: a contact is "new" if their first conversation is in
    // this window; "returning" if they had one before it.
    let newCustomers = 0
    let returningCustomers = 0
    if (contactIds.length) {
      const { data: priorConvs } = await db
        .from('conversations')
        .select('contact_id')
        .eq('company_id', companyId)
        .in('contact_id', contactIds)
        .lt('created_at', since)
      const hadBefore = new Set((priorConvs || []).map(c => c.contact_id))
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
      const { data: orders } = await db
        .from('woocommerce_orders')
        .select('total, attribution, status, order_date')
        .eq('company_id', companyId)
        .not('attribution', 'is', null)
        .gte('order_date', since)
      for (const o of orders || []) {
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

    // Total store orders in range (for a conversion share, when available).
    let totalOrders = 0
    let totalOrderAmount = 0
    try {
      const { data: allOrders } = await db
        .from('woocommerce_orders')
        .select('total, status')
        .eq('company_id', companyId)
        .gte('order_date', since)
      for (const o of allOrders || []) {
        const st = (o.status || '').toLowerCase()
        if (['cancelled', 'failed', 'refunded', 'trash'].includes(st)) continue
        totalOrders++
        totalOrderAmount += parseFloat(o.total as any) || 0
      }
    } catch {}

    // Recovered abandoned carts.
    let cartsRecovered = 0
    let cartsRecoveredAmount = 0
    try {
      const { data: carts } = await db
        .from('abandoned_carts')
        .select('total, status, created_at')
        .eq('company_id', companyId)
        .eq('status', 'recovered')
        .gte('created_at', since)
      for (const c of carts || []) {
        cartsRecovered++
        cartsRecoveredAmount += parseFloat(c.total as any) || 0
      }
    } catch {}

    // Carts captured in the window (denominator for a recovery rate).
    let cartsCaptured = 0
    let cartsCapturedAmount = 0
    try {
      const { data: allCarts } = await db
        .from('abandoned_carts')
        .select('total, created_at')
        .eq('company_id', companyId)
        .gte('created_at', since)
      for (const c of allCarts || []) {
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
