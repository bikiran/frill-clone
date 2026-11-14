// Class packs and memberships, server side (needs V436). Shared by the admin
// API (/api/passes), the public booking API (/api/book, /api/book/passes),
// the customer account page, the Stripe webhook and the daily sync cron.
//
// Money: a pack is one card payment (Stripe Checkout, payment mode); a
// membership is a Stripe subscription on the business's own Stripe (Checkout,
// subscription mode), billed every period until it's cancelled. Every
// payment is a pass_charges row keyed on its Stripe id, so the webhook, the
// return page and the sync can all see the same payment and it counts once.
// Using a class goes through colvy_pass_use (under a row lock).

import { chatStripe } from '@/lib/chat-checkout'
import { ensureContact, bookingPageUrl, companyBase, stripeReady, resolveBookingSettings } from '@/lib/booking'
import {
  passState, periodWindow, canBook, useRefusal, creditsWords, priceWords, addPeriods,
  type CustomerPass, type PassProduct, type PassState,
} from '@/lib/passes/rules'

const DAY = 86_400_000

export const PASS_HINT = 'Class packs and memberships need a database update. Run migrations/COLVY_V436_CLASS_PASSES.sql in Supabase.'
export function isMissingPassSchema(e: any): boolean {
  const m = `${e?.message || ''} ${e?.details || ''} ${e?.hint || ''}`
  return /pass_products|customer_passes|pass_uses|pass_charges|colvy_pass_(use|return)|pass_id/i.test(m) && /does not exist|schema cache|could not find|not found/i.test(m)
    || ['42P01', '42883', 'PGRST202', 'PGRST205'].includes(String(e?.code || '')) && /pass/i.test(m)
}

export const PASS_COLS = 'id, company_id, product_id, contact_id, customer_name, customer_email, customer_phone, kind, name, service_ids, credits_total, credits_used, price_cents, currency, valid_days, every_n, unit, status, activated_at, expires_at, period_start, period_end, cancel_at_period_end, cancelled_at, source, paid_how, stripe_session_id, stripe_subscription_id, stripe_customer_id, chat_payment_id, sold_by_name, note, created_at, updated_at'

export type PassRow = CustomerPass & {
  company_id: string; product_id: string | null; contact_id: string | null
  customer_name: string | null; customer_email: string | null; customer_phone: string | null
  valid_days: number | null; source: 'online' | 'team'; paid_how: string | null
  stripe_session_id: string | null; stripe_subscription_id: string | null; stripe_customer_id: string | null
  chat_payment_id: string | null; sold_by_name: string | null; note: string | null; created_at: string; updated_at: string; cancelled_at: string | null
}

export async function loadProducts(db: any, companyId: string, opts: { online?: boolean; all?: boolean } = {}): Promise<PassProduct[]> {
  let q = db.from('pass_products').select('*').eq('company_id', companyId)
  if (!opts.all) q = q.eq('active', true)
  if (opts.online) q = q.eq('sell_online', true).gt('price_cents', 0)
  const { data, error } = await q.order('sort_order').order('created_at')
  if (error) throw error
  return (data || []) as PassProduct[]
}

/** The page where customers book (and buy passes). */
export function passesPageUrl(company: any, productId?: string | null) {
  return `${bookingPageUrl(company)}?passes=1${productId ? `&product=${encodeURIComponent(productId)}` : ''}`
}

// ── Where each pass stands ───────────────────────────────────────────────────

/** Classes a limited membership has booked in the period holding `atMs`. */
export async function usedInWindow(db: any, p: PassRow | CustomerPass, atMs: number): Promise<{ used: number; from: string | null; to: string | null }> {
  if (p.kind !== 'membership' || p.credits_total == null) return { used: 0, from: null, to: null }
  const w = periodWindow(p, atMs)
  if (!w) return { used: 0, from: null, to: null }
  const { count } = await db.from('pass_uses').select('id', { count: 'exact', head: true })
    .eq('pass_id', p.id).is('returned_at', null).gte('class_at', w.from).lt('class_at', w.to)
  return { used: count || 0, from: w.from, to: w.to }
}

