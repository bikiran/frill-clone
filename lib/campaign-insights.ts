// Campaign Insights (server only): every email and SMS campaign sent in a
// period, side by side, with the figures each campaign's own report leads
// with: how many it went to, how many people clicked, the orders and revenue
// through its links, and (for SMS) what it cost and the return on that.
//
// Kept cheap so it runs across a few hundred campaigns:
//   sent / delivered      the campaign's own counters (kept current by the
//                         SMS and email senders and SMS delivery receipts)
//   SMS clickers          its tracked links that were clicked (each person
//                         has their own link); a shared link falls back to
//                         who clicked it (link_clicks)
//   email opens, clicks,  head counts on email_campaign_recipients' first-
//   unsubscribes          time stamps
//   orders, revenue       link_conversions on the clicked links (a sale is
//                         credited to a click, so an unclicked link has none)
//
// Click rates match the campaign reports: an SMS campaign's is of people
// texted, an email campaign's of people it was delivered to (until delivery
// is reported, of people sent to).

import { emailAdminDb } from '@/lib/email-db'
import { readAll } from '@/lib/email-campaign-report'
import { linkFunnel } from '@/lib/link-channels'

export type InsightCampaign = {
  id: string
  name: string
  channel: 'sms' | 'email'
  type: string | null
  status: string
  sentAt: string
  sent: number
  delivered: number
  /** People who clicked at least once. */
  clickers: number
  /** clickers ÷ people texted (SMS), or ÷ delivered (email). Percent, one decimal. */
  clickRate: number
  /** Email only: people who opened (approximate, Apple Mail opens automatically). */
  opened: number | null
  /** Email only: people who unsubscribed from it. */
  unsubscribed: number | null
  orders: number
  bookings: number
  revenue: number
  /** What it cost to send. Email campaigns are included in the plan: 0. */
  cost: number
}

export type ChannelTotals = {
  campaigns: number
  sent: number
  /** The base the click rate is of (texted for SMS, delivered for email). */
  reached: number
  clickers: number
  clickRate: number
  orders: number
  bookings: number
  revenue: number
  cost: number
  /** (revenue − cost) ÷ cost, as a percent, over the campaigns that cost
   *  something (SMS; email is included in the plan). Null when nothing was spent. */
  returnOnSpend: number | null
  /** Revenue per message sent. */
  revenuePerMessage: number
  /** Orders and bookings per 100 people who clicked. */
  conversion: number
  /** Email: opened ÷ delivered; SMS: null. */
  openRate: number | null
  /** Email: unsubscribed ÷ delivered; SMS: null. */
  unsubscribeRate: number | null
}

export type Insights = {
  since: string | null
  days: number | null
  campaigns: InsightCampaign[]
  totals: { all: ChannelTotals; sms: ChannelTotals; email: ChannelTotals }
  /** True when more campaigns were sent in the period than are shown. */
  capped: boolean
}

export const INSIGHT_RANGES = [30, 90, 365, 0] as const
const DAY = 86400_000
const MAX_CAMPAIGNS = 300
const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0)
const cents = (n: number) => Math.round(n * 100) / 100
const chunk = <T,>(xs: T[], n: number) => { const out: T[][] = []; for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n)); return out }

/** Run fn over parts of a list, a few at a time, and gather the rows. */
async function eachPart<T, R = any>(xs: T[], size: number, fn: (part: T[]) => Promise<R[]>, parallel = 6): Promise<R[]> {
  const parts = chunk(xs, size)
  const out: R[] = []
  for (let i = 0; i < parts.length; i += parallel) {
    const rows = await Promise.all(parts.slice(i, i + parallel).map(p => fn(p).catch(() => [] as R[])))
    for (const r of rows) out.push(...r)
  }
  return out
}

/** (revenue − cost) ÷ cost as a whole percent, as the SMS report shows it; null with no cost. */
export const returnOnSpend = (revenue: number, cost: number) => (cost > 0 ? Math.round(((revenue - cost) / cost) * 100) : null)

/** Totals for a set of campaigns (pure). */
export function channelTotals(list: InsightCampaign[]): ChannelTotals {
  const sum = (f: (c: InsightCampaign) => number) => list.reduce((n, c) => n + (f(c) || 0), 0)
  const reached = sum(c => (c.channel === 'email' ? c.delivered || c.sent : c.sent))
  const clickers = sum(c => c.clickers)
  const sent = sum(c => c.sent)
  const revenue = cents(sum(c => c.revenue))
  const cost = cents(sum(c => c.cost))
  const paidRevenue = list.reduce((n, c) => n + (c.cost > 0 ? c.revenue : 0), 0)
  const orders = sum(c => c.orders), bookings = sum(c => c.bookings)
  const emails = list.filter(c => c.channel === 'email')
  const emailBase = emails.reduce((n, c) => n + (c.delivered || c.sent), 0)
  return {
    campaigns: list.length, sent, reached, clickers, clickRate: pct(clickers, reached),
    orders, bookings, revenue, cost,
    returnOnSpend: returnOnSpend(paidRevenue, cost),
    revenuePerMessage: sent ? cents(revenue / sent) : 0,
    conversion: pct(orders + bookings, clickers),
    openRate: emails.length ? pct(emails.reduce((n, c) => n + (c.opened || 0), 0), emailBase) : null,
    unsubscribeRate: emails.length ? pct(emails.reduce((n, c) => n + (c.unsubscribed || 0), 0), emailBase) : null,
  }
}

