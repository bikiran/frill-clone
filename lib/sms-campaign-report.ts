// An SMS campaign's report (server only): the numbers, everyone it went to and
// what they did, its links grouped by page, delivery failures, outlets and a
// day-by-day chart. One request instead of the browser reading every
// recipient, link and click itself.
//
// Per person:
//   delivered / failed     campaign_recipients (delivery receipts)
//   clicked                their own tracked link (link_id) → link_clicks
//   ordered                that link's paid link_conversions
//   replied                texts they sent back within 7 days (messages from
//                          the customer in their conversations), not counting
//                          STOP / START keywords
//   replied STOP           a STOP keyword from their number within 14 days of
//                          the send (sms_keywords; else STOP replies found
//                          in their messages)

import { emailAdminDb, isMissingTable } from '@/lib/email-db'
import { readAll } from '@/lib/email-campaign-report'
import { linkFunnel } from '@/lib/link-channels'
import { phoneKey } from '@/lib/phone'
import { smsKeyword, STOP_WORDS, START_WORDS } from '@/lib/sms-consent'
import type { SmsPerson } from '@/lib/sms-people-shared'

export type SmsReport = {
  sent: number; delivered: number; failed: number; skipped: number; cancelled: number; pending: number
  clicks: number; uniqueClicks: number; replied: number; stopped: number
  orders: number; bookings: number; revenue: number; purchasers: number
  cost: number
  skipReasons: [string, number][]
  failureReasons: [string, number][]
  links: { url: string; label: string | null; people: number; clicks: number }[]
  outlets: { name: string; sent: number; clicks: number; revenue: number }[]
  daily: { day: string; clicks: number; replies: number }[]
}

const DAY = 86400_000
const REPLY_WINDOW = 7 * DAY
const STOP_WINDOW = 14 * DAY
const chunk = <T,>(xs: T[], n = 200) => { const out: T[][] = []; for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n)); return out }
const ms = (v: unknown) => { const t = Date.parse(String(v || '')); return Number.isFinite(t) ? t : NaN }

/** Run fn over chunks of ids, a few at a time, and gather the rows. */
async function eachChunk<T = any>(ids: string[], fn: (part: string[]) => Promise<T[]>, parallel = 6): Promise<T[]> {
  const parts = chunk(ids)
  const out: T[] = []
  for (let i = 0; i < parts.length; i += parallel) {
    const rows = await Promise.all(parts.slice(i, i + parallel).map(p => fn(p).catch(() => [] as T[])))
    for (const r of rows) out.push(...r)
  }
  return out
}

