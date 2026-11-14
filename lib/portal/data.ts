// What a signed-in customer sees on their account page, and the few things
// they can do there. Every read is through their contact id (or the email and
// mobile on that contact, for shop orders), at this business only. No postal
// addresses or card details are shown. A source that's missing (a table or
// column a business doesn't have) just leaves that part empty.

import { phoneKey, ilikeExact } from '@/lib/phone'
import { manageUrl, phoneVariants, stripeReady, amountDue, createInvite, bookingPageUrl, reservePageUrl, companyBase } from '@/lib/booking'
import { quoteUrl, quoteDepositCheckout, loadCompany, companyTz, todayIn } from '@/lib/jobs/server'
import { restaurantEnabled } from '@/lib/modules'
import { JOB_STATUS_LABEL, QUOTE_STATUS_LABEL, fmtJobNumber } from '@/lib/jobs/status'
import { resolveJobSettings } from '@/lib/jobs/settings'
import { preferenceState, applyPreferences } from '@/lib/email-preferences'
import { maskEmail, maskPhone, type PortalCompany } from '@/lib/portal/auth'
import type { PortalMe, PortalComing, PortalAgain, PortalPayment, PortalQuote, PortalInvoice, PortalJob, PortalOrder, PortalMessage } from '@/lib/portal/types'

const safe = async <T>(fn: () => Promise<T>, fallback: T): Promise<T> => { try { return await fn() } catch { return fallback } }
const DAY = 86_400_000
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const strip = (s: any) => String(s || '').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;|&rsquo;/g, '’').replace(/&quot;/g, '"').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()

export async function loadContact(db: any, companyId: string, contactId: string) {
  const { data } = await db.from('contacts').select('*').eq('id', contactId).eq('company_id', companyId).maybeSingle()
  return data || null
}

async function conversationsOf(db: any, companyId: string, contactId: string): Promise<{ id: string; channel: string; last_message_at: string | null }[]> {
  const { data } = await db.from('conversations').select('id, channel, last_message_at, status').eq('company_id', companyId).eq('contact_id', contactId)
    .order('last_message_at', { ascending: false, nullsFirst: false }).limit(40)
  return (data || []).filter((c: any) => c.status !== 'spam')
}

