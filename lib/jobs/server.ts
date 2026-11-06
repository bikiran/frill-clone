// Server helpers for Jobs & Services: the access check every /api/jobs route
// runs, numbering, the activity timeline, quote totals, sending a quote,
// and quote deposits through Colvy's existing payment links (chat_payments +
// Stripe Checkout). docs/plans/jobs.md has the plan.

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { bearerToken, verifyToken, SUPER_ADMIN } from '@/lib/company-access'
import { checkJobsAccess } from '@/lib/jobs/access-core'
import { hasFullAccess } from '@/lib/permissions'
import { resolveJobSettings, effectiveTaxRate, type JobSettings } from '@/lib/jobs/settings'
import { computeQuote, cleanDiscount, cleanDeposit, fmtMoney } from '@/lib/jobs/quote-math'
import { companyBase, stripeReady } from '@/lib/booking'
import { dateInTz, addDays, isValidTimeZone } from '@/lib/booking-time'
import { emitIntegrationEvent } from '@/lib/integration-events'

export const jobsDb = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

export const MIGRATION_HINT = 'Jobs & quotes needs a database update: run migrations/COLVY_V427_JOBS.sql (if you haven’t yet), then migrations/COLVY_V428_JOBS_PHASE2.sql, in the Supabase SQL editor.'

/** The jobs tables or functions aren't there yet (V427 not run). */
export function isMissingJobsSchema(e: any): boolean {
  const m = `${e?.message || ''} ${e?.code || ''} ${e?.details || ''}`
  return /42P01|42703|PGRST205|PGRST202|PGRST204|does not exist|could not find the|schema cache/i.test(m)
    && /job|colvy_next_job_number|colvy_quote_decide|modules/i.test(m)
}

