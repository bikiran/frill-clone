import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { notifyCompany, pushInboundMessage } from '@/lib/notify'
import { logWebhookEvent } from '@/lib/webhook-log'
import { normalizePrextyCustomer } from '@/lib/prexty-service'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// Inbound Prexty POS order webhook → Colvy conversation, mirroring the
// WooCommerce order pipeline. Prexty POSTs each order (created / status change)
// to the per-company callback URL:
//   https://<host>/api/webhooks/prexty?t=<webhook_token>
// Auth: the `t` token maps to a company; as a fallback the X-Prexty API key
// (the same key used to call Prexty) is accepted. Payloads are read tolerantly
// because Prexty's exact webhook shape isn't fixed yet — every field Colvy needs
// (order id/number, status, total, outlet, customer email/phone) is picked from
// the common carriers.

function pick(obj: any, ...keys: string[]) {
  for (const k of keys) {
    const v = k.split('.').reduce((o: any, p) => (o == null ? o : o[p]), obj)
    if (v != null && v !== '') return v
  }
  return null
}
const digits = (s: any) => String(s || '').replace(/\D/g, '')
const money = (n: any) => `$${(Number(n) || 0).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

async function resolveCompany(db: any, req: NextRequest): Promise<{ companyId: string; base: string } | null> {
  const token = new URL(req.url).searchParams.get('t') || req.headers.get('x-colvy-token') || ''
  if (token) {
    const { data } = await db.from('prexty_integrations')
      .select('company_id, is_active').eq('webhook_token', token).maybeSingle()
    if (data?.company_id && data.is_active !== false) return { companyId: data.company_id, base: 'token' }
  }
  // Fallback: match the X-Prexty key (or ?key=) against a stored api_key.
  const key = req.headers.get('x-prexty') || new URL(req.url).searchParams.get('key') || ''
  if (key) {
    const { data } = await db.from('prexty_integrations')
      .select('company_id, is_active').eq('api_key', key).maybeSingle()
    if (data?.company_id && data.is_active !== false) return { companyId: data.company_id, base: 'key' }
  }
  return null
}

// customer.created / customer.updated → find-or-create the Colvy contact.
// Existing contacts are enriched (gaps filled, Prexty id linked) but never
// clobbered; a brand-new Prexty customer becomes a new contact.
async function handleCustomerEvent(db: any, companyId: string, body: any) {
  const c = normalizePrextyCustomer(body?.customer || body?.data || body)
  const email = (c.email || '').toLowerCase() || null
  const phone = c.mobile || null
  const prextyId = c.id || null

  await logWebhookEvent({ source: 'prexty', eventType: 'customer', companyId, payload: { prextyId, email, phone } })

  if (!email && !phone) {
    return NextResponse.json({ ok: false, reason: 'Customer had no email or phone to match on' })
  }

  let contact: any = null
  if (email) {
    const { data } = await db.from('contacts').select('*').eq('company_id', companyId).ilike('email', email).limit(1)
    contact = data?.[0] || null
  }
  if (!contact && phone) {
    const d9 = digits(phone).slice(-9)
    if (d9) {
      const { data } = await db.from('contacts').select('*').eq('company_id', companyId).limit(1000)
      contact = (data || []).find((x: any) => x.phone && digits(x.phone).slice(-9) === d9) || null
    }
  }

  if (contact) {
    const upd: any = {}
    if (prextyId && !contact.prexty_customer_id) upd.prexty_customer_id = prextyId
    if (c.name && !contact.name) upd.name = c.name
    if (email && !contact.email) upd.email = email
    if (phone && !contact.phone) upd.phone = phone
    if (c.city && !contact.suburb) upd.suburb = c.city
    if (c.state && !contact.state) upd.state = c.state
    if (c.postcode && !contact.postcode) upd.postcode = c.postcode
    if (Object.keys(upd).length) await db.from('contacts').update(upd).eq('id', contact.id)
    return NextResponse.json({ ok: true, contactId: contact.id, created: false, updated: Object.keys(upd) })
  }

  const { data: created } = await db.from('contacts').insert({
    company_id: companyId,
    name: c.name || email || phone || 'Prexty customer',
    email, phone,
    prexty_customer_id: prextyId,
    suburb: c.city || null,
    state: c.state || null,
    postcode: c.postcode || null,
    source: 'prexty',
  }).select('id').maybeSingle()
  return NextResponse.json({ ok: true, contactId: created?.id || null, created: true })
}

export async function POST(req: NextRequest) {
  try {
    const db = admin()
    const raw = await req.text()
    let body: any = {}
    try { body = raw ? JSON.parse(raw) : {} } catch { body = {} }

    // Connection test / ping — answer 200 without needing an order.
    const evt = String(pick(body, 'event', 'event_type', 'type', 'action') || '').toLowerCase()
    if (body?.ping || body?.test || evt === 'ping' || evt === 'test' || evt.includes('verify')) {
      return NextResponse.json({ ok: true, pong: true })
    }

    const who = await resolveCompany(db, req)
    if (!who) return NextResponse.json({ ok: false, reason: 'Unrecognised Prexty webhook token/key' }, { status: 401 })
    const companyId = who.companyId

    // Customer created/updated in Prexty → upsert a Colvy contact (no order).
    if (evt.includes('customer') && !evt.includes('order')) {
      return await handleCustomerEvent(db, companyId, body)
    }

    // ── Parse the order (tolerant) ───────────────────────────────────────────
    const orderId = pick(body, 'id', 'order_id', 'orderId', 'data.id', 'order.id', 'data.order_id', 'invoice_id')
    const orderNo = pick(body, 'order_number', 'number', 'invoice_no', 'reference', 'data.order_number', 'order.order_number') || orderId
    const status = String(pick(body, 'status', 'order_status', 'payment_status', 'state', 'data.status') || 'completed').toLowerCase()
    const total = pick(body, 'total', 'grand_total', 'amount', 'total_amount', 'payable', 'data.total', 'order.total')
    const currency = pick(body, 'currency', 'currency_code', 'data.currency')
    const outletId = pick(body, 'outlet_id', 'outletId', 'store_id', 'location_id', 'branch_id', 'data.outlet_id')
    const outletName = pick(body, 'outlet', 'outlet_name', 'store', 'store_name', 'location', 'location_name', 'branch', 'data.outlet_name')
    const createdAt = pick(body, 'created_at', 'date', 'order_date', 'placed_at', 'data.created_at')

    const cust = body?.customer || body?.buyer || body?.client || body
    const email = (pick(cust, 'email', 'emailAddress', 'customer_email') || pick(body, 'email', 'customer_email') || '').toString().toLowerCase() || null
    const phone = pick(cust, 'mobile', 'phone', 'phoneNumber', 'customer_phone') || pick(body, 'mobile', 'phone', 'customer_phone') || null
    const custName = pick(cust, 'name', 'fullName', 'customer_name')
      || [pick(cust, 'firstname', 'first_name'), pick(cust, 'lastname', 'last_name')].filter(Boolean).join(' ')
      || null
    const prextyCustomerId = pick(cust, 'id', 'customer_id') || pick(body, 'customer_id')

    const itemsRaw: any[] = body?.items || body?.line_items || body?.products || body?.cart || []
    const items = (Array.isArray(itemsRaw) ? itemsRaw : []).map((it: any) => ({
      name: pick(it, 'name', 'product_name', 'title') || 'Item',
      qty: Number(pick(it, 'qty', 'quantity', 'count')) || 1,
      price: Number(pick(it, 'price', 'unit_price', 'total', 'amount')) || 0,
    }))

    await logWebhookEvent({ source: 'prexty', eventType: evt || 'order', companyId, payload: { orderId, orderNo, status, total, outletId, email, phone } })

    if (!orderId && !email && !phone) {
      return NextResponse.json({ ok: false, reason: 'Order had no id or customer to attach to' })
    }

    // ── Find-or-create the contact (email, else phone) ───────────────────────
    let contact: any = null
    if (email) {
      const { data } = await db.from('contacts').select('*').eq('company_id', companyId).ilike('email', email).limit(1)
      contact = data?.[0] || null
    }
    if (!contact && phone) {
      const d9 = digits(phone).slice(-9)
      if (d9) {
        const { data } = await db.from('contacts').select('*').eq('company_id', companyId).limit(1000)
        contact = (data || []).find((c: any) => c.phone && digits(c.phone).slice(-9) === d9) || null
      }
    }
    if (!contact) {
      const { data: created } = await db.from('contacts').insert({
        company_id: companyId, name: custName || email || phone || 'Prexty customer',
        email: email || null, phone: phone || null,
        prexty_customer_id: prextyCustomerId ? Number(prextyCustomerId) || null : null,
      }).select().maybeSingle()
      contact = created
    } else if (prextyCustomerId && !contact.prexty_customer_id) {
      db.from('contacts').update({ prexty_customer_id: Number(prextyCustomerId) || null }).eq('id', contact.id).then(() => {}, () => {})
    }

    // ── Compose the order line ───────────────────────────────────────────────
    const outletLabel = outletName || (outletId != null ? `Outlet ${outletId}` : null)
    const totalStr = total != null ? `${money(total)}${currency ? ` ${currency}` : ''}` : null
    const content = [
      `🧾 POS order #${orderNo} — ${status}`,
      totalStr ? `· ${totalStr}` : '',
      outletLabel ? `at ${outletLabel}` : '',
    ].filter(Boolean).join(' ')
    const itemLine = items.length ? items.map(i => `${i.qty}× ${i.name}`).join(', ') : null

    // ── Thread into the contact's most recent conversation, else create one ──
    let conv: any = null
    if (contact?.id) {
      const { data: recent } = await db.from('conversations').select('*')
        .eq('company_id', companyId).eq('contact_id', contact.id)
        .order('last_message_at', { ascending: false }).limit(1)
      conv = recent?.[0] || null
    }
    if (!conv) {
      const { data: newConv } = await db.from('conversations').insert({
        company_id: companyId, channel: 'prexty',
        subject: custName || 'Prexty POS order',
        contact_id: contact?.id || null, status: 'open',
        is_unread: true, unread_count: 1,
        last_message: content.slice(0, 200), last_message_at: new Date().toISOString(),
      }).select().maybeSingle()
      conv = newConv
    }
    if (!conv) return NextResponse.json({ ok: false, reason: 'Could not create conversation' })

    // ── Idempotency: one line per (order), updated in place on status change ─
    const { data: priorMsgs } = await db.from('messages')
      .select('id, metadata').eq('conversation_id', conv.id)
    const prior = (priorMsgs || []).find((m: any) => m.metadata?.prexty_order && String(m.metadata?.prexty_order_id) === String(orderId))

    const meta = { prexty_order: true, prexty_order_id: orderId, order_number: orderNo, status, outlet_id: outletId ?? null, outlet: outletLabel, items, created_at: createdAt || null }
    let isNew = false
    let changed = false
    if (prior) {
      if (prior.metadata?.status !== status) {
        changed = true
        await db.from('messages').update({ content: itemLine ? `${content}\n${itemLine}` : content, metadata: meta }).eq('id', prior.id)
      }
    } else {
      isNew = true
      await db.from('messages').insert({
        conversation_id: conv.id, company_id: companyId, sender_type: 'system',
        content: itemLine ? `${content}\n${itemLine}` : content,
        metadata: meta,
      })
    }

    if (isNew || changed) {
      await db.from('conversations').update({
        last_message: content.slice(0, 200), last_message_at: new Date().toISOString(),
        is_unread: true, status: 'open', unread_count: (conv.unread_count || 0) + 1,
      }).eq('id', conv.id)

      try {
        await notifyCompany({
          db, companyId, type: 'order',
          message: `Prexty POS order #${orderNo} from ${custName || email || phone || 'a customer'} — ${totalStr || status}`,
          actorName: custName || 'Prexty POS', conversationId: conv.id,
        })
      } catch {}
      try {
        await pushInboundMessage({
          companyId, conversationId: conv.id,
          title: `Prexty order #${orderNo}`,
          body: `${status}${totalStr ? ` · ${totalStr}` : ''}${outletLabel ? ` at ${outletLabel}` : ''}`,
        })
      } catch {}
    }

    db.from('prexty_integrations').update({ last_synced_at: new Date().toISOString() }).eq('company_id', companyId).then(() => {}, () => {})

    return NextResponse.json({ ok: true, conversationId: conv.id, order: orderNo, deduped: !isNew && !changed })
  } catch (e: any) {
    console.error('[prexty webhook]', e)
    await logWebhookEvent({ source: 'prexty', status: 'error', error: e?.message })
    return NextResponse.json({ ok: false, error: e.message })
  }
}

// Prexty (and manual testing) may verify the endpoint with a GET. When a token
// or key is supplied, report whether it actually maps to a connected company —
// so opening the webhook URL in a browser is a real auth check, not just a
// liveness ping. Only a boolean is revealed (never company data), and only to
// someone who already supplied a credential.
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const provided = url.searchParams.get('t') || url.searchParams.get('key')
    || req.headers.get('x-prexty') || req.headers.get('x-colvy-token')
  if (!provided) {
    return NextResponse.json({ ok: true, service: 'Colvy Prexty POS order webhook' })
  }
  try {
    const who = await resolveCompany(admin(), req)
    return NextResponse.json({
      ok: true,
      service: 'Colvy Prexty POS order webhook',
      authenticated: !!who,
      via: who?.base || null,          // 'token' or 'key' — how it matched
      message: who
        ? 'Token recognised — this URL is ready to receive Prexty orders.'
        : 'Token not recognised. Use the exact webhook URL from the Prexty integration page (the ?t= token), or send the X-Prexty key.',
    })
  } catch {
    return NextResponse.json({
      ok: true, service: 'Colvy Prexty POS order webhook',
      authenticated: false, message: 'Could not verify the token right now.',
    })
  }
}
