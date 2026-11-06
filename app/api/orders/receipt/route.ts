import { NextRequest, NextResponse } from 'next/server'
import { requireCompanyAccess } from '@/lib/company-access'
import { audit } from '@/lib/activity-logging'
import { internalHeaders } from '@/lib/internal-call'
import { sendCustomerEmail } from '@/lib/customer-email'
import { isExternalSendBlocked } from '@/lib/demo-guard'
import { hidesPoweredBy } from '@/lib/branding'
import { shortenUrl } from '@/lib/short-link'
import { checkBurst } from '@/lib/rate-limit'
import { portalDb } from '@/lib/portal/auth'
import { buildReceipt, parseReceiptKey } from '@/lib/portal/receipts'
import { receiptToken, receiptUrl } from '@/lib/portal/receipt-link'
import { receiptEmailHtml } from '@/lib/booking-email'

export const dynamic = 'force-dynamic'

// Send receipt: the team sends a customer the receipt / tax invoice for an
// order (the same receipt they see in their customer account), as a private
// link that opens it to view, print or save as a PDF.
//
//   POST { companyId, key | orderId | wooOrderId, action: 'prepare' }
//        → { url, to: { email, phone, name }, receipt: { title, number, total… } }
//   POST { …, action: 'send', channel: 'email' | 'sms', to }
//
// key: a lib/portal/receipts key ("woo:<uuid>", "shop:<uuid>", "pay:<uuid>");
// orderId: an orders row (the Orders page); wooOrderId: a synced
// WooCommerce / Prexty order by its WooCommerce number (the inbox's order cards).

const json = (d: any, status = 200) => NextResponse.json(d, { status })
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const money = (cents: number, cur = 'AUD') => { try { return new Intl.NumberFormat('en-AU', { style: 'currency', currency: cur, minimumFractionDigits: 2 }).format(cents / 100) } catch { return `$${(cents / 100).toFixed(2)}` } }
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-AU', { timeZone: 'Australia/Melbourne', day: 'numeric', month: 'long', year: 'numeric' }) : '')
const first = (name: any) => String(name || '').trim().split(/\s+/)[0] || ''

async function resolveKey(db: any, companyId: string, b: any): Promise<string | null> {
  if (b.key && parseReceiptKey(b.key)) return String(b.key)
  if (b.orderId && UUID.test(String(b.orderId))) return `shop:${b.orderId}`
  const n = Number(b.wooOrderId)
  if (Number.isFinite(n) && n > 0) {
    const { data } = await db.from('woocommerce_orders').select('id').eq('company_id', companyId).eq('woo_order_id', n).limit(1)
    if (data?.[0]?.id) return `woo:${data[0].id}`
  }
  return null
}

/** Who the order is for: its email, mobile and name (the order's own, else its contact's). */
async function recipient(db: any, companyId: string, key: string): Promise<{ email: string | null; phone: string | null; name: string | null; conversationId: string | null }> {
  const k = parseReceiptKey(key)!
  const out = { email: null as string | null, phone: null as string | null, name: null as string | null, conversationId: null as string | null }
  try {
    if (k.src === 'woo') {
      const { data: o } = await db.from('woocommerce_orders').select('customer_email, billing, contact_id').eq('id', k.id).eq('company_id', companyId).maybeSingle()
      const bl = o?.billing && typeof o.billing === 'object' ? o.billing : {}
      Object.assign(out, { email: o?.customer_email || bl.email || null, phone: bl.phone || null, name: `${bl.first_name || ''} ${bl.last_name || ''}`.trim() || null })
    } else if (k.src === 'shop') {
      const { data: o } = await db.from('orders').select('customer_name, customer_email, customer_phone, contact_id').eq('id', k.id).eq('company_id', companyId).maybeSingle()
      Object.assign(out, { email: o?.customer_email || null, phone: o?.customer_phone || null, name: o?.customer_name || null })
      if (o?.contact_id && (!out.email || !out.phone)) {
        const { data: c } = await db.from('contacts').select('name, email, phone').eq('id', o.contact_id).eq('company_id', companyId).maybeSingle()
        out.email = out.email || c?.email || null; out.phone = out.phone || c?.phone || null; out.name = out.name || c?.name || null
      }
    } else {
      const { data: p } = await db.from('chat_payments').select('conversation_id').eq('id', k.id).eq('company_id', companyId).maybeSingle()
      if (p?.conversation_id) {
        out.conversationId = p.conversation_id
        const { data: cv } = await db.from('conversations').select('contact_id').eq('id', p.conversation_id).eq('company_id', companyId).maybeSingle()
        if (cv?.contact_id) {
          const { data: c } = await db.from('contacts').select('name, email, phone').eq('id', cv.contact_id).eq('company_id', companyId).maybeSingle()
          Object.assign(out, { email: c?.email || null, phone: c?.phone || null, name: c?.name || null })
        }
      }
    }
  } catch {}
  return out
}