// ── Coming up ─────────────────────────────────────────────────────────────
async function comingUp(db: any, pc: PortalCompany, contact: any): Promise<PortalComing[]> {
  const out: PortalComing[] = []
  const contactId = contact.id
  const nowIso = new Date(Date.now() - 2 * 3600e3).toISOString()
  await Promise.all([
    safe(async () => {
      const cols = 'id, service_id, service_name, starts_at, ends_at, status, seats, manage_token, hold_expires_at, location_label, payment_status, amount_due_cents, seated_at, completed_at, chat_payment_id, contact_id, customer_email, customer_phone'
      const reads: PromiseLike<any>[] = [db.from('bookings').select(cols)
        .eq('company_id', pc.company.id).eq('contact_id', contactId).in('status', ['confirmed', 'pending']).gte('ends_at', nowIso).order('starts_at').limit(20)]
      // A booking held while its deposit is paid isn't linked to a customer
      // until it's confirmed, so live holds are also found by the email and
      // mobile on their record (exact matches only, as for shop orders).
      const email = String(contact.email || '').trim().toLowerCase()
      const key = phoneKey(contact.phone)
      const holds = () => db.from('bookings').select(cols).eq('company_id', pc.company.id).eq('status', 'pending').is('contact_id', null)
        .gt('hold_expires_at', new Date().toISOString()).order('starts_at').limit(5)
      if (email) reads.push(holds().ilike('customer_email', ilikeExact(email)))
      if (key.length >= 9) reads.push(holds().in('customer_phone', phoneVariants(contact.phone)))
      const found = new Map<string, any>()
      for (const r of await Promise.all(reads)) for (const b of r?.data || []) {
        if (b.contact_id ? b.contact_id === contactId : ((email && String(b.customer_email || '').trim().toLowerCase() === email) || (key.length >= 9 && phoneKey(b.customer_phone) === key))) found.set(b.id, b)
      }
      // Still to come: not already seated or finished (a visit in progress isn't "coming up").
      const rows = [...found.values()].filter((b: any) => !b.seated_at && !b.completed_at && (b.status === 'confirmed' || (b.hold_expires_at && Date.parse(b.hold_expires_at) > Date.now())))
      const svcIds = [...new Set(rows.map((b: any) => b.service_id).filter(Boolean))]
      const kinds = new Map<string, string>()
      if (svcIds.length) { const { data: s } = await db.from('booking_services').select('id, kind').in('id', svcIds); for (const x of s || []) kinds.set(x.id, x.kind) }
      // A deposit to pay on a held booking: its card payment page (while it's open).
      const owing = rows.filter((b: any) => b.status === 'pending' && b.payment_status === 'pending' && b.amount_due_cents && b.chat_payment_id)
      const payLinks = new Map<string, string>()
      if (owing.length) {
        const { data: ps } = await db.from('chat_payments').select('id, status, checkout_url').eq('company_id', pc.company.id).in('id', owing.map((b: any) => b.chat_payment_id))
        for (const x of ps || []) if (x.status === 'pending' && x.checkout_url) payLinks.set(x.id, x.checkout_url)
      }
      for (const b of rows) {
        const table = kinds.get(b.service_id) === 'reservation'
        const payUrl = (b.status === 'pending' && b.chat_payment_id && payLinks.get(b.chat_payment_id)) || null
        out.push({
          id: b.id, kind: table ? 'reservation' : 'booking', title: b.service_name || (table ? 'Table' : 'Booking'),
          startsAt: b.starts_at, endsAt: b.ends_at, party: table ? b.seats || null : null,
          // The business's own place only (never a customer's address).
          where: b.location_label || null,
          status: b.status, statusLabel: b.status === 'pending' ? (b.payment_status === 'pending' && b.amount_due_cents ? 'Deposit to pay' : 'Holding') : 'Booked',
          manageUrl: b.manage_token ? manageUrl(pc.company, b.manage_token) : null,
          ...(payUrl ? { payUrl, payCents: Number(b.amount_due_cents) || 0 } : {}),
        })
      }
    }, undefined),
    // Deliveries booked on the calendar for them.
    safe(async () => {
      const { data } = await db.from('calendar_events').select('id, starts_at, ends_at, status, time_window, title, is_all_day')
        .eq('company_id', pc.company.id).eq('contact_id', contactId).eq('event_type', 'delivery').neq('status', 'cancelled')
        .gte('starts_at', new Date(Date.now() - DAY).toISOString()).order('starts_at').limit(10)
      for (const e of data || []) {
        if (e.status === 'completed') continue
        out.push({
          id: e.id, kind: 'delivery', title: 'Delivery', startsAt: e.starts_at, endsAt: e.ends_at || null, allDay: !!e.is_all_day || !!e.time_window,
          where: e.time_window ? String(e.time_window).slice(0, 40) : null,
          status: e.status || 'scheduled', statusLabel: e.status === 'in_progress' ? 'On its way' : e.status === 'confirmed' ? 'Confirmed' : 'Booked',
        })
      }
    }, undefined),
  ])
  return out.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt)).slice(0, 20)
}

// ── Book again ────────────────────────────────────────────────────────────
// What they've booked before (visits that have finished, in the last 18
// months), newest first, one per service and up to three, while that service
// still takes bookings online.
async function bookAgain(db: any, pc: PortalCompany, contactId: string): Promise<PortalAgain[]> {
  const { data } = await db.from('bookings').select('id, service_id, service_name, starts_at, seats, status')
    .eq('company_id', pc.company.id).eq('contact_id', contactId).in('status', ['confirmed', 'completed'])
    .lt('ends_at', new Date().toISOString()).gte('starts_at', new Date(Date.now() - 548 * DAY).toISOString())
    .order('starts_at', { ascending: false }).limit(60)
  const seen = new Set<string>()
  const last = (data || []).filter((b: any) => b.service_id && !seen.has(b.service_id) && seen.add(b.service_id))
  if (!last.length) return []
  const svc = await bookableServices(db, pc, last.map((b: any) => b.service_id))
  return last.filter((b: any) => svc.has(b.service_id)).slice(0, 3).map((b: any) => {
    const s = svc.get(b.service_id)
    const table = s.kind === 'reservation'
    return { id: b.id, kind: table ? 'reservation' : 'booking', title: s.name || b.service_name || (table ? 'Table' : 'Booking'), lastAt: b.starts_at, party: table ? Number(b.seats) || null : null }
  })
}

