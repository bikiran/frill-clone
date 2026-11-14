// Invoices for Jobs & Services (migrations/COLVY_V434_JOB_INVOICES.sql): the
// money, sending (text or email, with the same layout as quotes), card
// payment through Colvy's payment links (chat_payments + Stripe Checkout, kind
// 'job_invoice'), recorded cash and bank transfers, and reminders when an
// invoice is overdue. What's been paid is always the sum of the invoice's
// payment rows (colvy_invoice_payment), so nothing is counted twice.

import { internalHeaders } from '@/lib/internal-call'
import { companyBase, stripeReady } from '@/lib/booking'
import { addDays } from '@/lib/booking-time'
import { fmtMoney, cleanLines } from '@/lib/jobs/quote-math'
import type { JobSettings } from '@/lib/jobs/settings'
import { companySettings, companyTz, todayIn, loadCompany, logJobEvent, emitJobEvent, json } from '@/lib/jobs/server'

export const INVOICE_HINT = 'Invoices need a database update: run migrations/COLVY_V434_JOB_INVOICES.sql in the Supabase SQL editor.'
export const invoicesSetupNeeded = () => json({ setupNeeded: true, error: INVOICE_HINT }, 503)

/** The invoice tables or functions aren't there yet (V434 not run). */
export function isMissingInvoiceSchema(e: any): boolean {
  const m = `${e?.message || ''} ${e?.code || ''} ${e?.details || ''} ${e?.hint || ''}`
  return /42P01|42703|PGRST205|PGRST202|PGRST204|does not exist|could not find the|schema cache/i.test(m)
    && /job_invoice|colvy_invoice_payment|last_invoice/i.test(m)
}

export const invoiceUrl = (company: any, token: string) => `${companyBase(company).base}/i/${token}`
export const invoiceLabel = (settings: JobSettings, number: number) => `${settings.invoice_prefix}-${number}`

/** What's still to pay: the total, less a deposit already paid and payments since. */
export const balanceOf = (inv: any) => Math.max(0, Number(inv?.total_cents || 0) - Number(inv?.credit_cents || 0) - Number(inv?.paid_cents || 0))
/** What the invoice asks for, before any payments against it. */
export const amountDueOf = (inv: any) => Math.max(0, Number(inv?.total_cents || 0) - Number(inv?.credit_cents || 0))
export const isOverdue = (inv: any, today: string) => inv?.status === 'sent' && !!inv?.due_date && String(inv.due_date) < today && balanceOf(inv) > 0

/** "21 November 2026" from 2026-11-21. */
export const longDate = (ymd: string | null | undefined) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(ymd || ''))
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).toLocaleDateString('en-AU', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' }) : ''
}
/** "21 November" (no year), for texts. */
const shortDate = (ymd: string | null | undefined) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(ymd || ''))
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).toLocaleDateString('en-AU', { timeZone: 'UTC', day: 'numeric', month: 'long' }) : ''
}

export function invoiceDefaults(settings: JobSettings, tz: string) {
  const today = todayIn(tz)
  return { issue_date: today, due_date: addDays(today, settings.payment_terms_days), terms: settings.invoice_payment_details || '' }
}

const firstName = (name: any) => String(name || '').trim().split(/\s+/)[0] || ''

export type InvoiceMessageKind = 'invoice' | 'reminder'

