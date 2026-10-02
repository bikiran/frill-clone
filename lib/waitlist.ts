// Back-in-stock waitlists ("Notify me when it arrives").
//
// Server-only helpers shared by the /api/waitlist routes, the WooCommerce
// product webhook and the waitlist cron. Requires stock_waitlist +
// companies.waitlist_settings (migrations/COLVY_V321_STOCK_WAITLIST.sql).

import { isWithinSendingHours } from '@/lib/campaign-sender'
import { sendCustomerEmail } from '@/lib/customer-email'
import { shortenUrl } from '@/lib/short-link'
export { requireCompanyAccess } from '@/lib/company-access'

export const DEFAULT_WAITLIST_TEMPLATE =
  'Hi {name}, good news — {item} is back in stock at {business}! {link} Reply STOP to opt out.'

export type WaitlistSettings = { auto_notify: boolean; template: string; timezone: string }

export function resolveWaitlistSettings(raw: any): WaitlistSettings {
  const s = raw || {}
  return {
    auto_notify: s.auto_notify !== false,
    template: String(s.template || '').trim() || DEFAULT_WAITLIST_TEMPLATE,
    timezone: String(s.timezone || '').trim() || 'Australia/Melbourne',
  }
}

export const isMissingTable = (e: any) => /does not exist|schema cache|PGRST205/i.test(String(e?.message || e || ''))