export async function campaignInsights(companyId: string, days: number | null, db: any = emailAdminDb(), now = Date.now()): Promise<Insights> {
  const since = days ? new Date(now - days * DAY).toISOString() : null

  // The campaigns sent in the period, newest first.
  const rows = await readAll(() => {
    let q = db.from('campaigns')
      .select('id, name, channel, campaign_type, status, sent_at, completed_at, sent_count, delivered_count, failed_count, estimated_cost, actual_cost')
      .eq('company_id', companyId).in('status', ['sent', 'sending', 'cancelled']).not('sent_at', 'is', null)
    if (since) q = q.gte('sent_at', since)
    return q.order('sent_at', { ascending: false })
  }, MAX_CAMPAIGNS + 1000)
  // A campaign stopped before anything went out has nothing to compare.
  const sentRows = rows.filter((c: any) => (Number(c.sent_count) || 0) > 0)
  const capped = sentRows.length > MAX_CAMPAIGNS
  const list = sentRows.slice(0, MAX_CAMPAIGNS)
  const ids = list.map((c: any) => c.id)
  const emailIds = list.filter((c: any) => c.channel === 'email').map((c: any) => c.id)

  // Clicked tracked links, for SMS clickers and every campaign's sales.
  const links: any[] = await eachPart(ids, 100, async part => readAll(() => db.from('short_links')
    .select('id, campaign_id, contact_id, clicks').eq('company_id', companyId).in('campaign_id', part).gt('clicks', 0).order('id', { ascending: true })))
  // A link not made for one person: who clicked it.
  const shared = links.filter(l => !l.contact_id).map(l => l.id)
  const sharedClicks: any[] = await eachPart(shared, 200, async part => (await db.from('link_clicks').select('link_id, contact_id').in('link_id', part).limit(10000)).data || [])
  const conversions: any[] = await eachPart(links.map(l => l.id), 200, async part => (await db.from('link_conversions')
    .select('id, link_id, contact_id, order_id, stage, revenue').in('link_id', part).in('stage', ['paid', 'booking', 'booked']).limit(10000)).data || [])

  // Email: who opened, clicked and unsubscribed (first-time stamps on each recipient).
  const count = async (id: string, col: string) => {
    const { count: n, error } = await db.from('email_campaign_recipients').select('id', { count: 'exact', head: true })
      .eq('campaign_id', id).eq('company_id', companyId).not(col, 'is', null)
    return error ? 0 : Number(n) || 0
  }
  const emailStats = new Map<string, { delivered: number; opened: number; clicked: number; unsubscribed: number }>()
  await eachPart(emailIds, 1, async ([id]) => {
    const [delivered, opened, clicked, unsubscribed] = await Promise.all(['delivered_at', 'opened_at', 'clicked_at', 'unsubscribed_at'].map(col => count(id, col)))
    emailStats.set(id, { delivered, opened, clicked, unsubscribed })
    return []
  }, 8)

  const linkCampaign = new Map<string, string>(links.map(l => [l.id, l.campaign_id]))
  const clickersBy = new Map<string, Set<string>>()
  const add = (cid: string, who: string) => { let s = clickersBy.get(cid); if (!s) clickersBy.set(cid, s = new Set()); s.add(who) }
  const sharedWho = new Map<string, Set<string>>()
  for (const c of sharedClicks) if (c.contact_id) { let s = sharedWho.get(c.link_id); if (!s) sharedWho.set(c.link_id, s = new Set()); s.add(c.contact_id) }
  for (const l of links) {
    if (l.contact_id) add(l.campaign_id, `c:${l.contact_id}`)
    else {
      const who = sharedWho.get(l.id)
      if (who?.size) for (const w of who) add(l.campaign_id, `c:${w}`)
      else add(l.campaign_id, `l:${l.id}`)   // someone clicked; we can't tell who
    }
  }
  const salesBy = new Map<string, any[]>()
  for (const v of conversions) {
    const cid = linkCampaign.get(v.link_id)
    if (cid) (salesBy.get(cid) || salesBy.set(cid, []).get(cid)!).push(v)
  }

  const campaigns: InsightCampaign[] = list.map((c: any) => {
    const email = c.channel === 'email'
    const sent = Number(c.sent_count) || 0
    const st = emailStats.get(c.id)
    const delivered = email ? st?.delivered || 0 : Number(c.delivered_count) || 0
    const clickers = email ? st?.clicked || 0 : clickersBy.get(c.id)?.size || 0
    const funnel = linkFunnel([], salesBy.get(c.id) || [])
    return {
      id: c.id, name: c.name || 'Untitled campaign', channel: email ? 'email' : 'sms', type: c.campaign_type || null,
      status: c.status, sentAt: c.sent_at,
      sent, delivered, clickers,
      clickRate: pct(clickers, email ? delivered || sent : sent),
      opened: email ? st?.opened || 0 : null,
      unsubscribed: email ? st?.unsubscribed || 0 : null,
      orders: funnel.orders, bookings: funnel.bookings, revenue: cents(funnel.revenue),
      cost: email ? 0 : cents(Number(c.actual_cost) || Number(c.estimated_cost) || 0),
    }
  })

  return {
    since, days, campaigns, capped,
    totals: {
      all: channelTotals(campaigns),
      sms: channelTotals(campaigns.filter(c => c.channel === 'sms')),
      email: channelTotals(campaigns.filter(c => c.channel === 'email')),
    },
  }
}
