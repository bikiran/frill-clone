// Abandoned carts shared by every store: intake (the WooCommerce plugin's POST
// and Shopify checkouts) and recovery when the customer goes on to order.

import { notifyCompany } from '@/lib/notify'

// Normalize a variety of possible payload shapes (raw WooCommerce checkout, an
// abandonment plugin, or a custom snippet) into our columns.
export function normalizeCart(body: any) {
  const billing = body.billing || body.customer || {}
  const name = body.name || `${billing.first_name || ''} ${billing.last_name || ''}`.trim() || null
  const items = (body.items || body.line_items || body.cart || []).map((it: any) => ({
    product_id: it.product_id || it.id || null,
    variation_id: it.variation_id || null,
    name: it.name || it.product_name || 'Item',
    sku: it.sku || null,
    quantity: it.quantity || it.qty || 1,
    price: it.price || it.line_total || it.total || null,
    // Use an image if the payload already carries one (some bridges do); if not,
    // enrichItemImages() backfills it from the WooCommerce product catalog.
    image: it.image || it.image_url || it.thumbnail || it.img || null,
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

/**
 * Save a normalised cart: find-or-create the contact, save the cart (deduped on
 * external_id, or same contact + total within 6h), and for a NEW cart open a
 * conversation, post the cart summary and notify the team — so it shows as a
 * chat, not a silent record. `pageHistory` is what the shopper browsed first.
 */
export async function ingestAbandonedCart(db: any, companyId: string, norm: ReturnType<typeof normalizeCart>, pageHistory?: any[]) {
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
    // No external_id to key on — the bridge sometimes posts the same cart
    // twice (cart update, then checkout). Without a fallback every post
    // inserted a new row and posted the summary again, so the customer's
    // thread showed the identical cart message twice. Treat a cart for the
    // same contact with the same total in the last 6 hours as the same cart.
    let existingId: string | null = null
    try {
      const since = new Date(Date.now() - 6 * 3600 * 1000).toISOString()
      let q = db.from('abandoned_carts').select('id, total, created_at')
        .eq('company_id', companyId).eq('status', 'abandoned')
        .gte('created_at', since).order('created_at', { ascending: false }).limit(5)
      // abandoned_carts has no contact_id column — it's matched by email/phone.
      if (norm.email) q = q.eq('email', norm.email)
      else if (norm.phone) q = q.eq('phone', norm.phone)
      const { data: recent } = await q
      const match = (recent || []).find((c: any) =>
        Math.abs((Number(c.total) || 0) - (Number(norm.total) || 0)) < 0.01)
      existingId = match?.id || null
    } catch { /* fall through to insert */ }

    if (existingId) {
      const { data, error } = await db.from('abandoned_carts').update(row).eq('id', existingId).select().maybeSingle()
      saved = data; saveError = error?.message || null; isNew = false
    } else {
      const { data, error } = await db.from('abandoned_carts').insert(row).select().maybeSingle()
      saved = data; saveError = error?.message || null; isNew = true
    }
  }

  if (saveError || !saved) {
    // Record the failure reason on the most recent hit so ?diag=1 reveals it.
    try {
      const { data: lastHit } = await db.from('abandoned_cart_hits').select('id').eq('company_id', companyId).order('created_at', { ascending: false }).limit(1).maybeSingle()
      if (lastHit?.id) await db.from('abandoned_cart_hits').update({ save_error: saveError || 'insert returned no row' }).eq('id', lastHit.id)
    } catch {}
    return { ok: false, error: saveError || 'Cart could not be saved', id: null as string | null, isNew: false, conversationId }
  }

  // For a NEW cart: create a conversation if the contact has none, post a
  // system message with the cart summary, and notify — so it shows as a chat.
  if (isNew) {
    try {
      if (!conversationId && contact?.id) {
        // The pages they browsed before abandoning. These come from the
        // WooCommerce bridge — the chat widget never saw them, which is why
        // cart conversations used to show "no page history recorded".
        const browsed = Array.isArray(pageHistory) ? pageHistory : []
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

        // Belt and braces: even if two carts slip through as "new", don't post
        // the same summary into the thread twice.
        const since = new Date(Date.now() - 6 * 3600 * 1000).toISOString()
        const { data: dupe } = await db.from('messages')
          .select('id').eq('conversation_id', conversationId)
          .eq('content', summary).gte('created_at', since).limit(1)

        if (!dupe || dupe.length === 0) {
          await db.from('messages').insert({
            conversation_id: conversationId, company_id: companyId, sender_type: 'system',
            content: summary, metadata: { abandoned_cart: true, cart_id: saved.id },
          })
          await db.from('conversations').update({ last_message: `🛒 Abandoned cart — ${norm.currency || 'AUD'} $${norm.total || 0}`, last_message_at: new Date().toISOString(), is_unread: true }).eq('id', conversationId)
        }
      }
    } catch (e) { console.error('[abandoned-cart] conversation create failed', e) }

    try { await notifyCompany({ db, companyId, type: 'cart', message: `Abandoned cart from ${norm.name || norm.email || norm.phone || 'a customer'} — ${norm.currency || 'AUD'} $${(norm.total || 0)}`, actorName: norm.name || undefined, conversationId: conversationId || undefined }) } catch {}
  }

  return { ok: true, error: null as string | null, id: (saved?.id || null) as string | null, isNew, conversationId }
}

// ── Recover abandoned carts by email/phone ──────────────────────────────────
// Takes a WooCommerce-shaped order ({ id, number, status, total, billing:
// { email, phone } }); the Shopify path passes the same shape.
//
// The WordPress bridge only marks a cart recovered when the SAME browser
// session converts. Customers routinely abandon on mobile and buy on desktop,
// so we also match on contact details. This runs at the TOP LEVEL of the
// webhook (not buried inside the chat automation, whose early returns —
// missing conversation, etc. — used to silently skip it). It also counts
// 'pending' as a conversion: WooCommerce's order.created webhook fires with
// status=pending for most gateways, and if that's the only webhook configured,
// a successful order would otherwise never be matched.
export async function recoverAbandonedCarts(db: any, companyId: string, order: any) {
  try {
    const status = (order.status || '').toLowerCase()
    // A failed / cancelled / refunded order did NOT recover the cart.
    const converting = ['pending', 'processing', 'completed', 'on-hold'].includes(status)
    if (!converting) return

    const email = (order.billing?.email || '').trim()
    const phone = (order.billing?.phone || '').trim()
    if (!email && !phone) return

    const { data: openCarts } = await db.from('abandoned_carts')
      .select('id, email, phone, conversation_id')
      .eq('company_id', companyId)
      .eq('status', 'abandoned')

    const norm = (p: string) => (p || '').replace(/\D/g, '').slice(-8) // last 8 digits
    const wantEmail = email.toLowerCase()
    const wantPhone = norm(phone)

    const matches = (openCarts || []).filter((c: any) => {
      const cEmail = (c.email || '').trim().toLowerCase()
      const cPhone = norm(c.phone || '')
      if (wantEmail && cEmail && cEmail === wantEmail) return true
      if (wantPhone && cPhone && cPhone === wantPhone) return true
      return false
    })

    // Fallback: also recover any OPEN conversation for the same contact that is
    // still flagged as an abandoned cart. The cart-record match above can miss
    // (e.g. the cart stored a different/blank email than the billing email), yet
    // the customer clearly converted — so flip their conversation too.
    try {
      const digits = (s: string) => (s || '').replace(/\D/g, '').slice(-9)
      const { data: contacts } = await db.from('contacts')
        .select('id').eq('company_id', companyId)
        .or([
          wantEmail ? `email.ilike.${wantEmail}` : '',
          phone ? `phone.ilike.%${digits(phone)}%` : '',
        ].filter(Boolean).join(','))
      const contactIds = (contacts || []).map((c: any) => c.id)
      if (contactIds.length) {
        const { data: cartConvs } = await db.from('conversations')
          .select('id, subject, order_status, cart_status')
          .in('contact_id', contactIds)
          .ilike('subject', 'abandoned cart%')
        for (const cc of cartConvs || []) {
          if (cc.cart_status === 'recovered') continue
          if (!matches.find((m: any) => m.conversation_id === cc.id)) {
            matches.push({ id: null, conversation_id: cc.id, _viaContact: true })
          }
        }
      }
    } catch {}

    for (const m of matches) {
      if (m.id) {
        await db.from('abandoned_carts').update({
          status: 'recovered',
          recovered_order_id: String(order.id),
          updated_at: new Date().toISOString(),
        }).eq('id', m.id)
      }
      // Note the win in the cart's conversation thread, so the agent sees it.
      if (m.conversation_id) {
        try {
          await db.from('messages').insert({
            conversation_id: m.conversation_id, company_id: companyId, sender_type: 'system',
            content: `🛒→✅ Abandoned cart recovered — order #${order.number || order.id} placed ($${order.total})`,
            metadata: { cart_recovered: true, order_id: order.id },
          })
          // Stamp the CONVERSATION too — the abandoned-cart badge reads the
          // conversation's order_status / cart_status, not the cart record.
          // Without this the thread stayed "Abandoned Cart" forever even after
          // the sale (which is exactly what happened for this customer).
          await db.from('conversations').update({
            order_status: (order.status || 'processing'),
            cart_status: 'recovered',
            woo_order_id: String(order.id),
            last_message: `Order #${order.number || order.id} — ${order.status || 'processing'} · $${order.total}`,
            last_message_at: new Date().toISOString(),
          }).eq('id', m.conversation_id)
        } catch {}
      }
    }

    // Diagnostic breadcrumb: how many carts this order recovered (visible via ?diag=1).
    try {
      await db.from('abandoned_cart_hits').insert({
        company_id: companyId, had_email: !!email, had_phone: !!phone,
        item_count: matches.length,
        raw_keys: `CART_RECOVERY order=${order.id} status=${status} matched=${matches.length}`,
      })
    } catch {}
  } catch (e) { console.error('[cart recovery] match failed', e) }
}