/** Those of these services the booking (or table) page will still take online. */
async function bookableServices(db: any, pc: PortalCompany, ids: string[]): Promise<Map<string, any>> {
  const { data } = await db.from('booking_services').select('id, name, slug, kind, active, payment_mode, price_cents, deposit_cents').eq('company_id', pc.company.id).in('id', ids)
  // A paid service is hidden from the booking page until card payments are set up.
  const list = (data || []).filter((s: any) => s.active && (amountDue(s) === 0 || stripeReady(pc.company)))
  let tables = true
  if (list.some((s: any) => s.kind === 'reservation')) {
    const { data: co } = await db.from('companies').select('modules, industry').eq('id', pc.company.id).maybeSingle()
    tables = restaurantEnabled(co)
  }
  return new Map(list.filter((s: any) => tables || s.kind !== 'reservation').map((s: any) => [s.id, s]))
}

/**
 * Book again: a personal link to the booking page for that service (or the
 * table page, for the same party size) with their details filled in. The
 * link's invite also ties the new booking to them.
 */
export async function bookAgainLink(db: any, pc: PortalCompany, contactId: string, bookingId: string): Promise<{ url: string } | { error: string; status: number }> {
  const gone = { error: 'That can’t be booked online any more. Send us a message and we’ll sort it out.', status: 410 }
  if (!UUID.test(bookingId)) return { error: 'Booking not found.', status: 404 }
  const { data: b } = await db.from('bookings').select('id, service_id, seats').eq('id', bookingId).eq('company_id', pc.company.id).eq('contact_id', contactId).maybeSingle()
  if (!b) return { error: 'Booking not found.', status: 404 }
  if (!b.service_id) return gone
  const s = (await bookableServices(db, pc, [b.service_id])).get(b.service_id)
  if (!s) return gone
  const table = s.kind === 'reservation'
  const inv = await createInvite(db, { companyId: pc.company.id, contactId, serviceId: table ? null : s.id })
  if (table) return { url: `${reservePageUrl(pc.company)}?i=${encodeURIComponent(inv.token)}&party=${Math.max(1, Number(b.seats) || 2)}` }
  return { url: `${bookingPageUrl(pc.company, s.slug || undefined)}?i=${encodeURIComponent(inv.token)}` }
}

/**
 * Pay an accepted quote's deposit from the account page: a card payment link
 * (the same one the quote page makes). Only their own quotes.
 */
export async function quoteDepositLink(db: any, pc: PortalCompany, contactId: string, quoteId: string): Promise<{ url: string } | { error: string; status: number }> {
  const none = { error: 'Quote not found.', status: 404 }
  if (!UUID.test(quoteId)) return none
  const { data: quote } = await db.from('job_quotes').select('*').eq('id', quoteId).eq('company_id', pc.company.id).maybeSingle()
  if (!quote) return none
  const { data: job } = await db.from('jobs').select('id, contact_id, conversation_id').eq('id', quote.job_id).eq('company_id', pc.company.id).maybeSingle()
  if (!job || job.contact_id !== contactId) return none
  if (quote.status !== 'accepted') return { error: 'Accept the quote first, then pay the deposit.', status: 409 }
  const company = await loadCompany(db, pc.company.id)
  if (!company) return none
  return quoteDepositCheckout(db, company, quote, job)
}

// ── Payments due ──────────────────────────────────────────────────────────
async function paymentsDue(db: any, pc: PortalCompany, convIds: string[]): Promise<PortalPayment[]> {
  if (!convIds.length) return []
  const { data } = await db.from('chat_payments').select('id, amount_cents, currency, description, status, checkout_url, created_at')
    .eq('company_id', pc.company.id).in('conversation_id', convIds).eq('status', 'pending')
    .gte('created_at', new Date(Date.now() - 120 * DAY).toISOString()).order('created_at', { ascending: false }).limit(10)
  return (data || []).map((p: any) => ({
    id: p.id, description: String(p.description || '').slice(0, 120), cents: Number(p.amount_cents) || 0, currency: p.currency || 'aud',
    // The durable /pay/<id> link (it makes a fresh checkout if the old one lapsed).
    url: p.checkout_url || null, createdAt: p.created_at,
  }))
}

