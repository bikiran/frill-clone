// Numbers for an email campaign's report (server only), from its recipient
// rows (email_campaign_recipients) and per-message events (email_events).
//
// Clicks are the headline: Apple Mail Privacy Protection (most iPhone users)
// loads every email's pictures on Apple's servers whether or not the person
// reads it, so it counts as an "open". Open rates are inflated and only
// useful for comparing one campaign with another; a click is a real person
// acting on the email.

import { emailAdminDb } from '@/lib/email-db'

export const OPENS_NOTE = 'Opens are approximate: Apple Mail Privacy Protection opens emails automatically for many iPhone users, so open rates read high. Clicks are the reliable measure.'

export type EmailReport = {
  recipients: number        // people it was sent to (sent + failed)
  sent: number
  failed: number
  skipped: number
  /** Not sent because the campaign was stopped part-way (Stop sending). */
  cancelled: number
  /** Being sent right now (a batch in flight). */
  inFlight: number
  delivered: number
  bounced: number           // hard bounces
  softBounced: number
  complaints: number
  opens: number             // every open event
  uniqueOpens: number       // people who opened at least once
  clicks: number            // every click
  uniqueClicks: number      // people who clicked at least once
  unsubscribes: number
  rates: { delivery: number; open: number; click: number; clickToOpen: number; bounce: number; unsubscribe: number; complaint: number }
  primaryMetric: 'clicks'
  opensNote: string
  topLinks: { url: string; clicks: number; uniqueClicks: number }[]
}

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0)

/** Who an event is about, for "unique" counts: the recipient row, else contact, else address. */
const who = (e: any) => e.recipient_id || e.contact_id || String(e.email || '').toLowerCase() || e.resend_email_id || e.id

/** The report from rows already read (pure, for tests and callers with their own query). */
export function computeEmailReport(recipients: { status: string }[], events: { type: string; link?: string | null; recipient_id?: string | null; contact_id?: string | null; email?: string | null; resend_email_id?: string | null; id?: string }[]): EmailReport {
  const by = (s: string) => recipients.filter(r => r.status === s).length
  const sent = by('sent'), failed = by('failed'), skipped = by('skipped'), cancelled = by('cancelled'), inFlight = by('sending')
  const of = (t: string) => events.filter(e => e.type === t)
  const uniq = (list: any[]) => new Set(list.map(who)).size
  const delivered = uniq(of('delivered'))
  const opens = of('opened'), clicks = of('clicked')
  const bounced = uniq(of('bounced')), softBounced = uniq(of('soft_bounced'))
  const complaints = uniq(of('complained')), unsubscribes = uniq(of('unsubscribed'))
  const uniqueOpens = uniq(opens), uniqueClicks = uniq(clicks)
  const links = new Map<string, { clicks: number; who: Set<string> }>()
  for (const c of clicks) {
    const url = String(c.link || '').trim()
    if (!url) continue
    const l = links.get(url) || { clicks: 0, who: new Set<string>() }
    l.clicks++; l.who.add(who(c)); links.set(url, l)
  }
  // Delivered is only known once Resend reports it; until then, what was sent.
  const base = delivered || sent
  return {
    recipients: sent + failed, sent, failed, skipped, cancelled, inFlight, delivered, bounced, softBounced, complaints,
    opens: opens.length, uniqueOpens, clicks: clicks.length, uniqueClicks, unsubscribes,
    rates: {
      delivery: pct(delivered, sent), open: pct(uniqueOpens, base), click: pct(uniqueClicks, base),
      clickToOpen: pct(uniqueClicks, uniqueOpens), bounce: pct(bounced + softBounced, sent),
      unsubscribe: pct(unsubscribes, base), complaint: pct(complaints, base),
    },
    primaryMetric: 'clicks', opensNote: OPENS_NOTE,
    topLinks: [...links.entries()].map(([url, l]) => ({ url, clicks: l.clicks, uniqueClicks: l.who.size })).sort((a, b) => b.uniqueClicks - a.uniqueClicks || b.clicks - a.clicks).slice(0, 10),
  }
}

export async function readAll(build: () => any, cap = 50000): Promise<any[]> {
  const out: any[] = []
  for (let from = 0; from < cap; from += 1000) {
    const { data, error } = await build().range(from, from + 999)
    if (error) break
    out.push(...(data || []))
    if ((data || []).length < 1000) break
  }
  return out
}

/** The report for one campaign of this company. Before V396: all zeros. */
export async function emailCampaignReport(companyId: string, campaignId: string, db: any = emailAdminDb()): Promise<EmailReport> {
  const recipients = await readAll(() => db.from('email_campaign_recipients').select('id, status').eq('campaign_id', campaignId).eq('company_id', companyId).order('id', { ascending: true }))
  const events = await readAll(() => db.from('email_events').select('id, type, link, recipient_id, contact_id, email, resend_email_id').eq('campaign_id', campaignId).eq('company_id', companyId).order('id', { ascending: true }))
  return computeEmailReport(recipients, events)
}