export async function withState<T extends PassRow>(db: any, passes: T[], tz?: string, now = Date.now()): Promise<(T & { state: PassState })[]> {
  return Promise.all(passes.map(async p => {
    const used = p.kind === 'membership' && p.credits_total != null ? (await usedInWindow(db, p, now)).used : 0
    return { ...p, state: passState(p, now, used, tz) }
  }))
}

/** A customer's passes (paid ones; newest first). */
export async function passesForContact(db: any, companyId: string, contactId: string): Promise<PassRow[]> {
  const { data, error } = await db.from('customer_passes').select(PASS_COLS).eq('company_id', companyId).eq('contact_id', contactId)
    .neq('status', 'pending').order('created_at', { ascending: false }).limit(50)
  if (error) throw error
  return (data || []) as PassRow[]
}

/**
 * The customer's passes that can pay for this class, and why the others
 * can't (for the booking page). A membership past its period is checked with
 * Stripe first: the renewal may have gone through without a webhook.
 */
export async function passOptionsFor(db: any, company: any, contactId: string, serviceId: string, classAtMs: number) {
  const all = await passesForContact(db, company.id, contactId)
  const out: { id: string; name: string; kind: string; label: string; when: string | null; ok: boolean; reason: string | null }[] = []
  const tz = resolveBookingSettings(company.booking_settings).timezone
  for (let p of all) {
    if (p.kind === 'membership' && p.stripe_subscription_id && ['active', 'past_due'].includes(p.status) && p.period_end && Date.parse(p.period_end) < Date.now()) {
      p = (await syncMembership(db, company, p).catch(() => null)) || p
    }
    const w = await usedInWindow(db, p, classAtMs)
    const verdict = canBook(p, serviceId, classAtMs, Date.now(), w.used)
    const now = await usedInWindow(db, p, Date.now())
    const st = passState(p, Date.now(), now.used, tz)
    if (!['active', 'past_due'].includes(p.status)) continue
    out.push({ id: p.id, name: p.name, kind: p.kind, label: st.label, when: st.when, ok: verdict.ok, reason: verdict.ok ? null : (verdict as { reason: string }).reason })
  }
  return out
}

// ── Using a class ────────────────────────────────────────────────────────────

/** Pay for a booking with a class from this pass. */
export async function usePass(db: any, opts: { companyId: string; pass: PassRow; bookingId: string; classAtMs: number; by: string }): Promise<{ ok: true; left: number | null } | { ok: false; error: string }> {
  const w = await usedInWindow(db, opts.pass, opts.classAtMs)
  const { data, error } = await db.rpc('colvy_pass_use', {
    p_pass: opts.pass.id, p_company: opts.companyId, p_booking: opts.bookingId, p_class_at: new Date(opts.classAtMs).toISOString(),
    p_from: w.from, p_to: w.to, p_by: opts.by.slice(0, 120),
  })
  if (error) throw error
  if (!data?.ok) return { ok: false, error: useRefusal(data?.reason, opts.pass.name) }
  // The booking is the pass holder's (their contact and conversation).
  await db.from('bookings').update({ pass_id: opts.pass.id, amount_due_cents: 0, payment_status: 'none', ...(opts.pass.contact_id ? { contact_id: opts.pass.contact_id } : {}), updated_at: new Date().toISOString() })
    .eq('id', opts.bookingId).eq('company_id', opts.companyId)
  return { ok: true, left: data.left ?? null }
}

/** Give a cancelled booking's class back to its pass. */
export async function returnPass(db: any, companyId: string, bookingId: string): Promise<boolean> {
  const { data, error } = await db.rpc('colvy_pass_return', { p_booking: bookingId, p_company: companyId })
  if (error) { if (isMissingPassSchema(error)) return false; throw error }
  return !!data?.ok
}

// ── Buying ───────────────────────────────────────────────────────────────────

type Buyer = { name: string; email: string | null; phone: string | null }