// ── Quotes and jobs ───────────────────────────────────────────────────────
async function quotesAndJobs(db: any, pc: PortalCompany, contactId: string): Promise<{ quotes: PortalQuote[]; invoices: PortalInvoice[]; jobs: PortalJob[]; depositPayments: string[] }> {
  const { data: jobs } = await db.from('jobs').select('id, number, title, status, scheduled_start, updated_at, created_at')
    .eq('company_id', pc.company.id).eq('contact_id', contactId).order('created_at', { ascending: false }).limit(20)
  const list = jobs || []
  if (!list.length) return { quotes: [], invoices: [], jobs: [], depositPayments: [] }
  const ids = list.map((j: any) => j.id)
  const { data: qs } = await db.from('job_quotes').select('id, job_id, number, revision, status, total_cents, public_token, sent_at, accepted_at, valid_until, created_at, deposit_cents, deposit_status, deposit_payment_id')
    .eq('company_id', pc.company.id).in('job_id', ids).in('status', ['sent', 'accepted']).order('created_at', { ascending: false }).limit(20)
  const title = new Map(list.map((j: any) => [j.id, j.title || '']))
  const js = resolveJobSettings(pc.company.job_settings)
  const quotes: PortalQuote[] = (qs || []).filter((q: any) => q.public_token).map((q: any) => {
    const expired = q.status === 'sent' && q.valid_until && Date.parse(q.valid_until) < Date.now() - DAY
    // A deposit on an accepted quote can be paid by card here (once the business takes cards).
    const dep = Number(q.deposit_cents) > 0 ? { cents: Number(q.deposit_cents), paid: q.deposit_status === 'paid' } : null
    const owing = !!dep && !dep.paid && q.status === 'accepted'
    return {
      id: q.id, number: fmtJobNumber(q.number, js.quote_prefix || 'Q') + (q.revision > 1 ? ` (rev ${q.revision})` : ''), title: String(title.get(q.job_id) || ''),
      cents: Number(q.total_cents) || 0, status: q.status, waiting: q.status === 'sent' && !expired,
      statusLabel: q.status === 'sent' ? (expired ? 'Expired' : 'Waiting for you') : owing ? 'Deposit to pay' : (QUOTE_STATUS_LABEL as any)[q.status] || q.status,
      url: quoteUrl(pc.company, q.public_token), sentAt: q.sent_at || q.created_at,
      deposit: dep ? { ...dep, due: owing && stripeReady(pc.company) } : null,
    }
  })
  // Jobs still going (or finished in the last month).
  const recent = Date.now() - 30 * DAY
  const jobsOut: PortalJob[] = list.filter((j: any) => j.status !== 'cancelled' && (j.status !== 'completed' || Date.parse(j.updated_at || j.created_at) > recent)).slice(0, 10).map((j: any) => ({
    id: j.id, title: j.title || fmtJobNumber(j.number, js.job_prefix || 'J') || 'Job', status: j.status, statusLabel: (JOB_STATUS_LABEL as any)[j.status] || j.status,
    nextVisit: j.scheduled_start && Date.parse(j.scheduled_start) > Date.now() - 6 * 3600e3 ? j.scheduled_start : null,
  }))
  // Invoices sent for their jobs (V434; none before it), unpaid ones first.
  const { data: ivs } = await db.from('job_invoices').select('id, job_id, number, status, title, total_cents, credit_cents, paid_cents, due_date, public_token, sent_at, pay_payment_id')
    .eq('company_id', pc.company.id).in('job_id', ids).in('status', ['sent', 'paid']).order('created_at', { ascending: false }).limit(20)
  const today = todayIn(companyTz(pc.company))
  const invoices: PortalInvoice[] = (ivs || []).filter((v: any) => v.public_token).map((v: any) => {
    const due = Math.max(0, Number(v.total_cents) - Number(v.credit_cents))
    const owing = v.status === 'sent' ? Math.max(0, due - Number(v.paid_cents)) : 0
    const overdue = owing > 0 && !!v.due_date && v.due_date < today
    return {
      id: v.id, number: `${js.invoice_prefix || 'INV'}-${v.number}`, title: String(v.title || title.get(v.job_id) || ''),
      cents: due, owing, status: v.status, statusLabel: owing <= 0 ? 'Paid' : overdue ? 'Overdue' : 'To pay',
      dueDate: v.due_date || null, overdue, url: `${companyBase(pc.company).base}/i/${v.public_token}`, sentAt: v.sent_at || null,
    }
  }).sort((a: PortalInvoice, b: PortalInvoice) => (b.owing > 0 ? 1 : 0) - (a.owing > 0 ? 1 : 0))
  // A deposit or invoice link they opened and didn't finish is also a pending
  // payment; it shows on its quote or invoice, not twice.
  return { quotes, invoices, jobs: jobsOut, depositPayments: [...(qs || []).map((q: any) => q.deposit_payment_id), ...(ivs || []).map((v: any) => v.pay_payment_id)].filter(Boolean) }
}

