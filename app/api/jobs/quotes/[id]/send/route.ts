import { NextRequest } from 'next/server'
import { audit } from '@/lib/activity-logging'
import { internalHeaders } from '@/lib/internal-call'
import { sendCustomerEmail } from '@/lib/customer-email'
import { isExternalSendBlocked } from '@/lib/demo-guard'
import { fmtMoney } from '@/lib/jobs/quote-math'
import {
  jobsDb, jobsAccess, json, setupNeeded, isMissingJobsSchema, isUuid, logJobEvent, emitJobEvent,
  loadCompany, companySettings, companyTz, quoteDefaults, quoteUrl, quoteMessage, newPublicToken, clip,
} from '@/lib/jobs/server'
import { moneyAllowed, MONEY_DENIED } from '@/lib/jobs/field'

export const dynamic = 'force-dynamic'

// POST { companyId, channel: 'sms' | 'email' | 'link', message?, to?, subject?, preview? }
// Send a quote: give it its private link, mark it Sent, move the job to
// Awaiting approval, and text or email the customer (or just hand back the
// link to share another way). A newer revision replaces the older one still
// out. Sending again (a reminder) keeps it Sent. preview: true returns the
// message and where it would go, sending nothing.

type Ctx = { params: Promise<{ id: string }> }
const esc = (s: string) => String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as any)[c])

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params
    const db = jobsDb()
    const body = await req.json().catch(() => ({}))
    const companyId = String(body.companyId || '')
    const access = await jobsAccess(req, db, companyId)
    if (!access.ok) return access.response
    if (!(await moneyAllowed(db, access, String(companyId)))) return json({ error: MONEY_DENIED }, 403)
    if (!isUuid(id)) return json({ error: 'Quote not found.' }, 404)
    const channel = ['sms', 'email', 'link'].includes(body.channel) ? body.channel as 'sms' | 'email' | 'link' : 'link'

    const { data: quote, error } = await db.from('job_quotes').select('*').eq('company_id', companyId).eq('id', id).maybeSingle()
    if (error) { if (isMissingJobsSchema(error)) return setupNeeded(); throw error }
    if (!quote) return json({ error: 'Quote not found.' }, 404)
    if (quote.status !== 'draft' && quote.status !== 'sent') return json({ error: `This quote is ${quote.status}, so it can’t be sent. Start a revision instead.` }, 409)
    if (!Array.isArray(quote.items) || !quote.items.length) return json({ error: 'Add at least one line before sending.' }, 400)

    const { data: job } = await db.from('jobs').select('id, number, title, status, contact_id, conversation_id').eq('company_id', companyId).eq('id', quote.job_id).maybeSingle()
    if (!job) return json({ error: 'Job not found.' }, 404)
    if (job.status === 'cancelled' || job.status === 'completed') return json({ error: 'Reopen the job before sending a quote.' }, 409)
    const company = await loadCompany(db, companyId)
    const settings = companySettings(company)
    const tz = companyTz(company)
    const label = `${settings.quote_prefix}-${quote.number}${quote.revision > 1 ? ` (rev ${quote.revision})` : ''}`
    const { data: contact } = job.contact_id ? await db.from('contacts').select('id, name, email, phone').eq('company_id', companyId).eq('id', job.contact_id).maybeSingle() : { data: null }

    const token = quote.public_token || newPublicToken()
    const url = quoteUrl(company, token)
    const to = clip(body.to, 200) || (channel === 'sms' ? contact?.phone : channel === 'email' ? contact?.email : '') || ''
    const message = clip(body.message, 1500) || quoteMessage({ company, contact, quote, url, prefix: settings.quote_prefix })
    const subject = clip(body.subject, 200) || `Your quote ${label} from ${company?.name || 'us'}`
    if (body.preview) return json({ to, message, subject, url })

    if (channel !== 'link') {
      if (!to) return json({ error: channel === 'sms' ? 'Add a mobile number for this customer first.' : 'Add an email address for this customer first.' }, 400)
      if (!message.includes(url)) return json({ error: 'Keep the quote link in the message so they can open it.' }, 400)
      if (await isExternalSendBlocked(companyId, db)) return json({ error: 'Sending is switched off in this demo workspace. Copy the link instead.' }, 403)
    }

    // 1. The link and the Sent status first (compare-and-set), so the
    //    customer never gets a link to a quote that isn't open yet.
    const now = new Date().toISOString()
    const patch: any = { public_token: token, updated_at: now, sent_at: quote.sent_at || now, sent_via: channel }
    if (quote.status === 'draft') { patch.status = 'sent'; if (!quote.valid_until) patch.valid_until = quoteDefaults(settings, tz).valid_until }
    const { data: sent, error: sErr } = await db.from('job_quotes').update(patch).eq('company_id', companyId).eq('id', id).eq('status', quote.status).select('*')
    if (sErr) throw sErr
    if (!sent?.length) return json({ error: 'Someone else just changed this quote. Refresh and try again.' }, 409)
    const wasDraft = quote.status === 'draft'

    if (wasDraft) {
      // An older revision of this quote still out is replaced by this one.
      if (quote.revision > 1) await db.from('job_quotes').update({ status: 'withdrawn', updated_at: now }).eq('company_id', companyId).eq('job_id', job.id).eq('number', quote.number).eq('status', 'sent').neq('id', id)
      if (['new', 'quoting'].includes(job.status)) await db.from('jobs').update({ status: 'awaiting_approval', updated_at: now }).eq('company_id', companyId).eq('id', job.id).eq('status', job.status)
      else await db.from('jobs').update({ updated_at: now }).eq('company_id', companyId).eq('id', job.id)
    }

    // 2. Deliver it.
    let delivered = channel === 'link', deliveryError = ''
    if (channel === 'sms') {
      try {
        const r = await fetch(`${req.nextUrl.origin}/api/telnyx/sms/send`, {
          method: 'POST', headers: internalHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ companyId, conversationId: job.conversation_id || undefined, to, text: message, senderName: access.name }),
        })
        const d: any = await r.json().catch(() => ({}))
        delivered = r.ok && d?.ok !== false
        if (!delivered) deliveryError = d?.optedOut ? 'This customer has opted out of texts. Email the quote or copy the link.' : (d?.error || `The text didn’t send (${r.status}).`)
      } catch (e: any) { deliveryError = e?.message || 'The text didn’t send.' }
    } else if (channel === 'email') {
      const accent = /^#[0-9a-f]{3,8}$/i.test(String(company?.accent_color || '')) ? company.accent_color : '#111111'
      const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#111">
<p style="font-size:15px;line-height:1.6;white-space:pre-line">${esc(message.replace(url, '').trim())}</p>
<p style="margin:24px 0"><a href="${esc(url)}" style="display:inline-block;background:${accent};color:#fff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:999px">View quote ${esc(label)} · ${esc(fmtMoney(quote.total_cents))}</a></p>
<p style="font-size:12px;color:#777">Or open this link: ${esc(url)}</p></div>`
      delivered = await sendCustomerEmail(db, company, { to, subject, text: message, html })
      if (!delivered) deliveryError = 'The email didn’t send. Check the email settings, or copy the link instead.'
    }

    const via = channel === 'sms' ? 'by text' : channel === 'email' ? 'by email' : 'as a link'
    const summary = `${wasDraft ? 'Sent' : 'Re-sent'} quote ${label} ${via}${channel !== 'link' && to ? ` to ${to}` : ''} (${fmtMoney(quote.total_cents)})${delivered ? '' : ' — delivery failed'}`
    await logJobEvent(db, { companyId, jobId: job.id, quoteId: id, type: wasDraft ? 'quote_sent' : 'quote_resent', actorId: access.userId, actorName: access.name, summary, data: { channel, to: to || null, delivered, error: deliveryError || null } })
    await audit(req, db, companyId, 'quote_sent', summary, { job_id: job.id, quote_id: id, channel })
    if (wasDraft) {
      emitJobEvent(companyId, 'quote.sent', {
        title: `Quote ${label} sent`, summary: `${job.title} · ${fmtMoney(quote.total_cents)}`, jobId: job.id,
        customer: contact ? { name: contact.name, email: contact.email, phone: contact.phone } : null,
        fields: { Total: fmtMoney(quote.total_cents), Via: channel }, dedupeKey: `quote.sent:${id}`,
      }, db)
    }
    return json({ quote: sent[0], url, delivered, warning: deliveryError || null })
  } catch (e: any) {
    if (isMissingJobsSchema(e)) return setupNeeded()
    return json({ error: e?.message || 'Could not send the quote.' }, 500)
  }
}