/** Start a purchase: a pending pass and a Stripe Checkout page to pay on. */
export async function startPurchase(db: any, opts: {
  company: any; product: PassProduct; buyer: Buyer; contactId?: string | null; origin: string
  returnUrl?: string; source?: 'online' | 'team'; soldBy?: { id: string | null; name: string | null }
}): Promise<{ ok: true; url: string; passId: string } | { ok: false; error: string; status?: number }> {
  const { company, product } = opts
  if (!product.active) return { ok: false, error: 'That pass isn’t on sale any more.', status: 404 }
  if (product.price_cents < 100) return { ok: false, error: 'That pass can’t be bought online. Ask us about it.', status: 400 }
  if (!stripeReady(company)) return { ok: false, error: 'This business hasn’t set up card payments yet, so passes can’t be bought online. Please contact them.', status: 400 }
  const contactId = await ensureContact(db, company.id, opts.buyer, opts.contactId || undefined, undefined, 'pass')
  const { data: pass, error } = await db.from('customer_passes').insert({
    company_id: company.id, product_id: (product as any).id, contact_id: contactId || null,
    customer_name: opts.buyer.name, customer_email: opts.buyer.email, customer_phone: opts.buyer.phone,
    kind: product.kind, name: product.name, service_ids: product.service_ids || [],
    credits_total: product.credits, credits_used: 0, price_cents: product.price_cents, currency: product.currency || 'aud',
    valid_days: product.valid_days, every_n: product.every_n, unit: product.unit,
    status: 'pending', source: opts.source || 'online', paid_how: 'card',
    sold_by: opts.soldBy?.id || null, sold_by_name: opts.soldBy?.name || null,
  }).select('id').maybeSingle()
  if (error || !pass) throw error || new Error('Could not start the purchase.')

  const back = opts.returnUrl || passesPageUrl(company)
  const sep = back.includes('?') ? '&' : '?'
  const { s, connectOpts, useOwnKeys } = await chatStripe(company)
  const feePct = useOwnKeys ? 0 : parseFloat(process.env.COLVY_PAYMENT_FEE_PCT || '0')
  const meta = { kind: 'pass_purchase', companyId: company.id, passId: pass.id }
  const label = product.kind === 'membership' ? `${product.name} (${priceWords(product)})` : product.name
  const params: any = {
    payment_method_types: ['card'],
    line_items: [{
      price_data: {
        currency: product.currency || 'aud',
        product_data: { name: label.slice(0, 250) },
        unit_amount: product.price_cents,
        ...(product.kind === 'membership' ? { recurring: { interval: product.unit, interval_count: product.every_n || 1 } } : {}),
      },
      quantity: 1,
    }],
    success_url: `${back}${sep}pass=${pass.id}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${back}${sep}pass=${pass.id}&cancelled=1`,
    metadata: meta,
    ...(opts.buyer.email ? { customer_email: opts.buyer.email } : {}),
  }
  let chatPaymentId: string | null = null
  if (product.kind === 'membership') {
    params.mode = 'subscription'
    params.subscription_data = { metadata: meta, ...(feePct > 0 ? { application_fee_percent: feePct } : {}) }
  } else {
    params.mode = 'payment'
    const fee = feePct > 0 ? Math.round(product.price_cents * feePct / 100) : 0
    params.payment_intent_data = { metadata: meta, ...(fee > 0 ? { application_fee_amount: fee } : {}) }
    // On the Payments page like any other card payment.
    const { data: pay } = await db.from('chat_payments').insert({
      company_id: company.id, conversation_id: null, message_id: null,
      amount_cents: product.price_cents, currency: product.currency || 'aud', description: `${product.name} — ${opts.buyer.name}`, status: 'pending',
    }).select('id').maybeSingle()
    chatPaymentId = pay?.id || null
  }
  try {
    const session = await s.checkout.sessions.create(params, connectOpts)
    await db.from('customer_passes').update({ stripe_session_id: session.id, chat_payment_id: chatPaymentId, updated_at: new Date().toISOString() }).eq('id', pass.id)
    if (chatPaymentId) await db.from('chat_payments').update({ stripe_session_id: session.id, checkout_url: session.url }).eq('id', chatPaymentId)
    return { ok: true, url: session.url as string, passId: pass.id }
  } catch (e: any) {
    await db.from('customer_passes').update({ status: 'expired', note: 'Checkout could not start', updated_at: new Date().toISOString() }).eq('id', pass.id)
    if (chatPaymentId) { try { await db.from('chat_payments').update({ status: 'failed' }).eq('id', chatPaymentId) } catch {} }
    return { ok: false, error: e?.message || 'Couldn’t start the payment. Please try again.' }
  }
}