/** The text an invoice (or a reminder) goes out with; editable in the send dialog. */
export function invoiceMessage(o: { company: any; contact: any; invoice: any; url: string; prefix: string; kind?: InvoiceMessageKind; today?: string }) {
  const hi = firstName(o.contact?.name) ? `Hi ${firstName(o.contact.name)}, ` : 'Hi, '
  const label = `${o.prefix}-${o.invoice.number}`
  const from = o.company?.name || 'us'
  const owing = balanceOf(o.invoice)
  const due = o.invoice.due_date ? shortDate(o.invoice.due_date) : ''
  if (owing <= 0 && o.invoice.status !== 'draft') return `${hi}here's your invoice ${label} from ${from}. It's all paid, thank you. View it here: ${o.url}`
  if (o.kind === 'reminder') {
    const today = o.today || ''
    const late = !!due && !!today && String(o.invoice.due_date) < today
    const when = !due ? '' : late ? ` was due on ${due}` : String(o.invoice.due_date) === today ? ' is due today' : ` is due on ${due}`
    return `${hi}a friendly reminder that invoice ${label} from ${from} for ${fmtMoney(owing)}${when}. If you've already paid, thank you and please ignore this. View and pay it here: ${o.url}`
  }
  return `${hi}here's your invoice ${label} from ${from} for ${fmtMoney(owing)}${due ? `, due ${due}` : ''}. View and pay it here: ${o.url}`
}

/**
 * Text or email the customer the invoice (or a reminder). Returns whether it
 * went. The caller has already checked the invoice can be sent.
 */
export async function deliverInvoice(db: any, o: {
  origin: string; company: any; invoice: any; job: any; contact: any; channel: 'sms' | 'email'
  to: string; message: string; subject: string; url: string; senderName?: string | null; kind: 'new' | 'resent' | 'reminder'; today: string
}): Promise<{ delivered: boolean; error: string }> {
  const companyId = o.company.id
  if (o.channel === 'sms') {
    try {
      const r = await fetch(`${o.origin}/api/telnyx/sms/send`, {
        method: 'POST', headers: internalHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ companyId, conversationId: o.job?.conversation_id || undefined, to: o.to, text: o.message, senderName: o.senderName || undefined }),
      })
      const d: any = await r.json().catch(() => ({}))
      const delivered = r.ok && d?.ok !== false
      return { delivered, error: delivered ? '' : d?.optedOut ? 'This customer has opted out of texts. Email the invoice or copy the link.' : (d?.error || `The text didn’t send (${r.status}).`) }
    } catch (e: any) { return { delivered: false, error: e?.message || 'The text didn’t send.' } }
  }
  try {
    const { sendCustomerEmail } = await import('@/lib/customer-email')
    const { invoiceEmailHtml } = await import('@/lib/booking-email')
    const { hidesPoweredBy } = await import('@/lib/branding')
    const { accountLink } = await import('@/lib/portal/auth')
    const settings = companySettings(o.company)
    const label = invoiceLabel(settings, o.invoice.number)
    // The team's words without the link (the email has a button for it).
    const words = o.message.split(o.url).join('').replace(/\s*(view and pay it here|view it here|pay it here|open it here)\s*:?\s*$/i, '').replace(/[\s:]+$/, '').trim()
    const owing = balanceOf(o.invoice)
    const accountUrl = o.job?.contact_id ? await accountLink(db, o.company, { i: o.invoice.public_token }) : null
    const overdue = !!o.invoice.due_date && String(o.invoice.due_date) < o.today
    const html = invoiceEmailHtml({
      business: o.company?.name || 'us', logoUrl: o.company?.logo_url || null, accent: o.company?.accent_color || null,
      hideBadge: await hidesPoweredBy(db, companyId, o.company).catch(() => false),
      message: words, label, title: o.invoice.title || o.job?.title || null, due: fmtMoney(owing),
      dueDate: o.invoice.due_date ? longDate(o.invoice.due_date) : null, url: o.url, accountUrl,
      kind: owing <= 0 ? 'paid' : o.kind === 'reminder' ? (overdue ? 'overdue' : 'reminder') : o.kind,
    })
    const delivered = await sendCustomerEmail(db, o.company, { to: o.to, subject: o.subject, text: accountUrl ? `${o.message}\n\nYour account: ${accountUrl}` : o.message, html })
    return { delivered, error: delivered ? '' : 'The email didn’t send. Check the email settings, or copy the link instead.' }
  } catch (e: any) { return { delivered: false, error: e?.message || 'The email didn’t send.' } }
}

// ── Payments ─────────────────────────────────────────────────────────────────

