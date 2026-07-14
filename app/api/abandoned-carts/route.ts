import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { notifyCompany } from '@/lib/notify'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Normalize a variety of possible payload shapes (raw WooCommerce checkout, an
// abandonment plugin, or a custom snippet) into our columns.
function normalize(body: any) {
  const billing = body.billing || body.customer || {}
  const name = body.name || `${billing.first_name || ''} ${billing.last_name || ''}`.trim() || null
  const items = (body.items || body.line_items || body.cart || []).map((it: any) => ({
    product_id: it.product_id || it.id || null,
    variation_id: it.variation_id || null,
    name: it.name || it.product_name || 'Item',
    sku: it.sku || null,
    quantity: it.quantity || it.qty || 1,
    price: it.price || it.line_total || it.total || null,
  }))
  const address = {
    address_1: billing.address_1 || body.address || null,
    city: billing.city || null,
    state: billing.state || null,
    postcode: billing.postcode || null,
    country: billing.country || 'AU',
  }
  return {
    external_id: body.external_id || body.cart_id || body.session_id || null,
    name, email: body.email || billing.email || null, phone: body.phone || billing.phone || null,
    address,
    items,
    coupon: body.coupon || (Array.isArray(body.coupons) ? body.coupons[0] : null) || null,
    shipping: body.shipping_line || (body.shipping ? { method: body.shipping.method, label: body.shipping.label || body.shipping.method_title, cost: body.shipping.cost || body.shipping.total } : null),
    notes: body.notes || body.customer_note || null,
    subtotal: body.subtotal != null ? Number(body.subtotal) : null,
    total: body.total != null ? Number(body.total) : (items.reduce((s: number, it: any) => s + (parseFloat(it.price) || 0) * (it.quantity || 1), 0) || null),
    currency: body.currency || 'AUD',
    cart_url: body.cart_url || body.recovery_url || body.checkout_url || null,
  }
}

// POST: receive an abandoned cart from the store. Company id via header or ?company=.
export async function POST(req: NextRequest) {
  try {
    const companyId = req.headers.get('x-company-id') || req.nextUrl.searchParams.get('company')
    if (!companyId) return NextResponse.json({ error: 'Missing company id (x-company-id header or ?company=)' }, { status: 400 })
    const body = await req.json()
    const db = admin()

    // Diagnostic breadcrumb: record that a POST arrived (even if later rejected),
    // so ?diag=1 can confirm the WooCommerce bridge is actually reaching Colvy.
    try {
      await db.from('abandoned_cart_hits').insert({
        company_id: companyId,
        had_email: !!(body.email || body.billing?.email),
        had_phone: !!(body.phone || body.billing?.phone),
        item_count: Array.isArray(body.items || body.line_items || body.cart) ? (body.items || body.line_items || body.cart).length : 0,
        raw_keys: Object.keys(body || {}).join(','),
      })
    } catch {}

    // Recovery ping: the store tells us a previously-abandoned cart converted.
    if (req.nextUrl.searchParams.get('recovered') || body.status === 'recovered') {
      if (body.external_id) {
        await db.from('abandoned_carts')
          .update({ status: 'recovered', recovered_order_id: body.recovered_order_id || null, updated_at: new Date().toISOString() })
          .eq('company_id', companyId).eq('external_id', body.external_id)
      }
      return NextResponse.json({ ok: true, recovered: true })
    }

    const norm = normalize(body)
    if (!norm.email && !norm.phone) return NextResponse.json({ error: 'Cart needs at least an email or phone to be useful' }, { status: 400 })

    // Find-or-create the contact, then find-or-create a conversation, so the
    // abandoned cart appears as a chat in the inbox (not just a silent record).
    let conversationId: string | null = null
    let contact: any = null
    let contactIsNew = false
    try {
      if (norm.email) {
        const { data } = await db.from('contacts').select('id, name').eq('company_id', companyId).ilike('email', norm.email).limit(1)
        contact = data?.[0] || null
      }
      if (!contact && norm.phone) {
        const { data } = await db.from('contacts').select('id, name').eq('company_id', companyId).eq('phone', norm.phone).limit(1)
        contact = data?.[0] || null
      }
      if (!contact) {
        const { data: created } = await db.from('contacts').insert({
          company_id: companyId, name: norm.name || norm.email || norm.phone, email: norm.email || null, phone: norm.phone || null,
        }).select('id, name').maybeSingle()
        contact = created; contactIsNew = true
      }
      if (contact?.id) {
        const { data: conv } = await db.from('conversations').select('id').eq('company_id', companyId).eq('contact_id', contact.id).order('last_message_at', { ascending: false }).limit(1)
        conversationId = conv?.[0]?.id || null
      }
    } catch {}

    const row: any = { company_id: companyId, ...norm, status: 'abandoned', conversation_id: conversationId, updated_at: new Date().toISOString() }

    // Save the cart. The unique index on (company_id, external_id) is PARTIAL
    // (WHERE external_id IS NOT NULL), which Postgres ON CONFLICT can't target —
    // so we do an explicit find-then-update-or-insert instead of upsert. (The
    // previous upsert failed silently, leaving nothing saved.)
    let saved: any = null
    let isNew = false
    let saveError: string | null = null
    if (norm.external_id) {
      const { data: existing } = await db.from('abandoned_carts').select('id').eq('company_id', companyId).eq('external_id', norm.external_id).maybeSingle()
      if (existing?.id) {
        const { data, error } = await db.from('abandoned_carts').update(row).eq('id', existing.id).select().maybeSingle()
        saved = data; saveError = error?.message || null; isNew = false
      } else {
        const { data, error } = await db.from('abandoned_carts').insert(row).select().maybeSingle()
        saved = data; saveError = error?.message || null; isNew = true
      }
    } else {
      const { data, error } = await db.from('abandoned_carts').insert(row).select().maybeSingle()
      saved = data; saveError = error?.message || null; isNew = true
    }

    if (saveError || !saved) {
      // Record the failure reason on the most recent hit so ?diag=1 reveals it.
      try {
        const { data: lastHit } = await db.from('abandoned_cart_hits').select('id').eq('company_id', companyId).order('created_at', { ascending: false }).limit(1).maybeSingle()
        if (lastHit?.id) await db.from('abandoned_cart_hits').update({ save_error: saveError || 'insert returned no row' }).eq('id', lastHit.id)
      } catch {}
      return NextResponse.json({ ok: false, error: saveError || 'Cart could not be saved', norm }, { status: 500 })
    }

    // For a NEW cart: create a conversation if the contact has none, post a
    // system message with the cart summary, and notify — so it shows as a chat.
    if (isNew) {
      try {
        if (!conversationId && contact?.id) {
          // The pages they browsed before abandoning. These come from the
          // WooCommerce bridge — the chat widget never saw them, which is why
          // cart conversations used to show "no page history recorded".
          const browsed = Array.isArray(body.page_history) ? body.page_history : []
          const lastPage = browsed.length ? browsed[browsed.length - 1] : null

          const { data: newConv } = await db.from('conversations').insert({
            company_id: companyId, channel: 'chat', subject: 'Abandoned cart',
            contact_id: contact.id, status: 'open', is_unread: true, unread_count: 1,
            page_url: lastPage?.url || norm.cart_url || null,
            page_title: lastPage?.title || null,
            page_history: browsed,
            last_message: '', last_message_at: new Date().toISOString(),
          }).select('id').maybeSingle()
          conversationId = newConv?.id || null
          // Link the cart to the new conversation.
          if (conversationId) await db.from('abandoned_carts').update({ conversation_id: conversationId }).eq('id', saved.id)
        }
        if (conversationId) {
          const itemLines = (norm.items || []).map((it: any) => `• ${it.quantity || 1}× ${it.name || 'item'}`).join('\n')
          const summary = `🛒 Abandoned cart — ${norm.currency || 'AUD'} $${norm.total || 0}${itemLines ? `\n${itemLines}` : ''}${norm.cart_url ? `\n\nCart: ${norm.cart_url}` : ''}`
          await db.from('messages').insert({
            conversation_id: conversationId, company_id: companyId, sender_type: 'system',
            content: summary, metadata: { abandoned_cart: true, cart_id: saved.id },
          })
          await db.from('conversations').update({ last_message: `🛒 Abandoned cart — ${norm.currency || 'AUD'} $${norm.total || 0}`, last_message_at: new Date().toISOString(), is_unread: true }).eq('id', conversationId)
        }
      } catch (e) { console.error('[abandoned-cart] conversation create failed', e) }

      try { await notifyCompany({ db, companyId, type: 'cart', message: `Abandoned cart from ${norm.name || norm.email || norm.phone || 'a customer'} — ${norm.currency || 'AUD'} $${(norm.total || 0)}`, actorName: norm.name || undefined, conversationId: conversationId || undefined }) } catch {}
    }

    return NextResponse.json({ ok: true, id: saved?.id })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
// GET: list abandoned carts for a company, or fetch by email/phone (for the chat).
export async function GET(req: NextRequest) {
  try {
    const companyId = req.nextUrl.searchParams.get('companyId')
    const email = req.nextUrl.searchParams.get('email')
    const phone = req.nextUrl.searchParams.get('phone')
    if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })
    const db = admin()

    // Diagnostic: ?diag=1 returns recent carts + counts so you can verify the
    // bridge is delivering, without needing a matching contact.
    if (req.nextUrl.searchParams.get('diag')) {
      const { data: recent } = await db.from('abandoned_carts').select('id, email, phone, total, status, created_at').eq('company_id', companyId).order('created_at', { ascending: false }).limit(10)
      let hits: any[] = []
      try {
        const { data: h } = await db.from('abandoned_cart_hits').select('had_email, had_phone, item_count, raw_keys, save_error, created_at').eq('company_id', companyId).order('created_at', { ascending: false }).limit(10)
        hits = h || []
      } catch {}
      const lastError = hits.find(h => h.save_error)?.save_error || null
      let hint: string
      if (hits.length === 0) hint = 'No POST has reached Colvy at all — the WordPress bridge is not firing (wrong hook, plugin not active, or blocked outbound request).'
      else if ((recent?.length || 0) > 0) hint = 'Carts are being saved successfully.'
      else if (lastError) hint = `Posts ARE arriving but the database rejected the save: "${lastError}". This usually means the abandoned_carts table/columns are missing — run the COLVY_V136_ABANDONED_CARTS.sql migration.`
      else hint = 'Posts are arriving but nothing saved, and no error was captured. Likely the abandoned_carts table is missing — run COLVY_V136_ABANDONED_CARTS.sql.'
      return NextResponse.json({
        diag: true,
        saved_carts: recent?.length || 0,
        recent: recent || [],
        inbound_posts_received: hits.length,
        last_save_error: lastError,
        last_posts: hits,
        hint,
      })
    }

    let q = db.from('abandoned_carts').select('*').eq('company_id', companyId).eq('status', 'abandoned').order('created_at', { ascending: false })
    if (email) {
      q = q.ilike('email', email)
      const { data } = await q.limit(5)
      return NextResponse.json({ carts: data || [] })
    } else if (phone) {
      // Match on the last 8-9 digits so +61 435 844 469 == 0435 844 469.
      const tail = phone.replace(/\D/g, '').slice(-8)
      const { data: all } = await q.limit(100)
      const carts = (all || []).filter((c: any) => (c.phone || '').replace(/\D/g, '').slice(-8) === tail)
      return NextResponse.json({ carts })
    }
    const { data } = await q.limit(100)
    return NextResponse.json({ carts: data || [] })
  } catch (err: any) {
    return NextResponse.json({ error: err.message, carts: [] }, { status: 500 })
  }
}