const subStatus = (s: string): 'active' | 'past_due' | 'cancelled' =>
  s === 'active' || s === 'trialing' ? 'active' : s === 'canceled' || s === 'incomplete_expired' ? 'cancelled' : 'past_due'

const tsIso = (sec: any) => (Number(sec) > 0 ? new Date(Number(sec) * 1000).toISOString() : null)

/** A subscription's dates and state onto its pass. */
function subPatch(sub: any) {
  const status = subStatus(String(sub?.status || ''))
  // Newer API versions keep the period on the subscription's item.
  const item = sub?.items?.data?.[0] || {}
  return {
    status,
    period_start: tsIso(sub?.current_period_start ?? item.current_period_start),
    period_end: tsIso(sub?.current_period_end ?? item.current_period_end),
    cancel_at_period_end: !!sub?.cancel_at_period_end,
    ...(status === 'cancelled' ? { cancelled_at: tsIso(sub?.canceled_at) || new Date().toISOString() } : {}),
    stripe_subscription_id: String(sub?.id || ''),
    ...(sub?.customer ? { stripe_customer_id: typeof sub.customer === 'string' ? sub.customer : sub.customer.id } : {}),
  }
}

/**
 * Record a payment for a pass, once (pass_charges.stripe_ref is unique): on
 * the Payments page as a card payment, with its receipt.
 */
async function recordCharge(db: any, pass: PassRow, c: { ref: string | null; cents: number; how?: string; periodStart?: string | null; periodEnd?: string | null; receiptUrl?: string | null; paymentIntent?: string | null; card?: any; description?: string }): Promise<boolean> {
  const { data: row, error } = await db.from('pass_charges').insert({
    company_id: pass.company_id, pass_id: pass.id, stripe_ref: c.ref, amount_cents: c.cents, currency: pass.currency || 'aud',
    paid_how: c.how || 'card', period_start: c.periodStart || null, period_end: c.periodEnd || null,
  }).select('id').maybeSingle()
  if (error) { if (String(error.code) === '23505') return false; throw error }
  if (!row || !c.cents || (c.how && c.how !== 'card')) return true
  // The pack's own Payments row (made with its checkout), else a new one.
  let payId = pass.kind === 'pack' ? pass.chat_payment_id : null
  if (!payId) {
    const { data: pay } = await db.from('chat_payments').insert({
      company_id: pass.company_id, conversation_id: null, message_id: null, amount_cents: c.cents, currency: pass.currency || 'aud',
      description: (c.description || `${pass.name} — ${pass.customer_name || 'customer'}`).slice(0, 300), status: 'pending',
    }).select('id, company_id, conversation_id, message_id, amount_cents').maybeSingle()
    payId = pay?.id || null
  }
  if (payId) {
    await db.from('pass_charges').update({ chat_payment_id: payId }).eq('id', row.id)
    const { data: pay } = await db.from('chat_payments').select('id, company_id, conversation_id, message_id, amount_cents').eq('id', payId).maybeSingle()
    if (pay) {
      const { confirmChatPayment } = await import('@/lib/chat-payment-confirm')
      await confirmChatPayment(db, pay, { receiptUrl: c.receiptUrl || null, paymentIntent: c.paymentIntent || null, cardBrand: c.card?.brand || null, cardLast4: c.card?.last4 || null }).catch(() => null)
    }
  }
  return true
}

/**
 * A paid Checkout session → the pass is live. Idempotent: the webhook, the
 * return page and the sync can all call it; the pass turns active once.
 * `session` has payment_intent (a pack) or subscription (a membership) expanded where possible.
 */