export type PaymentResult = { ok: boolean; reason?: string; already?: boolean; status?: string; just_paid?: boolean; paid_cents?: number; balance_cents?: number; amount_cents?: number; row_id?: string }

/** Add a payment (or remove a recorded one) through colvy_invoice_payment, under the invoice's lock. */
export async function invoicePayment(db: any, p: {
  invoiceId: string; action: 'add' | 'remove'; cents?: number; method?: string; paymentId?: string | null; rowId?: string | null
  note?: string | null; paidOn?: string | null; actorId?: string | null; actorName?: string | null
}): Promise<PaymentResult> {
  const { data, error } = await db.rpc('colvy_invoice_payment', {
    p_invoice: p.invoiceId, p_action: p.action, p_cents: p.cents ?? null, p_method: p.method || null, p_payment: p.paymentId || null,
    p_row: p.rowId || null, p_note: p.note || null, p_paid_on: p.paidOn || null, p_actor: p.actorId || null, p_actor_name: p.actorName || null,
  })
  if (error) throw error
  return (data || { ok: false, reason: 'no_reply' }) as PaymentResult
}

export const PAYMENT_METHODS = ['cash', 'bank_transfer', 'card', 'cheque', 'other'] as const
export const METHOD_LABEL: Record<string, string> = { cash: 'Cash', bank_transfer: 'Bank transfer', card: 'Card', cheque: 'Cheque', other: 'Other' }

/** After a payment lands: the timeline entry, and the team's alert when it's now paid in full. */
export async function afterPayment(db: any, company: any, inv: any, r: PaymentResult, o: { amount: number; method: string; actorType: 'staff' | 'customer'; actorId?: string | null; actorName?: string | null }) {
  const settings = companySettings(company)
  const label = invoiceLabel(settings, inv.number)
  const how = o.method === 'card' && o.actorType === 'customer' ? 'paid by card' : `recorded (${METHOD_LABEL[o.method] || 'Other'})`
  await logJobEvent(db, {
    companyId: inv.company_id, jobId: inv.job_id, type: r.just_paid ? 'invoice_paid' : 'invoice_payment', actorType: o.actorType, actorId: o.actorId || null, actorName: o.actorName || null,
    summary: `${fmtMoney(o.amount)} ${how} on invoice ${label}${r.just_paid ? ' · paid in full' : r.balance_cents ? ` · ${fmtMoney(r.balance_cents)} still owing` : ''}`,
    data: { invoice_id: inv.id, amount_cents: o.amount, method: o.method, balance_cents: r.balance_cents ?? null },
  })
  if (r.just_paid) {
    emitJobEvent(inv.company_id, 'invoice.paid', {
      title: `Invoice ${label} paid`, summary: fmtMoney(amountDueOf(inv)), jobId: inv.job_id,
      fields: { Amount: fmtMoney(amountDueOf(inv)), Via: METHOD_LABEL[o.method] || o.method }, dedupeKey: `invoice.paid:${inv.id}`,
    }, db)
  }
}

/**
 * A card payment link for what's owing, through chat_payments (kind
 * 'job_invoice'). Reuses the open link while it's for the same amount and
 * not about to expire. The payment only counts when Stripe says so: the
 * webhook, or the invoice page asking Stripe on the way back.
 */
