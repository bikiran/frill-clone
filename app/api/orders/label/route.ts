import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createLabel, type Address } from '@/lib/label'
import { getLabelUrl, voidLabel } from '@/lib/shipping'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

async function member(db: any, req: NextRequest, companyId: string): Promise<{ ok: boolean; uid: string | null }> {
  const token = (req.headers.get('authorization') || '').replace('Bearer ', '')
  if (!token) return { ok: false, uid: null }
  try {
    const { data } = await db.auth.getUser(token)
    const uid = data?.user?.id
    if (!uid) return { ok: false, uid: null }
    const { data: co } = await db.from('companies').select('owner_id').eq('id', companyId).maybeSingle()
    if (co?.owner_id === uid) return { ok: true, uid }
    const { data: tm } = await db.from('team_members').select('id').eq('company_id', companyId).eq('user_id', uid).maybeSingle()
    return { ok: !!tm?.id, uid }
  } catch { return { ok: false, uid: null } }
}

// PostgREST reports an unknown column — strip it and retry so a shipments schema
// that predates an optional column (e.g. parcel) still records the label.
const missingCol = (err: any): string | null => {
  const m = String(err?.message || '').match(/Could not find the '([\w]+)' column/)
  return m ? m[1] : null
}
async function insertResilient(db: any, table: string, row: any, select?: string): Promise<any> {
  let cur = { ...row }
  const maxTries = Object.keys(cur).length + 2
  for (let i = 0; i < maxTries; i++) {
    const q = db.from(table).insert(cur)
    const { data, error } = select ? await q.select(select).maybeSingle() : await q
    if (!error) return data ?? null
    const col = missingCol(error)
    if (!col) throw new Error(`${table} insert failed: ${error.message}`)
    delete cur[col]
  }
  throw new Error(`${table} insert failed: unresolved unknown columns`)
}