export async function settlePurchase(db: any, passId: string, session: any, ctx: { company?: any; origin?: string; stripe?: { s: any; opts: any } } = {}): Promise<{ ok: boolean; pass?: PassRow; already?: boolean }> {
  const { data: pass } = await db.from('customer_passes').select(PASS_COLS).eq('id', passId).maybeSingle() as { data: PassRow | null }
  if (!pass) return { ok: false }
  const meta = session?.metadata || {}
  if (meta.passId !== pass.id || meta.companyId !== pass.company_id) return { ok: false }
  if (pass.stripe_session_id && session?.id && pass.stripe_session_id !== session.id) return { ok: false }
  const now = new Date().toISOString()

  if (pass.kind === 'pack') {
    if (session?.payment_status !== 'paid') return { ok: false, pass }
    const expires = pass.valid_days ? new Date(Date.now() + pass.valid_days * DAY).toISOString() : null
    const { data: claimed } = await db.from('customer_passes').update({ status: 'active', activated_at: now, expires_at: expires, updated_at: now })
      .eq('id', pass.id).eq('status', 'pending').select(PASS_COLS)
    const pi = typeof session.payment_intent === 'string' ? null : session.payment_intent
    const piId = typeof session.payment_intent === 'string' ? session.payment_intent : pi?.id || null
    await recordCharge(db, pass, { ref: piId || `cs:${session.id}`, cents: pass.price_cents, receiptUrl: pi?.latest_charge?.receipt_url || null, paymentIntent: piId, card: pi?.latest_charge?.payment_method_details?.card })
    if (!claimed?.length) return { ok: true, already: true, pass }
    await announce(db, claimed[0], ctx)
    return { ok: true, pass: claimed[0] }
  }

  // A membership: the subscription Stripe made.
  const subId = typeof session?.subscription === 'string' ? session.subscription : session?.subscription?.id
  if (!subId || session?.status !== 'complete') return { ok: false, pass }
  let sub = typeof session.subscription === 'object' ? session.subscription : null
  if (!sub && ctx.stripe) { try { sub = await ctx.stripe.s.subscriptions.retrieve(subId, ctx.stripe.opts) } catch {} }
  const patch = sub ? subPatch(sub) : { status: 'active' as const, stripe_subscription_id: subId, period_start: now, period_end: addPeriods(now, pass.every_n || 1, pass.unit || 'month', 1), cancel_at_period_end: false }
  const { data: claimed } = await db.from('customer_passes').update({ ...patch, activated_at: now, updated_at: now })
    .eq('id', pass.id).eq('status', 'pending').select(PASS_COLS)
  const invId = typeof session.invoice === 'string' ? session.invoice : session.invoice?.id
  if (invId) await recordCharge(db, pass, { ref: invId, cents: session.amount_total ?? pass.price_cents, periodStart: patch.period_start, periodEnd: patch.period_end, description: `${pass.name} — ${pass.customer_name || 'customer'} (first payment)` })
  if (!claimed?.length) return { ok: true, already: true, pass }
  await announce(db, claimed[0], ctx)
  return { ok: true, pass: claimed[0] }
}

/** Tell the team, and send the customer their pass. */
async function announce(db: any, pass: PassRow, ctx: { company?: any; origin?: string }) {
  try {
    const company = ctx.company || (await db.from('companies').select('id, name, slug, logo_url, accent_color, owner_id, booking_settings, portal_settings').eq('id', pass.company_id).maybeSingle()).data
    if (!company) return
    const { notifyCompany } = await import('@/lib/notify')
    const price = priceWords(pass)
    await notifyCompany({ db, companyId: pass.company_id, type: 'booking', message: `🎟️ ${pass.customer_name || 'A customer'} bought ${pass.name} (${price}).` } as any).catch(() => null)
    if (!pass.customer_email) return
    const { sendCustomerEmail } = await import('@/lib/customer-email')
    const { passEmailHtml } = await import('@/lib/booking-email')
    const { hidesPoweredBy } = await import('@/lib/branding')
    const { accountLink } = await import('@/lib/portal/auth')
    const tz = resolveBookingSettings(company.booking_settings).timezone
    const st = passState(pass, Date.now(), 0, tz)
    const gives = creditsWords(pass)
    const bookUrl = bookingPageUrl(company)
    const accountUrl = await accountLink(db, company, {}).catch(() => null)
    await sendCustomerEmail(db, company, {
      to: pass.customer_email,
      subject: pass.kind === 'pack' ? `Your ${pass.name} is ready` : `Your ${pass.name} has started`,
      text: `${pass.name}: ${gives} (${price}).${st.when ? ` ${st.when}.` : ''}\n\nBook a class: ${bookUrl}\nWhen you book, choose “Use my pass” and sign in with a code sent to your email or mobile.${pass.kind === 'membership' ? '\n\nYour card is charged automatically each period until you cancel.' : ''}`,
      html: passEmailHtml({ business: company.name, logoUrl: company.logo_url, accent: company.accent_color, hideBadge: await hidesPoweredBy(db, company.id, company).catch(() => false), kind: pass.kind, name: pass.name, gives, price, when: st.when, bookUrl, accountUrl }),
    }).catch(() => false)
  } catch {}
}

