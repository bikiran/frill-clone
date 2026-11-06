import { NextRequest } from 'next/server'
import { audit } from '@/lib/activity-logging'
import { checkBurst, callerKey } from '@/lib/rate-limit'
import { requestIp } from '@/lib/turnstile'
import { stripeReady } from '@/lib/booking'
import { cleanLines, fmtMoney } from '@/lib/jobs/quote-math'
import {
  jobsDb, json, setupNeeded, isMissingJobsSchema, logJobEvent, emitJobEvent, loadCompany, companySettings,
  companyTz, todayIn, quoteDepositCheckout, verifyQuoteDeposit, clip,
} from '@/lib/jobs/server'

export const dynamic = 'force-dynamic'

// The customer's quote link (/q/<token>). No sign-in: the long random token in
// the link is the key, so only what the customer needs is returned.
//   GET   ?session_id   the quote (marks it viewed); after paying a deposit,
//                       asks Stripe whether that payment went through
//   POST  { action: 'accept' | 'decline' | 'deposit', name, note, agree }

type Ctx = { params: Promise<{ token: string }> }
const TOKEN = /^[A-Za-z0-9_-]{24,64}$/

async function load(db: any, token: string) {
  if (!TOKEN.test(token)) return null
  const { data: quote, error } = await db.from('job_quotes').select('*').eq('public_token', token).maybeSingle()
  if (error) throw error
  if (!quote || quote.status === 'draft') return null
  const [{ data: job }, company] = await Promise.all([
    db.from('jobs').select('id, number, title, status, address, scheduled_start, scheduled_end, contact_id, conversation_id').eq('company_id', quote.company_id).eq('id', quote.job_id).maybeSingle(),
    loadCompany(db, quote.company_id),
  ])
  if (!job || !company) return null
  return { quote, job, company }
}

function view(q: any, job: any, company: any, contact: any) {
  const settings = companySettings(company)
  const tz = companyTz(company)
  const today = todayIn(tz)
  const expired = q.status === 'sent' && !!q.valid_until && q.valid_until < today
  return {
    business: {
      name: company.name, logo_url: company.logo_url || null, accent_color: company.accent_color || null,
      abn: company.abn_acn || null, phone: company.business_mobile || null, email: company.business_email || null,
      address: company.business_address || null, website: company.website || null,
    },
    quote: {
      label: `${settings.quote_prefix}-${q.number}${q.revision > 1 ? ` (rev ${q.revision})` : ''}`,
      status: q.status, expired, title: q.title, intro: q.intro, terms: q.terms,
      items: cleanLines(q.items).map((l: any) => ({ ...l, line_total_cents: Math.round(l.quantity * l.unit_price_cents) })),
      discount_type: q.discount_type, discount_value: Number(q.discount_value),
      prices_include_tax: q.prices_include_tax, tax_rate: Number(q.tax_rate), gst_registered: settings.gst_registered,
      gross_cents: Number(q.gross_cents), discount_cents: Number(q.discount_cents), subtotal_cents: Number(q.subtotal_cents),
      tax_cents: Number(q.tax_cents), total_cents: Number(q.total_cents),
      deposit_cents: Number(q.deposit_cents), deposit_status: q.deposit_status,
      valid_until: q.valid_until, sent_at: q.sent_at, accepted_at: q.accepted_at, declined_at: q.declined_at, decided_name: q.decided_name,
    },
    job: { title: job.title, address: job.address, scheduled_start: job.scheduled_start, scheduled_end: job.scheduled_end },
    customer: contact ? { name: contact.name || null } : null,
    timezone: tz,
    paymentsReady: stripeReady(company),
  }
}