/**
 * POST /api/orders/label
 * Body: { companyId, orderId, carrier, service?, weightGrams?, parcel?, markShipped? }
 *
 * Creates a label for the order (live carrier API when configured, otherwise a
 * recorded shipment with a printable label), records the shipment + tracking,
 * and advances the order to Shipped. Returns the shipment + the order patch so
 * the board can update instantly.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const { companyId, orderId } = body
    if (!companyId || !orderId) return NextResponse.json({ error: 'companyId and orderId required' }, { status: 400 })
    const db = admin()
    const { ok, uid } = await member(db, req, companyId)
    if (!ok) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })

    const { data: order } = await db.from('orders').select('*').eq('id', orderId).eq('company_id', companyId).maybeSingle()
    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

    // ── Reprint / Void an existing label ──────────────────────────────────────
    if (body.action === 'reprint' || body.action === 'void') {
      const { data: ship } = await db.from('order_shipments')
        .select('*').eq('order_id', orderId).eq('company_id', companyId)
        .neq('status', 'voided').order('created_at', { ascending: false }).limit(1).maybeSingle()
      if (!ship) return NextResponse.json({ error: 'No label found for this order' }, { status: 404 })

      if (body.action === 'reprint') {
        // Prefer the stored PDF; fall back to fetching it from the provider.
        let url: string | null = ship.label_url || null
        if (!url && ship.provider_ref) { try { url = await getLabelUrl(ship.provider_ref) } catch {} }
        if (!url) return NextResponse.json({ error: 'No printable label on file — use the packing-slip label instead', printable: true }, { status: 200 })
        return NextResponse.json({ labelUrl: url })
      }

      // Void: cancel at the provider (best-effort), then revert the order.
      let voided = true, message = 'Label voided'
      if (ship.provider_ref) { const v = await voidLabel(ship.provider_ref); voided = v.voided; message = v.message }
      // Even if the carrier can't confirm the void, mark it locally so the order
      // can be re-labelled; surface the provider message to the operator.
      try { await db.from('order_shipments').update({ status: 'voided', updated_at: new Date().toISOString() }).eq('id', ship.id) } catch {}
      const patch: any = {
        status: 'awaiting_shipment', fulfilment_status: 'unfulfilled',
        tracking_number: null, tracking_url: null, shipped_at: null,
        updated_at: new Date().toISOString(),
      }
      try { await db.from('orders').update(patch).eq('id', orderId) } catch {}
      try {
        await db.from('order_events').insert({
          order_id: orderId, company_id: companyId, type: 'label_voided', actor_id: uid,
          detail: `Label voided · ${ship.carrier || ''} ${ship.tracking_number || ''}`.trim(),
        })
      } catch {}
      return NextResponse.json({ voided, message, patch })
    }

    // Sender = the chosen ship-from location, else the company's primary one.
    const { data: co } = await db.from('companies').select('name').eq('id', companyId).maybeSingle()
    let loc: any = null
    if (body.fromLocationId) {
      const r = await db.from('company_locations').select('*').eq('id', body.fromLocationId).eq('company_id', companyId).maybeSingle()
      loc = r.data
    }
    if (!loc) {
      const r = await db.from('company_locations').select('*').eq('company_id', companyId).order('is_primary', { ascending: false }).limit(1).maybeSingle()
      loc = r.data
    }
    const from: Address = {
      name: loc?.label || co?.name || 'Warehouse', company: co?.name || null,
      address_1: loc?.address_1 || loc?.street || null, address_2: loc?.address_2 || null,
      city: loc?.suburb || loc?.city || null, state: loc?.state || null,
      postcode: loc?.postcode || null, country: loc?.country || 'AU', phone: loc?.phone || null,
    }
    const a = order.shipping_address || {}
    const to: Address = {
      name: order.customer_name, address_1: a.address_1 || a.address1 || null, address_2: a.address_2 || a.address2 || null,
      city: a.city || null, state: a.state || null, postcode: a.postcode || a.postcode || null,
      country: a.country || 'AU', phone: order.customer_phone || a.phone || null, email: order.customer_email || null,
    }

    // Line items — passed to Starshipit so the consignment carries contents.
    let items: { description?: string | null; sku?: string | null; quantity?: number; value?: number }[] = []
    try {
      const { data: its } = await db.from('order_items').select('product_name, sku, quantity, total_price').eq('order_id', orderId)
      items = (its || []).map((it: any) => ({ description: it.product_name, sku: it.sku, quantity: Number(it.quantity) || 1, value: Number(it.total_price) || 0 }))
    } catch {}

    const label = await createLabel({
      carrier: body.carrier || 'custom',
      service: body.service || null,
      serviceCode: body.serviceCode || null,
      rateId: body.rateId || null,
      weightGrams: Number(body.weightGrams) || null,
      parcel: body.parcel || null,
      reference: order.order_number || null,
      from, to, items,
    })

    // Record the shipment (resilient to optional columns).
    const shipment = await insertResilient(db, 'order_shipments', {
      order_id: orderId, company_id: companyId,
      carrier: label.carrier, service: label.service,
      tracking_number: label.trackingNumber, tracking_url: label.trackingUrl,
      label_url: label.labelUrl, status: 'label_purchased',
      cost: label.cost ?? (body.cost != null ? Number(body.cost) : null), currency: label.currency,
      weight_grams: Number(body.weightGrams) || null,
      parcel: body.parcel || null,
      provider_ref: label.providerRef, created_by: uid,
    }, 'id')

    // First tracking event.
    try {
      await insertResilient(db, 'tracking_events', {
        shipment_id: shipment?.id, order_id: orderId, company_id: companyId,
        status: 'label_created', description: `Label created · ${label.carrierLabel}${label.service ? ` · ${label.service}` : ''}`,
        occurred_at: new Date().toISOString(),
      })
    } catch {}

    // Advance the order to Shipped (unless caller opts out).
    const markShipped = body.markShipped !== false
    const patch: any = {
      carrier: label.carrier, tracking_number: label.trackingNumber, tracking_url: label.trackingUrl,
      shipping_method: label.service || order.shipping_method,
      updated_at: new Date().toISOString(),
    }
    if (markShipped) { patch.status = 'shipped'; patch.fulfilment_status = 'fulfilled'; patch.shipped_at = new Date().toISOString() }
    try { await db.from('orders').update(patch).eq('id', orderId) } catch {}

    // Timeline event.
    try {
      await db.from('order_events').insert({
        order_id: orderId, company_id: companyId, type: 'label_created', actor_id: uid,
        detail: `Label created · ${label.carrierLabel}${label.service ? ` · ${label.service}` : ''} · ${label.trackingNumber}${label.live ? '' : ' (printable)'}`,
      })
    } catch {}

    return NextResponse.json({ shipment, label, patch, live: label.live })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 })
  }
}