// ── Orders and receipts ───────────────────────────────────────────────────
async function orders(db: any, pc: PortalCompany, contact: any, convIds: string[]): Promise<PortalOrder[]> {
  const companyId = pc.company.id
  const since = new Date(Date.now() - 365 * DAY).toISOString()
  const email = String(contact.email || '').trim().toLowerCase()
  const tail = phoneKey(contact.phone)
  const out: PortalOrder[] = []
  await Promise.all([
    // WooCommerce: in-store (Prexty) and online.
    safe(async () => {
      const seen = new Set<string>()
      const rows: any[] = []
      if (email) {
        const { data } = await db.from('woocommerce_orders').select('*').eq('company_id', companyId).ilike('customer_email', ilikeExact(email)).gte('order_date', since).order('order_date', { ascending: false }).limit(15)
        rows.push(...(data || []).filter((o: any) => String(o.customer_email || '').toLowerCase() === email))
      }
      if (tail.length >= 9) {
        const { data } = await db.from('woocommerce_orders').select('*').eq('company_id', companyId).eq('billing_phone_norm', tail).gte('order_date', since).order('order_date', { ascending: false }).limit(15)
        rows.push(...(data || []))
      }
      let store = ''
      if (rows.some(o => !(o.pos_source === 'prexty' || o.pos_sale_id))) {
        const { data: wi } = await db.from('woocommerce_integrations').select('store_url').eq('company_id', companyId).limit(1)
        store = String(wi?.[0]?.store_url || '').replace(/\/+$/, '')
      }
      for (const o of rows) {
        const k = String(o.woo_order_id ?? o.id)
        if (seen.has(k)) continue
        seen.add(k)
        const pos = o.pos_source === 'prexty' || !!o.pos_sale_id
        const st = String(o.status || '').toLowerCase()
        const paid = pos ? !['refunded', 'cancelled', 'failed'].includes(st) : ['completed', 'processing'].includes(st)
        const label = pos
          ? (st === 'refunded' ? 'Refunded' : st === 'cancelled' || st === 'failed' ? 'Cancelled' : 'Paid')
          : ({ completed: 'Completed', processing: 'Paid, being prepared', 'on-hold': 'On hold', pending: 'Waiting for payment', refunded: 'Refunded', cancelled: 'Cancelled', failed: 'Payment failed' } as Record<string, string>)[st] || 'Ordered'
        const items = Array.isArray(o.line_items) ? o.line_items.slice(0, 4).map((i: any) => `${i.quantity || 1}× ${String(i.name || '').slice(0, 60)}`).join(', ') : ''
        out.push({
          id: String(o.id || k), kind: pos ? 'in_store' : 'online', platform: pos ? 'prexty' : 'woocommerce', number: o.woo_order_id != null ? String(o.woo_order_id) : '',
          at: o.order_date || o.created_at, cents: Math.round((Number(o.total) || 0) * 100), currency: String(o.currency || 'aud').toLowerCase(), paid, statusLabel: label, items,
          // Online orders: the shop's own account page (returns and changes happen there).
          url: !pos && store && o.woo_order_id != null ? `${store}/my-account/view-order/${o.woo_order_id}/` : null,
          receipt: o.id ? `woo:${o.id}` : null,
        })
      }
    }, undefined),
    // Shopify.
    safe(async () => {
      if (!email && tail.length < 9) return
      let q = db.from('orders').select('id, order_number, status, payment_status, total, currency, order_date, created_at').eq('company_id', companyId).eq('sales_channel', 'shopify').gte('created_at', since)
      q = email ? q.eq('customer_email', email) : q.eq('customer_phone_norm', tail)
      const { data } = await q.order('created_at', { ascending: false }).limit(10)
      // What's in each (order_items: the orders table has no line items of its own).
      const itemsBy = new Map<string, string>()
      if ((data || []).length) {
        const { data: its } = await db.from('order_items').select('order_id, product_name, quantity').eq('company_id', companyId).in('order_id', (data || []).map((o: any) => o.id)).limit(200)
        for (const i of its || []) { const was = itemsBy.get(i.order_id); const s = `${i.quantity || 1}× ${String(i.product_name || '').slice(0, 60)}`; itemsBy.set(i.order_id, was ? `${was}, ${s}` : s) }
      }
      for (const o of data || []) {
        const pay = String(o.payment_status || '').toLowerCase()
        out.push({
          id: String(o.id), kind: 'online', platform: 'shopify', number: o.order_number ? String(o.order_number) : '', at: o.order_date || o.created_at,
          cents: Math.round((Number(o.total) || 0) * 100), currency: String(o.currency || 'aud').toLowerCase(), paid: ['paid', 'captured', 'succeeded'].includes(pay),
          statusLabel: pay === 'paid' ? 'Paid' : pay ? pay.charAt(0).toUpperCase() + pay.slice(1).replace(/_/g, ' ') : (o.status || 'Ordered'),
          items: itemsBy.get(o.id) || '', url: null, receipt: `shop:${o.id}`,
        })
      }
    }, undefined),
    // Paid payment links: the Stripe receipt.
    safe(async () => {
      if (!convIds.length) return
      const { data } = await db.from('chat_payments').select('id, amount_cents, currency, description, status, receipt_url, paid_at, created_at')
        .eq('company_id', companyId).in('conversation_id', convIds).in('status', ['paid', 'refunded']).gte('created_at', since).order('created_at', { ascending: false }).limit(10)
      for (const p of data || []) out.push({
        id: p.id, kind: 'payment', platform: 'stripe', number: '', at: p.paid_at || p.created_at, cents: Number(p.amount_cents) || 0, currency: p.currency || 'aud',
        paid: p.status === 'paid', statusLabel: p.status === 'refunded' ? 'Refunded' : 'Paid', items: String(p.description || 'Payment').slice(0, 120), url: p.receipt_url || null,
        receipt: `pay:${p.id}`,
      })
    }, undefined),
  ])
  return out.sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, 20)
}

