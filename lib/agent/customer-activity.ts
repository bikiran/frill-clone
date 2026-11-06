// What the customer has bought and paid lately, for the agents' context
// ("WHO YOU ARE TALKING TO"). Without it an agent told "I've paid" can only
// promise that the team will check — even with the in-store sale sitting in
// the chat. Read live each run, never copied into memory:
//   • in-store sales (Prexty, pushed through WooCommerce) and online orders
//     (WooCommerce, Shopify), with whether they're paid;
//   • payment links and saved-card charges in the customer's chats;
//   • sales the team recorded in a chat (bank transfer, cash…);
//   • a delivery that's booked.
// The formatting is pure (tested in scripts/agent-activity.test.mjs).

export type ActivityKind = 'instore' | 'order' | 'payment' | 'sale' | 'delivery'
export type ActivityItem = {
  kind: ActivityKind
  /** When it happened (ISO). */
  at: string
  /** One line, ready for the prompt. */
  text: string
  /** Money received for it: true, false (not yet / failed / refunded) or null (not money). */
  paid: boolean | null
  amount?: number | null
  /** Receipt, order or payment reference, for matching. */
  ref?: string | null
}

const money = (n: any, currency?: string | null) => {
  const v = Number(n)
  if (!Number.isFinite(v)) return ''
  const cur = String(currency || 'AUD').toUpperCase()
  return `${cur === 'AUD' || cur === 'USD' || cur === 'NZD' ? '$' : `${cur} `}${v.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/** A WooCommerce order row (woocommerce_orders), in-store or online. */
export function wooItem(o: any): ActivityItem | null {
  if (!o) return null
  const status = String(o.status || '').toLowerCase()
  const isPos = o.pos_source === 'prexty' || !!o.pos_sale_id
  const total = o.total != null ? Number(o.total) : null
  const paidStates = ['completed', 'processing']
  const paid = paidStates.includes(status) ? true : ['pending', 'on-hold', 'failed', 'cancelled', 'refunded', 'checkout-draft'].includes(status) ? false : null
  const state = isPos
    ? (status === 'refunded' ? 'refunded' : status === 'cancelled' || status === 'failed' ? 'cancelled' : 'paid in store')
    : ({ completed: 'paid, completed', processing: 'paid, being prepared', 'on-hold': 'on hold (payment not confirmed yet)', pending: 'waiting for payment', refunded: 'refunded', cancelled: 'cancelled', failed: 'payment failed' } as Record<string, string>)[status] || (status || 'status unknown')
  const num = o.woo_order_id != null ? `order #${o.woo_order_id}` : ''
  const shop = String(o.pos_outlet || o.shop || '').trim()
  const items = Array.isArray(o.line_items) ? o.line_items.slice(0, 3).map((i: any) => `${i.quantity || 1}× ${String(i.name || '').slice(0, 60)}`).filter((s: string) => s.length > 3) : []
  const text = isPos
    ? `In-store sale${o.pos_sale_id ? ` — receipt ${o.pos_sale_id}` : ''}${shop ? ` at ${shop}` : ''}${num ? `, ${num}` : ''}, ${money(total, o.currency)} — ${state}`
    : `Online order${num ? ` ${num.replace('order ', '')}` : ''}, ${money(total, o.currency)} — ${state}`
  return {
    kind: isPos ? 'instore' : 'order', at: o.order_date || o.created_at || '', paid: isPos ? (status === 'refunded' || status === 'cancelled' || status === 'failed' ? false : true) : paid,
    amount: total, ref: o.pos_sale_id || (o.woo_order_id != null ? String(o.woo_order_id) : null),
    text: items.length ? `${text} (${items.join(', ')})` : text,
  }
}

/** A Shopify (or other) order from the operational orders table. */
export function orderItem(o: any): ActivityItem | null {
  if (!o) return null
  const pay = String(o.payment_status || '').toLowerCase()
  const paid = ['paid', 'captured', 'succeeded'].includes(pay) ? true : pay ? false : null
  return {
    kind: 'order', at: o.order_date || o.created_at || '', paid, amount: o.total != null ? Number(o.total) : null, ref: o.order_number ? String(o.order_number) : null,
    text: `Online order${o.order_number ? ` #${o.order_number}` : ''}, ${money(o.total, o.currency)} — ${[o.status, pay ? `payment ${pay}` : ''].filter(Boolean).join(', ') || 'status unknown'}`,
  }
}

/** A payment link or card charge in one of the customer's chats (chat_payments). */
export function paymentItem(p: any): ActivityItem | null {
  if (!p) return null
  const status = String(p.status || '').toLowerCase()
  const amount = (Number(p.amount_cents) || 0) / 100
  const how = p.payment_method === 'saved_card' ? 'Saved-card charge' : 'Payment link'
  const what = p.description ? ` for “${String(p.description).slice(0, 80)}”` : ''
  const state = status === 'paid' ? `paid${p.card_last4 ? ` (card ending ${p.card_last4})` : ''}` : status === 'refunded' ? 'refunded' : status === 'pending' ? 'sent, not paid yet' : status || 'unknown'
  return {
    kind: 'payment', at: (status === 'paid' && p.paid_at) || p.created_at || '', paid: status === 'paid', amount, ref: p.id ? String(p.id).slice(0, 8) : null,
    text: `${how} ${money(amount, p.currency)}${what} — ${state}`,
  }
}

/** A sale the team recorded in a chat (conversation_sales). */
export function saleItem(s: any): ActivityItem | null {
  if (!s) return null
  const amount = Number(s.amount) || 0
  return {
    kind: 'sale', at: s.sale_at || s.created_at || '', paid: true, amount, ref: null,
    text: `Sale recorded by the team: ${money(amount, s.currency)}${s.payment_method ? ` (${s.payment_method})` : ''}${s.sold_by_name ? `, sold by ${s.sold_by_name}` : ''}${s.note ? ` — “${String(s.note).slice(0, 80)}”` : ''}`,
  }
}

