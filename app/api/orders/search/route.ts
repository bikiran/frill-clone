import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

/**
 * GET /api/orders/search?companyId=&q=
 *
 * Searches synced orders by order number, customer name/email/phone, or an item
 * name. Used by the "Link to order" picker on tasks. Reads the local
 * woocommerce_orders table so it's fast and works offline of the store.
 */
export async function GET(req: NextRequest) {
  try {
    const companyId = req.nextUrl.searchParams.get('companyId')
    const q = (req.nextUrl.searchParams.get('q') || '').trim()
    if (!companyId || q.length < 2) return NextResponse.json({ orders: [] })

    const db = admin()
    const like = `%${q}%`
    const digits = q.replace(/\D/g, '')

    // Pull a working set with the cheap column filters, then refine item-name
    // matches in JS (line_items is JSON, awkward to filter server-side).
    const results = new Map<string, any>()

    const add = (rows: any[] | null) => {
      for (const o of rows || []) results.set(String(o.woo_order_id || o.id), o)
    }

    // Order number — woo_order_id is an integer, so match it exactly when the
    // query is (or contains) a number. The previous `woo_order_id::text.ilike`
    // cast doesn't work through PostgREST, so number search silently found
    // nothing.
    if (digits.length >= 1) {
      const asNum = parseInt(digits, 10)
      if (Number.isFinite(asNum)) {
        const { data } = await db.from('woocommerce_orders')
          .select('*').eq('company_id', companyId).eq('woo_order_id', asNum).limit(10)
        add(data)
      }
    }

    // Email — indexed text column.
    {
      const { data } = await db.from('woocommerce_orders')
        .select('*').eq('company_id', companyId)
        .ilike('customer_email', like)
        .order('order_date', { ascending: false }).limit(25)
      add(data)
    }

    // Phone — normalised suffix match against billing (column may not exist on
    // older schemas, so ignore its errors).
    if (digits.length >= 4) {
      try {
        const { data, error } = await db.from('woocommerce_orders')
          .select('*').eq('company_id', companyId)
          .ilike('billing_phone_norm', `%${digits.slice(-9)}%`)
          .order('order_date', { ascending: false }).limit(25)
        if (!error) add(data)
      } catch { /* column not present */ }
    }

    // Customer name / item name — scan a recent window and match in JS.
    {
      const { data } = await db.from('woocommerce_orders')
        .select('*').eq('company_id', companyId)
        .order('order_date', { ascending: false }).limit(400)
      const ql = q.toLowerCase()
      for (const o of data || []) {
        const b = o.billing || {}
        const name = `${b.first_name || ''} ${b.last_name || ''}`.toLowerCase()
        const items = Array.isArray(o.line_items)
          ? o.line_items.map((li: any) => (li.name || '')).join(' ').toLowerCase() : ''
        if (name.includes(ql) || items.includes(ql)) {
          results.set(String(o.woo_order_id || o.id), o)
        }
      }
    }

    const orders = Array.from(results.values()).slice(0, 30).map((o: any) => {
      const b = o.billing || {}
      return {
        order_id: String(o.woo_order_id || o.id),
        order_number: String(o.woo_order_id || o.id),
        customer: `${b.first_name || ''} ${b.last_name || ''}`.trim() || o.customer_email || 'Customer',
        email: o.customer_email || b.email || null,
        phone: b.phone || null,
        total: Number(o.total) || 0,
        status: o.status,
        date: o.order_date,
        items: Array.isArray(o.line_items) ? o.line_items.map((li: any) => li.name).filter(Boolean).slice(0, 4) : [],
      }
    })

    return NextResponse.json({ orders })
  } catch (e: any) {
    return NextResponse.json({ error: e.message, orders: [] }, { status: 500 })
  }
}