export async function POST(req: NextRequest) {
  try {
    const db = portalDb()
    const b = await req.json().catch(() => ({}))
    const companyId = String(b.companyId || '')
    const access = await requireCompanyAccess(req, db, companyId)
    if (!access.ok) return json({ error: access.unavailable ? 'Colvy couldn’t check your access just now. Please try again.' : 'Not authorized.' }, access.unavailable ? 503 : 403)
    const key = await resolveKey(db, companyId, b)
    if (!key) return json({ error: 'That order has no receipt yet. If it was just made, try again in a minute.' }, 404)
    const r = await buildReceipt(db, companyId, key, null)
    if (!r) return json({ error: 'That order has no receipt yet. If it was just made, try again in a minute.' }, 404)
    const { data: company } = await db.from('companies').select('*').eq('id', companyId).maybeSingle()
    if (!company) return json({ error: 'Workspace not found.' }, 404)
    const url = receiptUrl(company, receiptToken(companyId, key))
    const who = await recipient(db, companyId, key)
    const summary = { title: r.title, number: r.number, total: money(r.totalCents, r.currency), gst: r.gstCents ? money(r.gstCents, r.currency) : null, status: r.status, statusLabel: r.statusLabel, customer: r.customer || who.name }

    if (b.action !== 'send') return json({ key, url, to: { email: who.email, phone: who.phone, name: who.name }, receipt: summary })

    const channel = b.channel === 'sms' ? 'sms' : 'email'
    const to = String(b.to || (channel === 'sms' ? who.phone : who.email) || '').trim().slice(0, 200)
    if (!to) return json({ error: channel === 'sms' ? 'Add a mobile number to text it to.' : 'Add an email address to send it to.' }, 400)
    if (channel === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return json({ error: 'That email address doesn’t look right.' }, 400)
    if (!checkBurst(`receipt-send:${companyId}`, 30)) return json({ error: 'That’s a lot of receipts at once. Please wait a moment.' }, 429)
    if (await isExternalSendBlocked(companyId, db)) return json({ error: 'Sending is switched off in this demo workspace. Copy the link instead.' }, 403)

    const business = company.name || 'us'
    const word = r.title.toLowerCase()
    const name = first(who.name || r.customer)
    let ok = false, error = ''
    if (channel === 'email') {
      const html = receiptEmailHtml({
        business, logoUrl: company.logo_url || null, accent: company.accent_color || null, hideBadge: await hidesPoweredBy(db, companyId, company).catch(() => false),
        first: name || null, title: r.title, number: r.number, total: summary.total, gst: summary.gst, date: day(r.date), where: r.where, status: r.status, statusLabel: r.statusLabel, url,
      })
      const text = `Hi ${name || 'there'}, here's your ${word} ${r.number} from ${business} (${summary.total}). View, print or save it as a PDF:\n${url}`
      ok = await sendCustomerEmail(db, company, { to, subject: `Your ${word} ${r.number} from ${business}`, text, html }).catch(() => false)
      if (!ok) error = 'The email didn’t send. Check the email settings, or copy the link instead.'
    } else {
      let link = url
      try { const s = await shortenUrl(url, { companyId, conversationId: who.conversationId || undefined, kind: 'receipt' }); if (s) link = s } catch {}
      const text = `Hi ${name || 'there'}, here's your ${word} ${r.number} from ${business} (${summary.total}): ${link}`
      try {
        const res = await fetch(`${req.nextUrl.origin}/api/telnyx/sms/send`, {
          method: 'POST', headers: internalHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ companyId, conversationId: who.conversationId || undefined, to, text, senderName: business }),
        })
        const d: any = await res.json().catch(() => ({}))
        ok = res.ok && d?.ok !== false
        if (!ok) error = d?.optedOut ? 'This customer has opted out of texts. Email it or copy the link.' : (d?.error || `The text didn’t send (${res.status}).`)
      } catch (e: any) { error = e?.message || 'The text didn’t send.' }
    }
    await audit(req, db, companyId, 'receipt_sent', `${ok ? 'Sent' : 'Couldn’t send'} ${word} ${r.number} by ${channel === 'sms' ? 'text' : 'email'} to ${to}`, { key, channel, delivered: ok }).catch(() => {})
    if (!ok) return json({ error }, 502)
    return json({ ok: true, channel, to, url })
  } catch (e: any) {
    console.error('[orders/receipt]', e?.message || e)
    return json({ error: 'Something went wrong. Please try again.' }, 500)
  }
}