export async function smsCampaignReport(companyId: string, campaign: any, db: any = emailAdminDb()): Promise<{ report: SmsReport; people: SmsPerson[] }> {
  const campaignId = campaign.id
  const [recipients, links] = await Promise.all([
    readAll(() => db.from('campaign_recipients').select('id, contact_id, phone, name, status, skip_reason, error, link_id, sent_at, delivered_at, clicked_at')
      .eq('campaign_id', campaignId).eq('company_id', companyId).order('id', { ascending: true })),
    readAll(() => db.from('short_links').select('id, target_url, label, contact_id').eq('campaign_id', campaignId).eq('company_id', companyId).order('id', { ascending: true })),
  ])
  const linkById = new Map<string, any>(links.map((l: any) => [l.id, l]))
  const linkIds = links.map((l: any) => l.id)
  const emailed = recipients.filter((r: any) => ['sent', 'delivered', 'failed', 'sending'].includes(r.status))
  const contactIds = [...new Set(emailed.map((r: any) => r.contact_id).filter(Boolean))] as string[]

  // Clicks and orders through the campaign's links; the people's names and outlets.
  const [clicks, conversions, contacts, outletRows] = await Promise.all([
    eachChunk(linkIds, async p => (await db.from('link_clicks').select('id, link_id, clicked_at').in('link_id', p).limit(5000)).data || []),
    eachChunk(linkIds, async p => (await db.from('link_conversions').select('id, link_id, contact_id, order_id, stage, revenue').in('link_id', p).limit(5000)).data || []),
    eachChunk(contactIds, async p => (await db.from('contacts').select('id, name, location_id').in('id', p)).data || []),
    db.from('company_locations').select('id, label, suburb').eq('company_id', companyId).then((r: any) => r?.data || [], () => []),
  ])
  const contactById = new Map<string, any>(contacts.map((c: any) => [c.id, c]))
  const outletName = new Map<string, string>(outletRows.map((o: any) => [o.id, o.label || o.suburb || 'Outlet']))

  // Replies and STOPs, in the window after the send.
  const sentTimes = emailed.map((r: any) => ms(r.sent_at)).filter(Number.isFinite) as number[]
  const firstSent = sentTimes.length ? Math.min(...sentTimes) : ms(campaign.sent_at)
  const lastSent = sentTimes.length ? Math.max(...sentTimes) : firstSent
  const replies = new Map<string, { at: number; text: string }[]>()   // contact → replies
  const stopsByContact = new Map<string, number[]>()
  if (Number.isFinite(firstSent) && contactIds.length) {
    const convs = await eachChunk(contactIds, async p => (await db.from('conversations').select('id, contact_id').eq('company_id', companyId).in('contact_id', p).limit(2000)).data || [])
    const convContact = new Map<string, string>(convs.map((c: any) => [c.id, c.contact_id]))
    const from = new Date(firstSent).toISOString(), to = new Date(lastSent + STOP_WINDOW).toISOString()
    const msgs: any[] = await eachChunk(convs.map((c: any) => c.id), async p => (await db.from('messages').select('conversation_id, content, created_at')
      .in('conversation_id', p).eq('sender_type', 'visitor').gte('created_at', from).lte('created_at', to).order('created_at', { ascending: true }).limit(5000)).data || [])
    for (const m of msgs) {
      const cid = convContact.get(m.conversation_id); const t = ms(m.created_at)
      if (!cid || !Number.isFinite(t)) continue
      const k = smsKeyword(m.content)
      if (STOP_WORDS.includes(k)) { (stopsByContact.get(cid) || stopsByContact.set(cid, []).get(cid)!).push(t); continue }
      if (START_WORDS.includes(k)) continue
      ;(replies.get(cid) || replies.set(cid, []).get(cid)!).push({ at: t, text: String(m.content || '').trim() })
    }
  }
  // The STOP keyword log, by number (V378); the replies above stand in before it.
  const stopsByPhone = new Map<string, number[]>()
  const phones = [...new Set(emailed.map((r: any) => phoneKey(r.phone)).filter((k: string) => k.length >= 8))] as string[]
  if (Number.isFinite(firstSent) && phones.length) {
    const from = new Date(firstSent).toISOString(), to = new Date(lastSent + STOP_WINDOW).toISOString()
    let missing = false
    const rows: any[] = await eachChunk(phones, async p => {
      const { data, error } = await db.from('sms_keywords').select('phone_norm, created_at').eq('company_id', companyId).in('phone_norm', p).in('keyword', STOP_WORDS).gte('created_at', from).lte('created_at', to).limit(5000)
      if (error && isMissingTable(error)) missing = true
      return data || []
    })
    if (!missing) for (const r of rows) { const t = ms(r.created_at); if (Number.isFinite(t)) (stopsByPhone.get(r.phone_norm) || stopsByPhone.set(r.phone_norm, []).get(r.phone_norm)!).push(t) }
  }

  // Per link: clicks and first click; per link and contact: orders.
  const clicksByLink = new Map<string, number>()
  const daily = new Map<string, { clicks: number; replies: number }>()
  const dayOf = (t: number) => new Date(t).toISOString().slice(0, 10)
  const bump = (t: number, k: 'clicks' | 'replies') => { if (!Number.isFinite(t)) return; const d = dayOf(t); const v = daily.get(d) || { clicks: 0, replies: 0 }; v[k]++; daily.set(d, v) }
  for (const c of clicks) { clicksByLink.set(c.link_id, (clicksByLink.get(c.link_id) || 0) + 1); bump(ms(c.clicked_at), 'clicks') }
  const paid = conversions.filter((v: any) => v.stage === 'paid')
  const moneyByLink = new Map<string, { orders: Set<string>; revenue: number }>()
  for (const v of paid) {
    const m = moneyByLink.get(v.link_id) || { orders: new Set<string>(), revenue: 0 }
    if (v.order_id && !String(v.order_id).startsWith('book_')) m.orders.add(String(v.order_id))
    m.revenue += Number(v.revenue) || 0
    moneyByLink.set(v.link_id, m)
  }

  const people: SmsPerson[] = emailed.map((r: any) => {
    const sent = ms(r.sent_at)
    const link = r.link_id ? linkById.get(r.link_id) : null
    const nClicks = r.link_id ? clicksByLink.get(r.link_id) || 0 : 0
    const money = r.link_id ? moneyByLink.get(r.link_id) : undefined
    const mine = (r.contact_id && replies.get(r.contact_id) || []).filter(x => Number.isFinite(sent) && x.at >= sent && x.at <= sent + REPLY_WINDOW)
    const stopTimes = [...(stopsByPhone.get(phoneKey(r.phone)) || []), ...((r.contact_id && stopsByContact.get(r.contact_id)) || [])]
      .filter(t => Number.isFinite(sent) && t >= sent && t <= sent + STOP_WINDOW).sort((a, b) => a - b)
    const ct = r.contact_id ? contactById.get(r.contact_id) : null
    const iso = (t: number) => (Number.isFinite(t) ? new Date(t).toISOString() : null)
    const p: SmsPerson = {
      id: r.id, contactId: r.contact_id || null,
      name: r.name || ct?.name || '', phone: r.phone || '',
      status: r.status === 'sending' ? 'sent' : r.status, error: r.error || null,
      sentAt: r.sent_at || null, deliveredAt: r.delivered_at || null,
      clickedAt: r.clicked_at || (nClicks ? r.sent_at : null), clicks: Math.max(nClicks, r.clicked_at ? 1 : 0),
      link: link?.target_url || null,
      repliedAt: mine.length ? iso(mine[0].at) : null, replies: mine.length, reply: mine.length ? mine[mine.length - 1].text.slice(0, 160) : null,
      stoppedAt: stopTimes.length ? iso(stopTimes[0]) : null,
      orders: money?.orders.size || 0, revenue: Math.round((money?.revenue || 0) * 100) / 100,
      outlet: ct?.location_id ? (outletName.get(ct.location_id) || 'Unknown outlet') : 'Online store',
      lastAt: null,
    }
    p.lastAt = [p.sentAt, p.deliveredAt, p.clickedAt, p.repliedAt, p.stoppedAt].filter(Boolean).sort().pop() || null
    for (const x of mine) bump(x.at, 'replies')
    return p
  })

  // Links, grouped by page (every person has their own tracked link to it).
  const byUrl = new Map<string, { url: string; label: string | null; people: Set<string>; clicks: number }>()
  for (const l of links) {
    const n = clicksByLink.get(l.id) || 0
    const g = byUrl.get(l.target_url) || { url: l.target_url, label: l.label || null, people: new Set<string>(), clicks: 0 }
    g.clicks += n
    if (n) g.people.add(l.contact_id || l.id)
    byUrl.set(l.target_url, g)
  }
  const tally = (xs: string[]) => { const m = new Map<string, number>(); for (const x of xs) m.set(x, (m.get(x) || 0) + 1); return [...m.entries()].sort((a, b) => b[1] - a[1]) }
  const outlets = new Map<string, { sent: number; clicks: number; revenue: number }>()
  for (const p of people) {
    const o = outlets.get(p.outlet || 'Online store') || { sent: 0, clicks: 0, revenue: 0 }
    if (p.status !== 'failed') o.sent++
    if (p.clickedAt) o.clicks++
    o.revenue += p.revenue
    outlets.set(p.outlet || 'Online store', o)
  }
  // The first two weeks, every day (zeros too), so the chart reads as time.
  const days: SmsReport['daily'] = []
  if (Number.isFinite(firstSent)) {
    const lastActivity = Math.max(firstSent, ...[...daily.keys()].map(d => Date.parse(d + 'T00:00:00Z')))
    const end = Math.min(Math.max(lastActivity, firstSent + 6 * DAY), firstSent + 13 * DAY)
    for (let t = Date.parse(dayOf(firstSent) + 'T00:00:00Z'); t <= end; t += DAY) days.push({ day: dayOf(t), ...(daily.get(dayOf(t)) || { clicks: 0, replies: 0 }) })
  }

  const funnel = linkFunnel([], conversions)
  const cost = Number(campaign.actual_cost) || Number(campaign.estimated_cost) || 0
  const report: SmsReport = {
    sent: people.filter(p => p.status !== 'failed').length,
    delivered: people.filter(p => p.status === 'delivered' || !!p.deliveredAt).length,
    failed: people.filter(p => p.status === 'failed').length,
    skipped: recipients.filter((r: any) => r.status === 'skipped').length,
    cancelled: recipients.filter((r: any) => r.status === 'cancelled').length,
    pending: recipients.filter((r: any) => r.status === 'pending').length,
    clicks: clicks.length, uniqueClicks: people.filter(p => p.clickedAt).length,
    replied: people.filter(p => p.replies > 0).length, stopped: people.filter(p => p.stoppedAt).length,
    orders: funnel.orders, bookings: funnel.bookings, revenue: Math.round(funnel.revenue * 100) / 100,
    purchasers: new Set(paid.map((v: any) => v.contact_id).filter(Boolean)).size,
    cost,
    skipReasons: tally(recipients.filter((r: any) => r.status === 'skipped').map((r: any) => r.skip_reason || 'other')),
    failureReasons: tally(people.filter(p => p.status === 'failed').map(p => p.error || 'Unknown error')),
    links: [...byUrl.values()].map(g => ({ url: g.url, label: g.label, people: g.people.size, clicks: g.clicks })).sort((a, b) => b.people - a.people || b.clicks - a.clicks).slice(0, 10),
    outlets: [...outlets.entries()].map(([name, v]) => ({ name, ...v, revenue: Math.round(v.revenue * 100) / 100 })).sort((a, b) => b.sent - a.sent),
    daily: days,
  }
  return { report, people }
}