export async function invoicePayCheckout(db: any, company: any, inv: any, job: any): Promise<{ url: string } | { error: string; status: number }> {
  if (inv.status !== 'sent') return { error: inv.status === 'paid' ? 'This invoice is already paid.' : 'This invoice isn’t open for payment.', status: 409 }
  const owing = balanceOf(inv)
  if (owing <= 0) return { error: 'Nothing is owing on this invoice.', status: 409 }
  if (owing < 50) return { error: 'The amount owing is too small to pay by card.', status: 409 }
  if (!stripeReady(company)) return { error: 'Card payments aren’t set up for this business yet.', status: 409 }

  if (inv.pay_payment_id) {
    const { data: pay } = await db.from('chat_payments').select('id, status, checkout_url, amount_cents, created_at').eq('id', inv.pay_payment_id).maybeSingle()
    if (pay?.status === 'pending' && pay.checkout_url && Number(pay.amount_cents) === owing && Date.now() - Date.parse(pay.created_at) < 23 * 3600_000 - 10 * 60_000) return { url: pay.checkout_url }
  }

  const settings = companySettings(company)
  const label = invoiceLabel(settings, inv.number)
  const description = `Invoice ${label}${inv.title ? ` — ${inv.title}` : ''}`.slice(0, 200)
  const { data: pay, error } = await db.from('chat_payments').insert({
    company_id: company.id, conversation_id: job?.conversation_id || null, message_id: null,
    amount_cents: owing, currency: 'aud', description, status: 'pending',
  }).select('id').maybeSingle()
  if (error || !pay?.id) return { error: 'Couldn’t create the payment link. Please try again.', status: 500 }

  const url = invoiceUrl(company, inv.public_token)
  let customerEmail: string | undefined
  if (job?.contact_id) {
    const { data: c } = await db.from('contacts').select('email').eq('id', job.contact_id).maybeSingle()
    if (c?.email) customerEmail = c.email
  }
  const { createChatCheckoutSession } = await import('@/lib/chat-checkout')
  const session = await createChatCheckoutSession(company, {
    cents: owing, currency: 'aud', description, companyId: company.id,
    conversationId: job?.conversation_id || '', kind: 'job_invoice',
    extraMetadata: { invoiceId: inv.id, paymentId: pay.id, jobId: job?.id || '' },
    successUrl: `${url}?paid=1&session_id={CHECKOUT_SESSION_ID}`, cancelUrl: `${url}?payment=cancelled`,
    pageUrl: url, expiresAt: Math.floor(Date.now() / 1000) + 23 * 3600, customerEmail,
  })
  await db.from('chat_payments').update({ stripe_session_id: session.id, checkout_url: session.url }).eq('id', pay.id)
  await db.from('job_invoices').update({ pay_payment_id: pay.id, updated_at: new Date().toISOString() }).eq('id', inv.id)
  return { url: String(session.url) }
}

/**
 * Close the invoice's open card payment link (when it's voided), so it can't
 * be paid any more. Best effort: if Stripe can't be reached the link simply
 * runs out within a day, and a payment through it is still recorded in
 * Payments (just not against a void invoice).
 */
export async function closeInvoicePayLink(db: any, company: any, inv: any) {
  if (!inv?.pay_payment_id) return
  try {
    const { data: pay } = await db.from('chat_payments').select('id, status, stripe_session_id').eq('id', inv.pay_payment_id).maybeSingle()
    if (!pay || pay.status !== 'pending' || !pay.stripe_session_id) return
    const { chatStripe } = await import('@/lib/chat-checkout')
    const { s, connectOpts } = await chatStripe(company)
    await s.checkout.sessions.expire(pay.stripe_session_id, {}, connectOpts)
    await db.from('chat_payments').update({ status: 'failed' }).eq('id', pay.id).eq('status', 'pending')
  } catch {}
}

/**
 * Settle a paid card payment on an invoice, once. Called by the Stripe webhook
 * (kind 'job_invoice'), the payments reconciler and verifyInvoicePayment.
 * Only the Checkout session Colvy made for this invoice counts.
 */