function fillTemplate(tpl: string, v: { name: string; item: string; business: string; link: string }) {
  return tpl
    .replace(/\{name\}/g, v.name)
    .replace(/\{item\}/g, v.item)
    .replace(/\{business\}/g, v.business)
    .replace(/\{link\}/g, v.link)
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

// The customer's most recent conversation, or a new SMS thread, so the
// notification (and any reply) lands in the inbox against the right person.
async function ensureConversation(db: any, companyId: string, row: any, contact: any, phone: string | null): Promise<string | null> {
  if (row.conversation_id) return row.conversation_id
  if (contact?.id) {
    const { data } = await db.from('conversations').select('id')
      .eq('company_id', companyId).eq('contact_id', contact.id)
      .order('last_message_at', { ascending: false }).limit(1)
    if (data?.[0]?.id) return data[0].id
  }
  const { data: created } = await db.from('conversations').insert({
    company_id: companyId, channel: phone ? 'sms' : 'email',
    subject: contact?.name || row.customer_name || phone || row.email || 'Waitlist',
    contact_id: contact?.id || null, status: 'open',
    sms_number: phone || null, sms_enabled: !!phone,
    last_message: '', last_message_at: new Date().toISOString(),
  }).select('id').maybeSingle()
  return created?.id || null
}

export type NotifyResult = { sent: number; failed: number; queued: number; skipped: number }

/**
 * Notify everyone waiting on an item.
 *
 * Select rows by explicit ids, by WooCommerce product id(s), or by a free-text
 * item name. `respectHours` is used for AUTOMATIC triggers (a stock update at
 * 11pm queues the texts until the next 9am window); a manual "Notify now" press
 * sends immediately.
 */
export async function notifyWaitlist(db: any, opts: {
  companyId: string
  ids?: string[]
  wooProductIds?: (string | number)[]
  itemName?: string
  respectHours: boolean
}): Promise<NotifyResult> {
  const result: NotifyResult = { sent: 0, failed: 0, queued: 0, skipped: 0 }
  const { companyId } = opts
  const { data: co } = await db.from('companies').select('id, name, slug, waitlist_settings').eq('id', companyId).maybeSingle()
  const settings = resolveWaitlistSettings(co?.waitlist_settings)
  const business = co?.name || 'us'

  let q = db.from('stock_waitlist').select('*').eq('company_id', companyId).in('status', ['waiting', 'queued'])
  if (opts.ids?.length) q = q.in('id', opts.ids)
  else if (opts.wooProductIds?.length) q = q.in('woo_product_id', opts.wooProductIds.map(Number).filter(n => Number.isFinite(n)))
  else if (opts.itemName) q = q.is('woo_product_id', null).ilike('item_name', opts.itemName)
  else return result
  const { data: rows, error } = await q.limit(500)
  if (error || !rows?.length) return result

  // Outside sending hours → hold them until the next window (the cron sends).
  if (opts.respectHours && !isWithinSendingHours(new Date(), settings.timezone)) {
    const waiting = rows.filter((r: any) => r.status === 'waiting').map((r: any) => r.id)
    if (waiting.length) await db.from('stock_waitlist').update({ status: 'queued', queued_at: new Date().toISOString() }).in('id', waiting)
    result.queued = rows.length
    return result
  }

  const origin = (process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com').replace(/\/$/, '')

  for (const row of rows) {
    // Claim the row first so a burst of stock webhooks can't text someone twice.
    const { data: claimed } = await db.from('stock_waitlist')
      .update({ status: 'sending', queued_at: new Date().toISOString() })
      .eq('id', row.id).in('status', ['waiting', 'queued']).select('id')
    if (!claimed?.length) continue

    try {
      let contact: any = null
      if (row.contact_id) {
        const { data } = await db.from('contacts').select('id, name, phone, email, is_blocked, unsubscribed_at').eq('id', row.contact_id).eq('company_id', companyId).maybeSingle()
        contact = data
      }
      // Blocked, or replied STOP after joining the list → don't text them.
      const optedOut = !!contact && (contact.is_blocked || (contact.unsubscribed_at && new Date(contact.unsubscribed_at) > new Date(row.created_at)))
      if (optedOut) {
        await db.from('stock_waitlist').update({ status: 'cancelled', error: 'Customer opted out' }).eq('id', row.id)
        result.skipped++
        continue
      }

      const phone = row.phone || contact?.phone || null
      const email = row.email || contact?.email || null
      if (!phone && !email) {
        await db.from('stock_waitlist').update({ status: 'failed', error: 'No phone or email' }).eq('id', row.id)
        result.failed++
        continue
      }

      const first = String(row.customer_name || contact?.name || '').trim().split(/\s+/)[0] || 'there'
      const conversationId = await ensureConversation(db, companyId, row, contact, phone)
      // The product link goes out as a tracked short link (SMS and email alike).
      let link = row.item_url || ''
      if (link) {
        try {
          const s = await shortenUrl(link, { companyId, conversationId: conversationId || undefined, kind: 'waitlist' })
          const code = s && s !== link ? (s.split('/l/')[1] || '') : ''
          if (code) { link = s; await db.from('short_links').update({ link_type: 'product', contact_id: contact?.id || row.contact_id || null, conversation_id: conversationId || null, channel: 'waitlist' }).eq('code', code) }
        } catch {}
      }
      const text = fillTemplate(settings.template, { name: first, item: row.item_name, business, link })

      let ok = false, via: 'sms' | 'email' = phone ? 'sms' : 'email', err = ''
      if (phone) {
        const res = await fetch(`${origin}/api/telnyx/sms/send`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ companyId, conversationId, to: phone, text, senderName: business }),
        })
        const d = await res.json().catch(() => ({}))
        ok = res.ok && d?.ok !== false
        if (!ok) err = d?.error || `SMS failed (${res.status})`
      }
      if (!ok && email) {
        via = 'email'
        ok = await sendCustomerEmail(db, co || { id: companyId, name: business }, { to: email, subject: `${row.item_name} is back in stock`, text })
        if (!ok) err = err || 'Email failed'
      }

      await db.from('stock_waitlist').update(ok
        ? { status: 'notified', notified_at: new Date().toISOString(), notified_via: via, conversation_id: conversationId, error: null }
        : { status: 'failed', error: err || 'Send failed', conversation_id: conversationId }
      ).eq('id', row.id)
      if (ok) result.sent++; else result.failed++
    } catch (e: any) {
      await db.from('stock_waitlist').update({ status: 'failed', error: String(e?.message || e).slice(0, 300) }).eq('id', row.id)
      result.failed++
    }
  }
  return result
}