export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const { token } = await ctx.params
    if (!checkBurst(`q-view:${callerKey(req)}`, 60)) return json({ error: 'Too many requests. Please wait a minute.' }, 429)
    const db = jobsDb()
    const hit = await load(db, token)
    if (!hit) return json({ error: 'This quote link isn’t valid. Ask the business to send it again.' }, 404)
    let { quote } = hit
    const { job, company } = hit

    // Back from paying the deposit: ask Stripe (never trust the return alone).
    const sessionId = req.nextUrl.searchParams.get('session_id') || ''
    let paid = false
    if (sessionId && quote.deposit_status !== 'paid') {
      try { paid = (await verifyQuoteDeposit(db, company, quote, sessionId)).paid } catch {}
      if (paid) { const { data } = await db.from('job_quotes').select('*').eq('id', quote.id).maybeSingle(); if (data) quote = data }
    }

    // First open by the customer.
    if (!quote.viewed_at && quote.status === 'sent' && req.nextUrl.searchParams.get('preview') !== '1') {
      const now = new Date().toISOString()
      const { data: first } = await db.from('job_quotes').update({ viewed_at: now }).eq('id', quote.id).is('viewed_at', null).select('id')
      if (first?.length) {
        quote.viewed_at = now
        const settings = companySettings(company)
        await logJobEvent(db, { companyId: quote.company_id, jobId: job.id, quoteId: quote.id, type: 'quote_viewed', actorType: 'customer', summary: `Customer opened quote ${settings.quote_prefix}-${quote.number}` })
      }
    }
    const { data: contact } = job.contact_id ? await db.from('contacts').select('name').eq('id', job.contact_id).eq('company_id', quote.company_id).maybeSingle() : { data: null }
    return json({ ...view(quote, job, company, contact), justPaid: paid })
  } catch (e: any) {
    if (isMissingJobsSchema(e)) return setupNeeded()
    return json({ error: 'This quote couldn’t be loaded. Please try again.' }, 500)
  }
}

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const { token } = await ctx.params
    if (!checkBurst(`q-act:${callerKey(req)}`, 10)) return json({ error: 'Too many requests. Please wait a minute.' }, 429)
    const body = await req.json().catch(() => ({}))
    const db = jobsDb()
    const hit = await load(db, token)
    if (!hit) return json({ error: 'This quote link isn’t valid. Ask the business to send it again.' }, 404)
    const { quote, job, company } = hit
    const settings = companySettings(company)
    const label = `${settings.quote_prefix}-${quote.number}${quote.revision > 1 ? ` (rev ${quote.revision})` : ''}`
    const action = String(body.action || '')

    if (action === 'accept' || action === 'decline') {
      const name = clip(body.name, 120).replace(/[\p{Cc}\p{Cf}]/gu, '')
      const note = clip(body.note, 1000)
      if (action === 'accept') {
        if (name.length < 2) return json({ error: 'Please type your full name to accept.' }, 400)
        if (body.agree !== true) return json({ error: 'Please tick the box to agree to the quote and its terms.' }, 400)
      }
      const ip = requestIp(req.headers) || null
      const { data: r, error } = await db.rpc('colvy_quote_decide', {
        p_quote: null, p_token: token, p_decision: action, p_name: name || null, p_note: note || null,
        p_ip: ip, p_ua: clip(req.headers.get('user-agent'), 300) || null, p_actor_type: 'customer', p_actor_id: null, p_actor_name: name || null,
        p_today: todayIn(companyTz(company)),
      })
      if (error) { if (isMissingJobsSchema(error)) return setupNeeded(); throw error }
      if (!r?.ok) {
        const msg = r?.reason === 'expired' ? 'This quote has expired. Ask the business for an updated quote.'
          : r?.reason === 'not_open' ? (r.status === 'withdrawn' ? 'This quote has been replaced or withdrawn. Ask the business for the latest one.' : `This quote has already been ${r.status}.`)
          : 'This quote link isn’t valid.'
        return json({ error: msg }, 409)
      }
      if (!r.already) {
        const how = action === 'accept' ? 'accepted' : 'declined'
        await audit(req, db, quote.company_id, 'quote_decided', `Customer ${how} quote ${label}${name ? ` (${name})` : ''} — ${fmtMoney(quote.total_cents)}`, { quote_id: quote.id, job_id: job.id, decision: action, by: 'customer' })
        emitJobEvent(quote.company_id, action === 'accept' ? 'quote.accepted' : 'quote.declined', {
          title: `Quote ${label} ${how}`, summary: `${job.title} · ${fmtMoney(quote.total_cents)}${note ? ` · “${note.slice(0, 200)}”` : ''}`, jobId: job.id,
          fields: { By: name || 'Customer', Total: fmtMoney(quote.total_cents) }, dedupeKey: `quote.${action}:${quote.id}`,
        }, db)
      }
      // Accepted with a deposit to pay: straight to the card payment.
      let depositUrl: string | null = null
      if (action === 'accept' && Number(quote.deposit_cents) > 0 && quote.deposit_status !== 'paid' && stripeReady(company)) {
        const fresh = { ...quote, status: 'accepted' }
        const d = await quoteDepositCheckout(db, company, fresh, job).catch(() => null)
        if (d && 'url' in d) depositUrl = d.url
      }
      const { data: q2 } = await db.from('job_quotes').select('*').eq('id', quote.id).maybeSingle()
      const { data: contact } = job.contact_id ? await db.from('contacts').select('name').eq('id', job.contact_id).eq('company_id', quote.company_id).maybeSingle() : { data: null }
      return json({ ...view(q2 || quote, job, company, contact), depositUrl })
    }

    if (action === 'deposit') {
      if (quote.status !== 'accepted') return json({ error: 'Accept the quote first, then pay the deposit.' }, 409)
      const d = await quoteDepositCheckout(db, company, quote, job)
      if ('error' in d) return json({ error: d.error }, d.status)
      return json({ depositUrl: d.url })
    }

    return json({ error: 'Unknown action.' }, 400)
  } catch (e: any) {
    if (isMissingJobsSchema(e)) return setupNeeded()
    return json({ error: 'Something went wrong. Please try again, or contact the business.' }, 500)
  }
}