export async function settleInvoicePayment(db: any, invoiceId: string, session: any): Promise<{ settled: boolean }> {
  if (!session || session.payment_status !== 'paid') return { settled: false }
  const meta = session.metadata || {}
  if (meta.kind !== 'job_invoice' || meta.invoiceId !== invoiceId || !meta.paymentId) return { settled: false }
  const { data: inv } = await db.from('job_invoices').select('*').eq('id', invoiceId).maybeSingle()
  if (!inv) return { settled: false }
  const { data: pay } = await db.from('chat_payments').select('id, company_id, conversation_id, message_id, amount_cents, stripe_session_id').eq('id', String(meta.paymentId)).maybeSingle()
  if (!pay || pay.company_id !== inv.company_id || !pay.stripe_session_id || pay.stripe_session_id !== session.id) return { settled: false }

  const pi = (typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id) || null
  const card = session?.payment_intent?.latest_charge?.payment_method_details?.card || null
  const { confirmChatPayment } = await import('@/lib/chat-payment-confirm')
  await confirmChatPayment(db, pay, { receiptUrl: session?.payment_intent?.latest_charge?.receipt_url || session?.receipt_url || null, paymentIntent: pi, cardBrand: card?.brand || null, cardLast4: card?.last4 || null })

  const amount = Number(session.amount_total ?? pay.amount_cents) || 0
  if (amount <= 0) return { settled: false }
  const r = await invoicePayment(db, { invoiceId, action: 'add', cents: amount, method: 'card', paymentId: pay.id, note: card?.last4 ? `${card.brand || 'Card'} ending ${card.last4}` : null, actorName: 'Customer' })
  if (!r.ok || r.already) return { settled: false }
  const company = await loadCompany(db, inv.company_id)
  await afterPayment(db, company, inv, r, { amount, method: 'card', actorType: 'customer' })
  return { settled: true }
}

/** Ask Stripe whether the payment the customer just came back from went through. */
export async function verifyInvoicePayment(db: any, company: any, inv: any, sessionId: string): Promise<{ paid: boolean }> {
  if (!sessionId || !/^cs_[A-Za-z0-9_]+$/.test(sessionId)) return { paid: false }
  const { data: pay } = await db.from('chat_payments').select('id, stripe_session_id').eq('stripe_session_id', sessionId).eq('company_id', inv.company_id).maybeSingle()
  if (!pay?.stripe_session_id) return { paid: false }
  const { chatStripe } = await import('@/lib/chat-checkout')
  const { s, connectOpts } = await chatStripe(company)
  const session: any = await s.checkout.sessions.retrieve(sessionId, { expand: ['payment_intent.latest_charge'] } as any, connectOpts)
  if (session?.payment_status !== 'paid' || session?.metadata?.invoiceId !== inv.id) return { paid: false }
  await settleInvoicePayment(db, inv.id, session)
  return { paid: true }
}

// ── Reminders ────────────────────────────────────────────────────────────────

/** Days after the due date that an overdue invoice is chased. */
export const REMINDER_DAYS = [1, 7, 14] as const

/** Which reminder (0-based) is due today for this invoice, or -1 for none. */
export function reminderDue(inv: any, today: string): number {
  if (inv?.status !== 'sent' || !inv?.reminders || !inv?.due_date || balanceOf(inv) <= 0) return -1
  const n = Number(inv.reminder_count || 0)
  if (n >= REMINDER_DAYS.length) return -1
  const dueOn = addDays(String(inv.due_date).slice(0, 10), REMINDER_DAYS[n])
  if (today < dueOn) return -1
  // At most one a day, even when catching up.
  if (inv.last_reminder_at && String(inv.last_reminder_at).slice(0, 10) >= today) return -1
  return n
}

/**
 * The daily sweep (/api/cron/invoice-reminders): text (or email) each overdue
 * invoice's customer on the reminder days, for businesses that have reminders
 * on. Claims each reminder before sending, so two runs never send it twice.
 */