// ── Messages ──────────────────────────────────────────────────────────────
/** The conversation to show and reply in: their most recent one. */
export async function mainConversation(db: any, companyId: string, contactId: string) {
  const convs = await conversationsOf(db, companyId, contactId)
  return convs[0] || null
}

async function messages(db: any, pc: PortalCompany, conv: { id: string } | null): Promise<{ items: PortalMessage[]; canReply: boolean }> {
  if (!conv) return { items: [], canReply: true }
  const { data } = await db.from('messages').select('id, sender_type, sender_name, content, created_at, metadata')
    .eq('conversation_id', conv.id).in('sender_type', ['visitor', 'agent', 'ai']).order('created_at', { ascending: false }).limit(40)
  const items = (data || []).reverse().map((m: any) => ({
    id: m.id, mine: m.sender_type === 'visitor', text: strip(m.content).slice(0, 2000), at: m.created_at,
    by: m.sender_type === 'visitor' ? null : pc.company.name,
  })).filter((m: PortalMessage) => m.text)
  return { items, canReply: true }
}

export function meOf(contact: any, prefs: { email: boolean; sms: boolean | null }, session: { via: 'code' | 'link'; expiresAt: string }): PortalMe['me'] {
  return {
    name: String(contact.name || '').slice(0, 120), email: maskEmail(contact.email), phone: maskPhone(contact.phone),
    marketingEmail: prefs.email, marketingSms: !!prefs.sms, smsOnFile: prefs.sms !== null, via: session.via, expiresAt: session.expiresAt,
  }
}