/** The return page: ask Stripe how the checkout went (the webhook may not have landed yet). */
export async function verifyPurchase(db: any, company: any, passId: string, sessionId: string) {
  const { s, connectOpts } = await chatStripe(company)
  const session: any = await s.checkout.sessions.retrieve(sessionId, { expand: ['payment_intent.latest_charge', 'subscription'] } as any, connectOpts)
  return settlePurchase(db, passId, session, { company, stripe: { s, opts: connectOpts } })
}

// ── Memberships over time ────────────────────────────────────────────────────

/** Bring a membership up to date from Stripe (its period, its state, its latest payment). */
export async function syncMembership(db: any, company: any, pass: PassRow): Promise<PassRow | null> {
  if (pass.kind !== 'membership' || !pass.stripe_subscription_id) return null
  const { s, connectOpts } = await chatStripe(company)
  const sub: any = await s.subscriptions.retrieve(pass.stripe_subscription_id, { expand: ['latest_invoice'] } as any, connectOpts)
  return applySubscription(db, pass, sub)
}

async function applySubscription(db: any, pass: PassRow, sub: any): Promise<PassRow | null> {
  const patch = subPatch(sub)
  const { data } = await db.from('customer_passes').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', pass.id).select(PASS_COLS)
  const fresh: PassRow = data?.[0] || { ...pass, ...patch }
  const inv = typeof sub?.latest_invoice === 'object' ? sub.latest_invoice : null
  if (inv?.id && inv.status === 'paid' && (inv.amount_paid || 0) > 0) {
    await recordCharge(db, fresh, { ref: inv.id, cents: inv.amount_paid, periodStart: fresh.period_start, periodEnd: fresh.period_end, receiptUrl: inv.hosted_invoice_url || null, description: `${fresh.name} — ${fresh.customer_name || 'customer'}` })
  }
  return fresh
}

async function passForSubscription(db: any, subId: string | null, meta: any): Promise<PassRow | null> {
  if (subId) {
    const { data } = await db.from('customer_passes').select(PASS_COLS).eq('stripe_subscription_id', subId).maybeSingle()
    if (data) return data
  }
  if (meta?.passId && /^[0-9a-f-]{36}$/i.test(meta.passId)) {
    const { data } = await db.from('customer_passes').select(PASS_COLS).eq('id', meta.passId).maybeSingle()
    if (data && (!meta.companyId || data.company_id === meta.companyId)) return data
  }
  return null
}

/**
 * Stripe events on a business's connected account for a membership: a
 * renewal paid or failed, a subscription changed or ended. Returns true when
 * the event was a pass's (handled).
 */