export const json = (body: any, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
export const setupNeeded = () => json({ setupNeeded: true, error: MIGRATION_HINT }, 503)

// Both shapes carry every key so callers can read access.response after an
// `if (!access.ok)` check (the project doesn't use strictNullChecks, which
// discriminated-union narrowing needs).
export type JobsCaller =
  | { ok: true; userId: string; name: string; role: string; response?: undefined }
  | { ok: false; response: NextResponse; userId?: undefined; name?: undefined; role?: undefined }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const isUuid = (v: any) => typeof v === 'string' && UUID.test(v)

/**
 * The caller must be signed in and belong to THIS workspace as staff (owner,
 * admin, or a member whose permissions allow "jobs"). Enforced here on the
 * server, not just by hiding the nav item.
 */
// A yes is remembered for a few seconds per token + workspace, so the burst of
// requests one screen makes (and the next screen straight after) don't each
// ask the database again. Only a yes: a refusal is always checked afresh. The
// window matches lib/company-access's own token cache.
const ACCESS_TTL_MS = 20_000
const granted = new Map<string, { caller: JobsCaller; at: number }>()

export async function jobsAccess(req: Request, db: any, companyId: any): Promise<JobsCaller> {
  const deny = (status: number, error: string): JobsCaller => ({ ok: false, response: json({ error }, status) })
  if (!isUuid(companyId)) return deny(400, 'A workspace is needed.')
  const token = bearerToken(req as any)
  if (!token) return deny(401, 'Please sign in again.')
  const ck = `${token}:${companyId}`
  const hit = granted.get(ck)
  if (hit && Date.now() - hit.at < ACCESS_TTL_MS) return hit.caller
  const caller = await checkAccess(db, token, companyId, deny)
  if (caller.ok) {
    if (granted.size > 500) granted.clear()
    granted.set(ck, { caller, at: Date.now() })
  } else granted.delete(ck)
  return caller
}

async function checkAccess(db: any, token: string, companyId: string, deny: (status: number, error: string) => JobsCaller): Promise<JobsCaller> {
  const user = await verifyToken(db, token).catch(() => null)
  if (!user) return deny(401, 'Please sign in again.')
  const email = String(user.email || '')
  const fallbackName = String(user.user_metadata?.display_name || user.user_metadata?.full_name || email.split('@')[0] || 'Team')
  if (email.toLowerCase() === SUPER_ADMIN) return { ok: true, userId: user.id, name: fallbackName, role: 'owner' }
  try {
    const [own, team] = await Promise.all([
      db.from('companies').select('id').eq('id', companyId).eq('owner_id', user.id).maybeSingle(),
      db.from('team_members').select('*').eq('company_id', companyId).eq('user_id', user.id).limit(5),
    ])
    if (own?.error && team?.error) return deny(503, 'Colvy couldn’t check your access just now. Please try again.')
    const rows = team?.data || []
    const decision = checkJobsAccess({ isOwner: !!own?.data, rows })
    if (!decision.ok) {
      return deny(403, decision.reason === 'no_permission'
        ? 'You don’t have access to Jobs & quotes. Ask the owner to switch it on for you in Team.'
        : 'Not authorized for this workspace.')
    }
    const row = rows.find((r: any) => r?.name || r?.display_name) || {}
    return { ok: true, userId: user.id, name: String(row.name || row.display_name || fallbackName).slice(0, 80), role: decision.role }
  } catch {
    return deny(503, 'Colvy couldn’t check your access just now. Please try again.')
  }
}

/** Owners and admins: business-wide settings, deleting jobs. */
export const isJobsManager = (role: string) => role === 'owner' || hasFullAccess(role)

export const clip = (v: any, n: number) => (v == null ? '' : String(v)).trim().slice(0, n)
export const isoOrNull = (v: any) => { if (!v) return null; const t = Date.parse(String(v)); return Number.isFinite(t) ? new Date(t).toISOString() : null }

const COMPANY_COLS = 'id, name, slug, owner_id, logo_url, accent_color, industry, modules, job_settings, booking_settings, business_mobile, business_email, business_address, abn_acn, website, stripe_mode, stripe_connected, stripe_account_id'
const COMPANY_COLS_OLD = 'id, name, slug, owner_id, logo_url, accent_color, industry, booking_settings, business_mobile, business_email, business_address, abn_acn, website, stripe_mode, stripe_connected, stripe_account_id'

export async function loadCompany(db: any, companyId: string): Promise<any | null> {
  const first = await db.from('companies').select(COMPANY_COLS).eq('id', companyId).maybeSingle()
  if (!first.error) return first.data || null
  const second = await db.from('companies').select(COMPANY_COLS_OLD).eq('id', companyId).maybeSingle()
  return second.data || null
}

export const companySettings = (company: any): JobSettings => resolveJobSettings(company?.job_settings)

export function companyTz(company: any): string {
  const tz = String(company?.booking_settings?.timezone || '')
  return tz && isValidTimeZone(tz) ? tz : 'Australia/Melbourne'
}
export const todayIn = (tz: string) => dateInTz(Date.now(), tz)

export async function nextNumber(db: any, companyId: string, kind: 'job' | 'quote'): Promise<number> {
  const { data, error } = await db.rpc('colvy_next_job_number', { p_company: companyId, p_kind: kind })
  if (error) throw error
  const n = Number(data)
  if (!Number.isFinite(n) || n <= 0) throw new Error('Could not number the ' + kind)
  return n
}

export type JobEvent = {
  companyId: string; jobId: string; quoteId?: string | null; type: string
  actorType?: 'staff' | 'customer' | 'system'; actorId?: string | null; actorName?: string | null
  summary: string; data?: Record<string, any>
}
export async function logJobEvent(db: any, e: JobEvent) {
  try {
    await db.from('job_events').insert({
      company_id: e.companyId, job_id: e.jobId, quote_id: e.quoteId || null, type: e.type,
      actor_type: e.actorType || 'staff', actor_id: e.actorId || null, actor_name: e.actorName ? String(e.actorName).slice(0, 120) : null,
      summary: String(e.summary).slice(0, 300), data: e.data || {},
    })
  } catch {}
}

export const newPublicToken = () => randomBytes(24).toString('base64url')
export const quoteUrl = (company: any, token: string) => `${companyBase(company).base}/q/${token}`

/** The money columns for a quote, recomputed from its lines (never trusted from the browser). */
export function quoteMoney(input: { items: any; discount?: any; deposit?: any; prices_include_tax?: boolean; tax_rate?: number }) {
  const discount = cleanDiscount(input.discount)
  const deposit = cleanDeposit(input.deposit)
  const t = computeQuote({ lines: input.items, discount, deposit, pricesIncludeTax: !!input.prices_include_tax, taxRate: Number(input.tax_rate ?? 10) })
  return {
    items: t.lines,
    discount_type: discount.type, discount_value: discount.value,
    deposit_type: deposit.type, deposit_value: deposit.value,
    prices_include_tax: !!input.prices_include_tax, tax_rate: Number(input.tax_rate ?? 10),
    gross_cents: t.gross_cents, discount_cents: t.discount_cents, subtotal_cents: t.subtotal_cents,
    tax_cents: t.tax_cents, total_cents: t.total_cents, deposit_cents: t.deposit_cents,
  }
}

/** A blank quote's starting values from the business's settings. */
export function quoteDefaults(settings: JobSettings, tz: string) {
  return {
    prices_include_tax: settings.prices_include_tax,
    tax_rate: effectiveTaxRate(settings),
    terms: settings.default_terms,
    valid_until: addDays(todayIn(tz), settings.quote_valid_days),
    deposit: settings.default_deposit,
  }
}

const firstName = (name: any) => String(name || '').trim().split(/\s+/)[0] || ''

/** The message a quote goes out with (editable in the send dialog). */
export function quoteMessage(o: { company: any; contact: any; quote: any; url: string; prefix: string }) {
  const hi = firstName(o.contact?.name) ? `Hi ${firstName(o.contact.name)}, ` : 'Hi, '
  return `${hi}here's your quote ${o.prefix}-${o.quote.number} from ${o.company?.name || 'us'} for ${fmtMoney(o.quote.total_cents)}. View and accept it here: ${o.url}`
}

export function emitJobEvent(companyId: string, event: string, o: { title: string; summary?: string | null; jobId: string; customer?: any; fields?: Record<string, any>; data?: any; dedupeKey?: string }, db?: any) {
  try {
    emitIntegrationEvent(companyId, event, {
      title: o.title, summary: o.summary || null, path: `/admin/jobs/${o.jobId}`,
      customer: o.customer || null, fields: o.fields || {}, data: o.data || {}, dedupeKey: o.dedupeKey,
    } as any, { db })
  } catch {}
}

// ── Deposits (existing payment links) ───────────────────────────────────────

/**
 * A Stripe Checkout link for a quote's deposit, through chat_payments like
 * booking deposits (kind 'quote_deposit'). Reuses a still-open link. The
 * deposit only counts as paid when Stripe says so: the webhook, or the quote
 * page asking Stripe about the session (verifyQuoteDeposit). Never because the
 * customer landed back on the page.
 */
export async function quoteDepositCheckout(db: any, company: any, quote: any, job: any): Promise<{ url: string } | { error: string; status: number }> {
  if (quote.status !== 'accepted' && quote.status !== 'sent') return { error: 'This quote isn’t open for a deposit.', status: 409 }
  if (!(Number(quote.deposit_cents) > 0)) return { error: 'This quote doesn’t ask for a deposit.', status: 409 }
  if (quote.deposit_status === 'paid') return { error: 'The deposit is already paid.', status: 409 }
  if (!stripeReady(company)) return { error: 'Card payments aren’t set up for this business yet.', status: 409 }

  if (quote.deposit_payment_id) {
    const { data: pay } = await db.from('chat_payments').select('id, status, checkout_url, stripe_session_id, created_at').eq('id', quote.deposit_payment_id).maybeSingle()
    if (pay?.status === 'paid') return { error: 'The deposit is already paid.', status: 409 }
    // Checkout links last 23 hours; reuse one until 10 minutes before it
    // expires (a new link replaces it, and only the newest one settles).
    if (pay?.status === 'pending' && pay.checkout_url && Date.now() - Date.parse(pay.created_at) < 23 * 3600_000 - 10 * 60_000) return { url: pay.checkout_url }
  }

  const description = `Deposit — Quote ${companySettings(company).quote_prefix}-${quote.number}`.slice(0, 200)
  const { data: pay, error } = await db.from('chat_payments').insert({
    company_id: company.id, conversation_id: job?.conversation_id || null, message_id: null,
    amount_cents: quote.deposit_cents, currency: 'aud', description, status: 'pending',
  }).select('id').maybeSingle()
  if (error || !pay?.id) return { error: 'Couldn’t create the payment link. Please try again.', status: 500 }

  const url = quoteUrl(company, quote.public_token)
  const { createChatCheckoutSession } = await import('@/lib/chat-checkout')
  let customerEmail: string | undefined
  if (job?.contact_id) {
    const { data: c } = await db.from('contacts').select('email').eq('id', job.contact_id).maybeSingle()
    if (c?.email) customerEmail = c.email
  }
  const session = await createChatCheckoutSession(company, {
    cents: quote.deposit_cents, currency: 'aud', description, companyId: company.id,
    conversationId: job?.conversation_id || '', kind: 'quote_deposit',
    extraMetadata: { quoteId: quote.id, paymentId: pay.id, jobId: job?.id || '' },
    successUrl: `${url}?paid=1&session_id={CHECKOUT_SESSION_ID}`, cancelUrl: `${url}?payment=cancelled`,
    pageUrl: url, expiresAt: Math.floor(Date.now() / 1000) + 23 * 3600, customerEmail,
  } as any)
  await db.from('chat_payments').update({ stripe_session_id: session.id, checkout_url: session.url }).eq('id', pay.id)
  await db.from('job_quotes').update({ deposit_payment_id: pay.id, deposit_status: quote.deposit_status === 'none' ? 'requested' : quote.deposit_status, updated_at: new Date().toISOString() }).eq('id', quote.id)
  return { url: String(session.url) }
}

/**
 * Settle a paid deposit, once. Called by the Stripe webhook (kind
 * 'quote_deposit') and by verifyQuoteDeposit after asking Stripe. Checks the
 * session belongs to this quote and is actually paid.
 */
export async function settleQuoteDeposit(db: any, quoteId: string, session: any): Promise<{ settled: boolean }> {
  if (!session || session.payment_status !== 'paid') return { settled: false }
  const meta = session.metadata || {}
  if (meta.kind !== 'quote_deposit' || meta.quoteId !== quoteId) return { settled: false }
  const { data: quote } = await db.from('job_quotes').select('id, company_id, job_id, number, deposit_cents, deposit_payment_id, deposit_status').eq('id', quoteId).maybeSingle()
  if (!quote?.deposit_payment_id) return { settled: false }
  // Only the Checkout session Colvy made for this quote's deposit counts, so a
  // session made anywhere else with copied metadata can't mark it paid.
  const { data: pay } = await db.from('chat_payments').select('id, company_id, conversation_id, message_id, amount_cents, stripe_session_id').eq('id', quote.deposit_payment_id).maybeSingle()
  if (!pay || pay.company_id !== quote.company_id || !pay.stripe_session_id || pay.stripe_session_id !== session.id) return { settled: false }
  const paymentId = String(pay.id)
  const now = new Date().toISOString()
  const { data: claimed } = await db.from('job_quotes').update({ deposit_status: 'paid', deposit_paid_at: now, updated_at: now })
    .eq('id', quoteId).in('deposit_status', ['none', 'requested']).select('id')
  const pi = (typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id) || null
  const card = session?.payment_intent?.latest_charge?.payment_method_details?.card || null
  const { confirmChatPayment } = await import('@/lib/chat-payment-confirm')
  await confirmChatPayment(db, pay, { receiptUrl: session?.payment_intent?.latest_charge?.receipt_url || session?.receipt_url || null, paymentIntent: pi, cardBrand: card?.brand || null, cardLast4: card?.last4 || null })
  const settled = Array.isArray(claimed) && claimed.length > 0
  if (settled) {
    const amount = Number(session.amount_total ?? quote.deposit_cents)
    await logJobEvent(db, {
      companyId: quote.company_id, jobId: quote.job_id, quoteId, type: 'deposit_paid', actorType: 'customer',
      summary: `Deposit of ${fmtMoney(amount)} paid`, data: { amount_cents: amount, payment_id: paymentId || null },
    })
    const pf = companySettings(await loadCompany(db, quote.company_id)).quote_prefix
    emitJobEvent(quote.company_id, 'quote.deposit_paid', { title: `Deposit paid on quote ${pf}-${quote.number}`, summary: fmtMoney(amount), jobId: quote.job_id, dedupeKey: `quote_deposit:${quoteId}` }, db)
  }
  return { settled }
}

/** Ask Stripe whether the deposit session on the quote page's return was paid. */
export async function verifyQuoteDeposit(db: any, company: any, quote: any, sessionId: string): Promise<{ paid: boolean }> {
  if (!sessionId || !/^cs_[A-Za-z0-9_]+$/.test(sessionId)) return { paid: false }
  const { data: pay } = quote.deposit_payment_id ? await db.from('chat_payments').select('stripe_session_id').eq('id', quote.deposit_payment_id).maybeSingle() : { data: null }
  // Only the session Colvy made for this quote's deposit.
  if (!pay?.stripe_session_id || pay.stripe_session_id !== sessionId) return { paid: false }
  const { chatStripe } = await import('@/lib/chat-checkout')
  const { s, connectOpts } = await chatStripe(company)
  const session: any = await s.checkout.sessions.retrieve(sessionId, { expand: ['payment_intent.latest_charge'] } as any, connectOpts)
  if (session?.payment_status !== 'paid') return { paid: false }
  await settleQuoteDeposit(db, quote.id, session)
  return { paid: true }
}
