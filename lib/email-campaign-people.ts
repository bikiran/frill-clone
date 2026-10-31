// Who did what with an email campaign (server only): one row per person it
// went to, with when it was delivered, opened and clicked (and which links),
// bounced, marked as spam or unsubscribed, and whether they ordered through
// its links. Feeds the report's People list and its follow-up campaigns.
//
// Sources: email_campaign_recipients (one row per person, with first-time
// stamps), email_events (every open and click, for counts and links) and the
// campaign's tracked links (short_links.campaign_id) → link_conversions for
// orders and revenue, the same way Link Reports credits them.

import { emailAdminDb } from '@/lib/email-db'
import { readAll } from '@/lib/email-campaign-report'
import { isBookingPayment } from '@/lib/link-channels'

export type { EmailPerson } from '@/lib/email-people-shared'
export { followUpAudience } from '@/lib/email-people-shared'
import type { EmailPerson } from '@/lib/email-people-shared'

export type EmailMoney = { orders: number; bookings: number; revenue: number; purchasers: number }

const EMAILED = ['sent', 'sending', 'failed']
const latest = (...ts: (string | null | undefined)[]) => ts.filter(Boolean).sort().pop() || null

/** Everyone the campaign was sent to, with what they did, plus its orders and revenue. */
export async function emailCampaignPeople(companyId: string, campaignId: string, db: any = emailAdminDb()): Promise<{ people: EmailPerson[]; money: EmailMoney }> {
  const [recipients, events, links] = await Promise.all([
    readAll(() => db.from('email_campaign_recipients')
      .select('id, contact_id, email, name, status, sent_at, delivered_at, opened_at, clicked_at, bounced_at, complained_at, unsubscribed_at')
      .eq('campaign_id', campaignId).eq('company_id', companyId).in('status', EMAILED).order('id', { ascending: true })),
    readAll(() => db.from('email_events').select('id, type, link, recipient_id, contact_id, email, occurred_at')
      .eq('campaign_id', campaignId).eq('company_id', companyId).in('type', ['opened', 'clicked', 'unsubscribed', 'complained', 'bounced', 'soft_bounced', 'delivered'])
      .order('id', { ascending: true })),
    db.from('short_links').select('id').eq('campaign_id', campaignId).eq('company_id', companyId).limit(500).then((r: any) => r?.data || [], () => []),
  ])

  // Events → the recipient they're about (by row, else contact, else address).
  const byId = new Map<string, any>(), byContact = new Map<string, any>(), byEmail = new Map<string, any>()
  for (const r of recipients) {
    byId.set(r.id, r)
    if (r.contact_id) byContact.set(r.contact_id, r)
    if (r.email) byEmail.set(String(r.email).toLowerCase(), r)
  }
  type Agg = { opens: number; clicks: number; links: Map<string, number>; first: Record<string, string> }
  const agg = new Map<string, Agg>()
  const of = (id: string) => { let a = agg.get(id); if (!a) { a = { opens: 0, clicks: 0, links: new Map(), first: {} }; agg.set(id, a) } return a }
  for (const e of events) {
    const r = (e.recipient_id && byId.get(e.recipient_id)) || (e.contact_id && byContact.get(e.contact_id)) || (e.email && byEmail.get(String(e.email).toLowerCase()))
    if (!r) continue
    const a = of(r.id)
    const type = e.type === 'soft_bounced' ? 'bounced' : e.type
    if (type === 'opened') a.opens++
    if (type === 'clicked') {
      a.clicks++
      if (e.link) a.links.set(String(e.link), (a.links.get(String(e.link)) || 0) + 1)
    }
    if (e.occurred_at && (!a.first[type] || e.occurred_at < a.first[type])) a.first[type] = e.occurred_at
  }

  // Orders through the campaign's links, by customer.
  const linkIds = links.map((l: any) => l.id)
  const conversions: any[] = []
  for (let i = 0; i < linkIds.length; i += 200) {
    const { data } = await db.from('link_conversions').select('contact_id, order_id, stage, revenue').in('link_id', linkIds.slice(i, i + 200)).eq('stage', 'paid')
    conversions.push(...(data || []))
  }
  const orderIds = new Set<string>(), bookingIds = new Set<string>(), purchasers = new Set<string>()
  const perContact = new Map<string, { orders: Set<string>; revenue: number }>()
  let revenue = 0
  for (const c of conversions) {
    const key = String(c.order_id ?? '')
    if (isBookingPayment(c)) bookingIds.add(key); else if (key) orderIds.add(key)
    revenue += Number(c.revenue) || 0
    if (c.contact_id) {
      purchasers.add(c.contact_id)
      const p = perContact.get(c.contact_id) || { orders: new Set<string>(), revenue: 0 }
      if (key && !isBookingPayment(c)) p.orders.add(key)
      p.revenue += Number(c.revenue) || 0
      perContact.set(c.contact_id, p)
    }
  }

  // Names the recipient rows don't have, from the contacts.
  const missing = recipients.filter(r => !r.name && r.contact_id).map(r => r.contact_id)
  const names = new Map<string, string>()
  for (let i = 0; i < missing.length; i += 200) {
    const { data } = await db.from('contacts').select('id, name').in('id', missing.slice(i, i + 200))
    for (const c of data || []) if (c.name) names.set(c.id, c.name)
  }

  const people: EmailPerson[] = recipients.map(r => {
    const a = agg.get(r.id)
    const f = a?.first || {}
    const opened = r.opened_at || f.opened || null
    const clicked = r.clicked_at || f.clicked || null
    const money = r.contact_id ? perContact.get(r.contact_id) : undefined
    const person: EmailPerson = {
      id: r.id, contactId: r.contact_id || null,
      name: r.name || (r.contact_id && names.get(r.contact_id)) || '',
      email: r.email || '', status: r.status,
      sentAt: r.sent_at || null, deliveredAt: r.delivered_at || f.delivered || null,
      // A click means it was opened, even when the picture didn't load.
      openedAt: opened || clicked, clickedAt: clicked,
      bouncedAt: r.bounced_at || f.bounced || null, complainedAt: r.complained_at || f.complained || null,
      unsubscribedAt: r.unsubscribed_at || f.unsubscribed || null,
      opens: Math.max(a?.opens || 0, opened || clicked ? 1 : 0), clicks: a?.clicks || 0,
      links: a ? [...a.links.entries()].sort((x, y) => y[1] - x[1]).map(([u]) => u).slice(0, 5) : [],
      orders: money?.orders.size || 0, revenue: Math.round((money?.revenue || 0) * 100) / 100,
      lastAt: null,
    }
    person.lastAt = latest(person.sentAt, person.deliveredAt, person.openedAt, person.clickedAt, person.bouncedAt, person.complainedAt, person.unsubscribedAt)
    return person
  })

  return { people, money: { orders: orderIds.size, bookings: bookingIds.size, revenue: Math.round(revenue * 100) / 100, purchasers: purchasers.size } }
}