export async function handlePassStripeEvent(db: any, event: any, stripe: any): Promise<boolean> {
  const obj = event?.data?.object || {}
  const acct = event.account ? { stripeAccount: event.account } : undefined
  if (event.type === 'invoice.paid' || event.type === 'invoice.payment_succeeded' || event.type === 'invoice.payment_failed') {
    const subId = typeof obj.subscription === 'string' ? obj.subscription : obj.subscription?.id || obj.parent?.subscription_details?.subscription || null
    const meta = obj.subscription_details?.metadata || obj.parent?.subscription_details?.metadata || {}
    if (meta.kind !== 'pass_purchase' && !subId) return false
    const pass = await passForSubscription(db, subId, meta)
    if (!pass) return meta.kind === 'pass_purchase'
    let sub: any = null
    if (subId) { try { sub = await stripe.subscriptions.retrieve(subId, acct) } catch {} }
    // The first payment of a new membership: the checkout settles it (or this does, if it lands first).
    if (pass.status === 'pending' && sub && event.type !== 'invoice.payment_failed') {
      const now = new Date().toISOString()
      const { data: claimed } = await db.from('customer_passes').update({ ...subPatch(sub), activated_at: now, updated_at: now }).eq('id', pass.id).eq('status', 'pending').select(PASS_COLS)
      if (claimed?.length) await announce(db, claimed[0], {})
    }
    const fresh = sub ? await applySubscription(db, pass, sub) : pass
    if (event.type !== 'invoice.payment_failed' && (obj.amount_paid || 0) > 0 && fresh) {
      await recordCharge(db, fresh, { ref: obj.id, cents: obj.amount_paid, periodStart: fresh.period_start, periodEnd: fresh.period_end, receiptUrl: obj.hosted_invoice_url || null, description: `${fresh.name} — ${fresh.customer_name || 'customer'}` })
    }
    if (event.type === 'invoice.payment_failed' && fresh) {
      try {
        const { notifyCompany } = await import('@/lib/notify')
        await notifyCompany({ db, companyId: fresh.company_id, type: 'booking', message: `⚠️ ${fresh.customer_name || 'A member'}’s ${fresh.name} payment didn’t go through. Stripe will try again.` } as any)
      } catch {}
    }
    return true
  }
  if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
    const pass = await passForSubscription(db, obj.id, obj.metadata)
    if (!pass) return obj.metadata?.kind === 'pass_purchase'
    if (pass.status === 'pending' && event.type === 'customer.subscription.updated') return true   // the checkout settles it
    await applySubscription(db, pass, obj)
    return true
  }
  return false
}

/** Stop a membership: at the end of the period paid for, or now. */
export async function cancelMembership(db: any, company: any, pass: PassRow, opts: { now: boolean }): Promise<{ ok: true; pass: PassRow } | { ok: false; error: string }> {
  if (pass.kind !== 'membership') return { ok: false, error: 'Only a membership can be cancelled.' }
  if (pass.status === 'cancelled') return { ok: false, error: 'This membership is already cancelled.' }
  const nowIso = new Date().toISOString()
  if (pass.stripe_subscription_id) {
    const { s, connectOpts } = await chatStripe(company)
    const sub: any = opts.now
      ? await s.subscriptions.cancel(pass.stripe_subscription_id, {}, connectOpts)
      : await s.subscriptions.update(pass.stripe_subscription_id, { cancel_at_period_end: true }, connectOpts)
    const fresh = await applySubscription(db, pass, sub)
    if (fresh && opts.now && fresh.status !== 'cancelled') {
      await db.from('customer_passes').update({ status: 'cancelled', cancelled_at: nowIso, updated_at: nowIso }).eq('id', pass.id)
    }
  } else {
    await db.from('customer_passes').update(opts.now
      ? { status: 'cancelled', cancelled_at: nowIso, updated_at: nowIso }
      : { cancel_at_period_end: true, updated_at: nowIso }).eq('id', pass.id)
  }
  const { data } = await db.from('customer_passes').select(PASS_COLS).eq('id', pass.id).maybeSingle()
  return { ok: true, pass: data || pass }
}

/** Undo "cancel at the end of the period" while the period is still running. */
export async function resumeMembership(db: any, company: any, pass: PassRow): Promise<{ ok: true; pass: PassRow } | { ok: false; error: string }> {
  if (pass.kind !== 'membership' || pass.status === 'cancelled' || !pass.cancel_at_period_end) return { ok: false, error: 'This membership isn’t set to end.' }
  if (pass.stripe_subscription_id) {
    const { s, connectOpts } = await chatStripe(company)
    const sub = await s.subscriptions.update(pass.stripe_subscription_id, { cancel_at_period_end: false }, connectOpts)
    await applySubscription(db, pass, sub)
  } else {
    await db.from('customer_passes').update({ cancel_at_period_end: false, updated_at: new Date().toISOString() }).eq('id', pass.id)
  }
  const { data } = await db.from('customer_passes').select(PASS_COLS).eq('id', pass.id).maybeSingle()
  return { ok: true, pass: data || pass }
}