/** A delivery booked on the contact (contacts.scheduled_delivery / delivery_status). */
export function deliveryItem(c: any, tz: string): ActivityItem | null {
  const when = c?.scheduled_delivery
  if (!when && !c?.delivery_status) return null
  const status = String(c?.delivery_status || '').replace(/_/g, ' ')
  let day = ''
  if (when) { try { day = new Intl.DateTimeFormat('en-AU', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(when)) } catch {} }
  return { kind: 'delivery', at: when || '', paid: null, text: `Delivery${day ? ` booked for ${day}` : ''}${status ? ` — ${status}` : ''}` }
}

const ago = (ms: number) => {
  const m = Math.round(ms / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 36) return `${h} h ago`
  return `${Math.round(h / 24)} days ago`
}

/**
 * The lines for the prompt, newest first, each with when it happened in the
 * business's time ("Thu 6 Nov, 10:52am — 8 min ago"). A delivery in the
 * future reads as upcoming. `max` keeps the prompt small.
 */
export function formatActivity(items: (ActivityItem | null)[], tz: string, now = Date.now(), max = 8): string[] {
  const list = items.filter((x): x is ActivityItem => !!x && !!x.text)
    .sort((a, b) => (Date.parse(b.at) || 0) - (Date.parse(a.at) || 0))
    .slice(0, max)
  return list.map(i => {
    const t = Date.parse(i.at)
    if (!Number.isFinite(t)) return `- ${i.text}`
    let when = ''
    try { when = new Intl.DateTimeFormat('en-AU', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(t)).replace(/\s(am|pm)$/i, (s: string) => s.trim().toLowerCase()) } catch {}
    const rel = t > now ? 'upcoming' : ago(now - t)
    return `- ${when ? `${when} (${rel})` : rel}: ${i.text}`
  })
}

const digits9 = (s: any) => String(s || '').replace(/\D/g, '').slice(-9)

/** Read it all for one customer. Each source is optional: a missing table or column just leaves it out. */
export async function loadCustomerActivity(db: any, companyId: string, opts: { contactId: string | null; email?: string | null; phone?: string | null; timezone: string; days?: number }): Promise<{ lines: string[]; items: ActivityItem[] }> {
  const since = new Date(Date.now() - (opts.days || 120) * 86_400_000).toISOString()
  const email = String(opts.email || '').trim().toLowerCase()
  const tail = digits9(opts.phone)
  const items: (ActivityItem | null)[] = []
  const safe = async (fn: () => Promise<void>) => { try { await fn() } catch { /* source not available */ } }

  await Promise.all([
    // WooCommerce: in-store (Prexty) and online, by email then phone.
    safe(async () => {
      const seen = new Set<string>()
      const add = (rows: any[]) => { for (const r of rows || []) { const k = String(r.woo_order_id ?? r.id); if (seen.has(k)) continue; seen.add(k); items.push(wooItem(r)) } }
      if (email) {
        const { data } = await db.from('woocommerce_orders').select('*').eq('company_id', companyId).ilike('customer_email', email).gte('order_date', since).order('order_date', { ascending: false }).limit(6)
        add(data || [])
      }
      if (tail.length >= 8) {
        const { data } = await db.from('woocommerce_orders').select('*').eq('company_id', companyId).eq('billing_phone_norm', tail).gte('order_date', since).order('order_date', { ascending: false }).limit(6)
        add(data || [])
      }
    }),
    // Shopify orders (the operational table).
    safe(async () => {
      if (!email && tail.length < 8) return
      let q = db.from('orders').select('order_number, status, payment_status, total, currency, order_date, created_at').eq('company_id', companyId).eq('sales_channel', 'shopify').gte('created_at', since)
      q = email ? q.eq('customer_email', email) : q.eq('customer_phone_norm', tail)
      const { data } = await q.order('created_at', { ascending: false }).limit(5)
      for (const o of data || []) items.push(orderItem(o))
    }),
    // Payments and recorded sales in the customer's chats.
    safe(async () => {
      if (!opts.contactId) return
      const { data: convs } = await db.from('conversations').select('id').eq('company_id', companyId).eq('contact_id', opts.contactId).limit(40)
      const ids = (convs || []).map((c: any) => c.id)
      if (!ids.length) return
      await Promise.all([
        safe(async () => {
          const { data } = await db.from('chat_payments').select('id, amount_cents, currency, status, description, payment_method, card_last4, paid_at, created_at')
            .in('conversation_id', ids).in('status', ['paid', 'pending', 'refunded']).gte('created_at', since).order('created_at', { ascending: false }).limit(6)
          for (const p of data || []) items.push(paymentItem(p))
        }),
        safe(async () => {
          const { data } = await db.from('conversation_sales').select('amount, currency, payment_method, sold_by_name, note, sale_at, created_at')
            .eq('company_id', companyId).in('conversation_id', ids).gte('created_at', since).order('created_at', { ascending: false }).limit(6)
          for (const s of data || []) items.push(saleItem(s))
        }),
      ])
    }),
    // A booked delivery.
    safe(async () => {
      if (!opts.contactId) return
      const { data } = await db.from('contacts').select('scheduled_delivery, delivery_status').eq('company_id', companyId).eq('id', opts.contactId).maybeSingle()
      if (data) items.push(deliveryItem(data, opts.timezone))
    }),
  ])
  const clean = items.filter((x): x is ActivityItem => !!x)
  return { lines: formatActivity(clean, opts.timezone), items: clean }
}