/** Everything for the page, in one go. */
export async function portalData(db: any, pc: PortalCompany, contactId: string, session: { via: 'code' | 'link'; expiresAt: string }): Promise<PortalMe | null> {
  const contact = await loadContact(db, pc.company.id, contactId)
  if (!contact) return null
  const on = pc.settings.sections
  const convs = await safe(() => conversationsOf(db, pc.company.id, contactId), [])
  const convIds = convs.map(c => c.id)
  const [prefs, coming, again, pay, qj, ords, msgs] = await Promise.all([
    safe(() => preferenceState(db, pc.company.id, contact), { email: false, sms: null, emailCanTurnOn: false, everythingOff: false }),
    on.coming_up ? safe(() => comingUp(db, pc, contact), []) : Promise.resolve(undefined),
    on.coming_up ? safe(() => bookAgain(db, pc, contactId), []) : Promise.resolve(undefined),
    on.payments ? safe(() => paymentsDue(db, pc, convIds), []) : Promise.resolve(undefined),
    on.quotes ? safe(() => quotesAndJobs(db, pc, contactId), { quotes: [], invoices: [], jobs: [], depositPayments: [] as string[] }) : Promise.resolve(undefined),
    on.orders ? safe(() => orders(db, pc, contact, convIds), []) : Promise.resolve(undefined),
    on.messages ? safe(() => messages(db, pc, convs[0] || null), { items: [], canReply: true }) : Promise.resolve(undefined),
  ])
  return {
    me: meOf(contact, prefs, session),
    ...(coming ? { comingUp: coming } : {}),
    ...(again ? { bookAgain: again } : {}),
    ...(pay ? { payments: qj?.depositPayments.length ? pay.filter(p => !qj.depositPayments.includes(p.id)) : pay } : {}),
    ...(qj ? { quotes: qj.quotes, invoices: qj.invoices, jobs: qj.jobs } : {}),
    ...(ords ? { orders: ords } : {}),
    ...(msgs ? { messages: msgs } : {}),
  }
}

/**
 * Preferences: their name, and marketing by email and text. Turning email on
 * here is the customer's own express consent. Texts can be turned off here;
 * back on only by texting START (the same rule as everywhere else).
 */
export async function savePrefs(db: any, pc: PortalCompany, contactId: string, body: any, session: { via: 'code' | 'link'; expiresAt: string }) {
  const companyId = pc.company.id
  let contact = await loadContact(db, companyId, contactId)
  if (!contact) return { ok: false as const, error: 'Account not found.' }
  if (typeof body.name === 'string') {
    const name = body.name.replace(/\s+/g, ' ').trim().slice(0, 120)
    if (name.length < 1) return { ok: false as const, error: 'Add your name.' }
    const { error } = await db.from('contacts').update({ name }).eq('id', contactId).eq('company_id', companyId)
    if (error) return { ok: false as const, error: 'Couldn’t save your name.' }
    contact = { ...contact, name }
  }
  const opts = { source: 'Customer account page', actor: 'customer' as const }
  if (typeof body.marketingEmail === 'boolean' || typeof body.marketingSms === 'boolean') {
    const before = await preferenceState(db, companyId, contact)
    if (body.marketingSms === true && before.sms === false) return { ok: false as const, error: 'To get texts again, reply START to any text from us.' }
    if (body.marketingEmail === true && !before.email && !before.emailCanTurnOn && !contact.is_blocked) {
      // Never opted in before: this tick is their consent.
      const now = new Date().toISOString()
      const patch: Record<string, any> = { subscribed_to_marketing: true, consent_basis: 'express', consent_source: opts.source, consent_recorded_at: now }
      let { error } = await db.from('contacts').update(patch).eq('id', contactId).eq('company_id', companyId)
      if (error) { delete patch.consent_recorded_at; ({ error } = await db.from('contacts').update(patch).eq('id', contactId).eq('company_id', companyId)) }
      if (error) return { ok: false as const, error: 'Couldn’t save that.' }
      // Email only: texts stay as they were.
      if (phoneKey(contact.phone).length >= 8 && !before.sms) { try { await db.from('contacts').update({ sms_marketing_opt_out_at: contact.sms_marketing_opt_out_at || now }).eq('id', contactId).eq('company_id', companyId) } catch {} }
      try { await db.from('consent_events').insert({ company_id: companyId, contact_id: contactId, action: 'subscribed', basis: 'express', source: opts.source, actor: 'customer', note: 'Ticked “News and offers by email” on their account page' }) } catch {}
    } else {
      const r = await applyPreferences(db, companyId, contact, {
        email: typeof body.marketingEmail === 'boolean' ? body.marketingEmail : before.email,
        sms: typeof body.marketingSms === 'boolean' ? body.marketingSms : before.sms,
      }, opts)
      if (!r.ok) return { ok: false as const, error: r.error || 'Couldn’t save that.' }
    }
    contact = (await loadContact(db, companyId, contactId)) || contact
  }
  const prefs = await preferenceState(db, companyId, contact)
  return { ok: true as const, me: meOf(contact, prefs, session) }
}