/** A pack sold in person (cash, card machine) or given free: live straight away. */
export async function sellInPerson(db: any, opts: { company: any; product: PassProduct; contact: { id: string; name: string | null; email: string | null; phone: string | null }; how: 'cash' | 'other' | 'free'; by: { id: string | null; name: string | null }; note?: string | null }) {
  const { product } = opts
  if (product.kind !== 'pack') throw new Error('Memberships are paid by card: send the customer the sign-up link instead.')
  const now = new Date().toISOString()
  const price = opts.how === 'free' ? 0 : product.price_cents
  const { data: pass, error } = await db.from('customer_passes').insert({
    company_id: opts.company.id, product_id: (product as any).id, contact_id: opts.contact.id,
    customer_name: opts.contact.name, customer_email: opts.contact.email, customer_phone: opts.contact.phone,
    kind: 'pack', name: product.name, service_ids: product.service_ids || [], credits_total: product.credits, credits_used: 0,
    price_cents: price, currency: product.currency || 'aud', valid_days: product.valid_days,
    status: 'active', activated_at: now, expires_at: product.valid_days ? new Date(Date.now() + product.valid_days * DAY).toISOString() : null,
    source: 'team', paid_how: opts.how, sold_by: opts.by.id, sold_by_name: opts.by.name, note: (opts.note || '').slice(0, 500) || null,
  }).select(PASS_COLS).maybeSingle()
  if (error || !pass) throw error || new Error('Could not add the pass.')
  if (price > 0) await recordCharge(db, pass, { ref: null, cents: price, how: opts.how })
  return pass as PassRow
}

// ── The daily sync (app/api/cron/pass-sync) ──────────────────────────────────

export async function runPassSync(db: any, now = Date.now()) {
  const out = { expired: 0, synced: 0, ended: 0, abandoned: 0, errors: 0 }
  const iso = (ms: number) => new Date(ms).toISOString()
  // Packs past their date.
  const { data: exp } = await db.from('customer_passes').update({ status: 'expired', updated_at: iso(now) })
    .eq('kind', 'pack').eq('status', 'active').lt('expires_at', iso(now - DAY)).select('id')
  out.expired = exp?.length || 0
  // Checkouts nobody finished.
  const { data: ab } = await db.from('customer_passes').update({ status: 'expired', note: 'Checkout not finished', updated_at: iso(now) })
    .eq('status', 'pending').lt('created_at', iso(now - 2 * DAY)).select('id')
  out.abandoned = ab?.length || 0
  // Memberships due (or overdue) for renewal: ask Stripe.
  const { data: due } = await db.from('customer_passes').select(PASS_COLS).eq('kind', 'membership').in('status', ['active', 'past_due'])
    .lt('period_end', iso(now + 3600e3)).order('period_end').limit(200)
  const companies = new Map<string, any>()
  for (const p of (due || []) as PassRow[]) {
    try {
      if (!p.stripe_subscription_id) {
        // No card on file (set up by hand): ends with its period when set to.
        if (p.cancel_at_period_end && p.period_end && Date.parse(p.period_end) < now) {
          await db.from('customer_passes').update({ status: 'cancelled', cancelled_at: iso(now), updated_at: iso(now) }).eq('id', p.id); out.ended++
        }
        continue
      }
      let co = companies.get(p.company_id)
      if (!co) { co = (await db.from('companies').select('id, name, slug, stripe_mode, stripe_connected, stripe_account_id, owner_id').eq('id', p.company_id).maybeSingle()).data; companies.set(p.company_id, co) }
      if (!co) continue
      const fresh = await syncMembership(db, co, p)
      if (fresh) out.synced++
      if (fresh?.status === 'cancelled') out.ended++
    } catch { out.errors++ }
  }
  return out
}

/** The customer's account link for this business (when customer accounts are on). */
export function accountBase(company: any) {
  const { base, onSubdomain } = companyBase(company)
  return `${base}/account${onSubdomain ? '' : `/${encodeURIComponent(company.slug)}`}`
}