export async function runInvoiceReminders(db: any, origin: string, opts?: { limit?: number }): Promise<{ checked: number; sent: number; skipped: number; failed: number }> {
  const out = { checked: 0, sent: 0, skipped: 0, failed: 0 }
  const { data: list, error } = await db.from('job_invoices').select('*').eq('status', 'sent').eq('reminders', true).lt('reminder_count', REMINDER_DAYS.length)
    .order('due_date', { ascending: true }).limit(opts?.limit || 300)
  if (error) { if (isMissingInvoiceSchema(error)) return out; throw error }
  const companies = new Map<string, any>()
  const { isExternalSendBlocked } = await import('@/lib/demo-guard')
  for (const inv of list || []) {
    out.checked++
    try {
      if (!companies.has(inv.company_id)) companies.set(inv.company_id, await loadCompany(db, inv.company_id))
      const company = companies.get(inv.company_id)
      if (!company) { out.skipped++; continue }
      const settings = companySettings(company)
      if (!settings.invoice_reminders) { out.skipped++; continue }
      const today = todayIn(companyTz(company))
      const n = reminderDue(inv, today)
      if (n < 0 || !inv.public_token) { out.skipped++; continue }
      const { data: job } = await db.from('jobs').select('id, title, contact_id, conversation_id, status').eq('id', inv.job_id).eq('company_id', inv.company_id).maybeSingle()
      if (!job?.contact_id) { out.skipped++; continue }
      const { data: contact } = await db.from('contacts').select('id, name, email, phone').eq('id', job.contact_id).eq('company_id', inv.company_id).maybeSingle()
      // Where the invoice last reached them (the send dialog can take an
      // address that isn't on the contact), else what's on the contact.
      const last = await lastDelivery(db, inv)
      const channel: 'sms' | 'email' | null = last ? last.channel
        : inv.sent_via === 'email' && contact?.email ? 'email' : contact?.phone ? 'sms' : contact?.email ? 'email' : null
      if (!channel) { out.skipped++; continue }
      if (await isExternalSendBlocked(inv.company_id, db)) { out.skipped++; continue }

      // Claim this reminder (compare-and-set on the count), then send.
      const now = new Date().toISOString()
      const { data: claimed } = await db.from('job_invoices').update({ reminder_count: n + 1, last_reminder_at: now, updated_at: now })
        .eq('id', inv.id).eq('status', 'sent').eq('reminder_count', Number(inv.reminder_count || 0)).select('id')
      if (!claimed?.length) { out.skipped++; continue }

      const url = invoiceUrl(company, inv.public_token)
      const label = invoiceLabel(settings, inv.number)
      const message = invoiceMessage({ company, contact, invoice: inv, url, prefix: settings.invoice_prefix, kind: 'reminder', today })
      const to = last ? last.to : channel === 'sms' ? contact.phone : contact.email
      const r = await deliverInvoice(db, {
        origin, company, invoice: inv, job, contact, channel, to, message, url, kind: 'reminder', today,
        subject: `Reminder: invoice ${label} from ${company.name || 'us'}`,
      })
      await logJobEvent(db, {
        companyId: inv.company_id, jobId: inv.job_id, type: 'invoice_reminder', actorType: 'system',
        summary: `Reminder ${n + 1} of ${REMINDER_DAYS.length} for overdue invoice ${label} ${channel === 'sms' ? 'texted' : 'emailed'} to ${to} (${fmtMoney(balanceOf(inv))} owing)${r.delivered ? '' : ' — delivery failed'}`,
        data: { invoice_id: inv.id, channel, to, delivered: r.delivered, error: r.error || null, reminder: n + 1 },
      })
      if (r.delivered) out.sent++; else out.failed++
    } catch { out.failed++ }
  }
  return out
}

/** Where the invoice (or its last reminder) was delivered: the channel and address. */
async function lastDelivery(db: any, inv: any): Promise<{ channel: 'sms' | 'email'; to: string } | null> {
  try {
    const { data } = await db.from('job_events').select('type, data, created_at').eq('company_id', inv.company_id).eq('job_id', inv.job_id)
      .in('type', ['invoice_sent', 'invoice_resent', 'invoice_reminder']).order('created_at', { ascending: false }).limit(30)
    const hit = (data || []).find((e: any) => e?.data?.invoice_id === inv.id && e?.data?.delivered && (e.data.channel === 'sms' || e.data.channel === 'email') && e.data.to)
    return hit ? { channel: hit.data.channel, to: String(hit.data.to) } : null
  } catch { return null }
}

/** The invoice's lines with their totals, for the customer's page. */
export const publicLines = (items: any) => cleanLines(items).map((l: any) => ({ ...l, line_total_cents: Math.round(l.quantity * l.unit_price_cents) }))
