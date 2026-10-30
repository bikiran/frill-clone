import { requireCompanyAccess } from '@/lib/company-access'
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
 * name. Used by the "Link to order" picker on tasks. Reads the local tables so
 * it's fast and works offline of the store:
 *   - woocommerce_orders: online orders, plus the in-store Prexty POS sales
 *     Prexty pushes into WooCommerce (found by their sale number too, e.g. R49966);
 *   - orders (sales_channel 'shopify'): Shopify orders.
 * Each result says where it came from (`source`: woocommerce | prexty | shopify);
 * a Shopify order's id is "shopify-<id>" and a Prexty sale's "prexty-<id>".
 */
export async function GET(req: NextRequest) {
  try {
    const companyId = req.nextUrl.searchParams.get('companyId')
    const q = (req.nextUrl.searchParams.get('q') || '').trim()
    if (!companyId || q.length < 2) return NextResponse.json({ orders: [] })

    const db = admin()
    // Workspace members only (customer details, orders and refunds).
    if (!(await requireCompanyAccess(req, db, companyId)).ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
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

    // Prexty sale number (R49966, or just its digits). The V407 column may not
    // be there on older schemas, so ignore its errors.
    if (/\d{2,}/.test(q)) {
      try {
        const { data, error } = await db.from('woocommerce_orders')
          .select('*').eq('company_id', companyId)
          .ilike('pos_sale_id', `%${q.replace(/[%,()]/g, '')}%`)
          .order('order_date', { ascending: false }).limit(15)
        if (!error) add(data)
      } catch { /* column not present */ }
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

    const orders: any[] = Array.from(results.values()).map((o: any) => {
      const b = o.billing || {}
      const id = String(o.woo_order_id || o.id)
      const prexty = o.pos_source === 'prexty'
      return {
        order_id: prexty ? `prexty-${id}` : id,
        order_number: prexty && o.pos_sale_id ? String(o.pos_sale_id) : id,
        source: prexty ? 'prexty' : 'woocommerce',
        store_number: prexty ? id : null,
        outlet: prexty ? (o.pos_outlet || null) : null,
        customer: `${b.first_name || ''} ${b.last_name || ''}`.trim() || o.customer_email || 'Customer',
        email: o.customer_email || b.email || null,
        phone: b.phone || null,
        total: Number(o.total) || 0,
        status: o.status,
        date: o.order_date,
        items: Array.isArray(o.line_items) ? o.line_items.map((li: any) => li.name).filter(Boolean).slice(0, 4) : [],
      }
    })

    // Shopify orders live in the operational orders table. Each lookup is
    // allowed to fail on its own (no Shopify store, older schema).
    try {
      const shop = new Map<string, any>()
      const addShop = (rows: any[] | null) => { for (const o of rows || []) if (o?.id) shop.set(o.id, o) }
      const base = () => db.from('orders').select('id, external_order_id, order_number, customer_name, customer_email, customer_phone, total, payment_status, status, order_date')
        .eq('company_id', companyId).eq('sales_channel', 'shopify')
      const safe = async (run: () => any) => { try { const { data, error } = await run(); if (!error) addShop(data) } catch { /* skip */ } }
      const term = q.replace(/[%,()]/g, ' ').trim()
      await Promise.all([
        digits.length >= 1 ? safe(() => base().ilike('order_number', `%${digits}%`).order('order_date', { ascending: false }).limit(10)) : null,
        safe(() => base().or(`customer_name.ilike.%${term}%,customer_email.ilike.%${term}%`).order('order_date', { ascending: false }).limit(20)),
        digits.length >= 4 ? safe(() => base().ilike('customer_phone_norm', `%${digits.slice(-9)}%`).order('order_date', { ascending: false }).limit(15)) : null,
        // An item name: the matching lines first, then their orders.
        (async () => {
          try {
            const { data: lines } = await db.from('order_items').select('order_id').eq('company_id', companyId).ilike('product_name', like).limit(60)
            const ids = [...new Set((lines || []).map((l: any) => l.order_id).filter(Boolean))].slice(0, 40)
            if (ids.length) await safe(() => base().in('id', ids).limit(20))
          } catch { /* skip */ }
        })(),
      ])
      if (shop.size) {
        const ids = [...shop.keys()]
        const names = new Map<string, string[]>()
        try {
          const { data: lines } = await db.from('order_items').select('order_id, product_name').in('order_id', ids).limit(400)
          for (const l of lines || []) { const a = names.get(l.order_id) || []; if (l.product_name && a.length < 4) a.push(l.product_name); names.set(l.order_id, a) }
        } catch { /* items are optional */ }
        for (const o of shop.values()) {
          orders.push({
            order_id: `shopify-${o.external_order_id || o.id}`,
            order_number: String(o.order_number || o.external_order_id || ''),
            source: 'shopify',
            customer: o.customer_name || o.customer_email || 'Customer',
            email: o.customer_email || null,
            phone: o.customer_phone || null,
            total: Number(o.total) || 0,
            status: o.payment_status || o.status || null,
            date: o.order_date,
            items: names.get(o.id) || [],
          })
        }
      }
    } catch { /* no Shopify orders */ }

    // An exact order or sale number first, then newest first.
    const exact = (o: any) => (o.order_number && (o.order_number.toLowerCase() === q.toLowerCase() || (digits && o.order_number.replace(/\D/g, '') === digits)) ? 0 : 1)
    orders.sort((a, b) => exact(a) - exact(b) || String(b.date || '').localeCompare(String(a.date || '')))

    return NextResponse.json({ orders: orders.slice(0, 30) })
  } catch (e: any) {
    return NextResponse.json({ error: e.message, orders: [] }, { status: 500 })
  }
}
