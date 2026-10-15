// Click stitching — turning an anonymous click on a public link (a Reel, a
// TikTok, a QR poster…) into a known person once they chat, book or fill in a
// form.
//
// How it fits together:
//   1. /l/<code> records the click and, for a public link that points at the
//      business's own pages (its Colvy booking page, forms, board / help
//      centre, or its website running the chat widget), adds ?clv=<click id>
//      to the address it redirects to.
//   2. The chat widget, the booking page and public forms read ?clv= and send
//      it with the chat / booking / form.
//   3. When that visitor becomes a contact, stitchLinkClick() puts the contact
//      on the click (so the 7-day order attribution in lib/link-attribution.ts
//      credits their WooCommerce / Shopify orders too) and records what
//      happened as link_conversions rows: 'conversation', 'lead' (a brand-new
//      contact) — and, via attributeBookingToLinks, 'booking' and 'paid'.
//
// Safety: a click id only ever stamps rows in the company that owns the click;
// anything that doesn't look like a click id never reaches a query; and every
// write is idempotent (link_conversions is unique on link + order id + stage).
// Analytics only — every function here swallows its own errors.

import { cleanClickRef } from '@/lib/link-channels'

const MIN = 60_000
const DAY = 86_400_000

/** How long after a click a chat, booking or form still counts as coming from it. */
export const STITCH_WINDOW_DAYS = 7

// The service-role client the caller already has (untyped, like everywhere else).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

/** The company fields that say which sites are the business's own. */
export type CompanySurfaces = {
  slug?: string | null
  website?: string | null
  website_domains?: string[] | null
  help_domain?: string | null
  board_domain?: string | null
}

const bareHost = (h: unknown) => String(h || '').trim().toLowerCase()
  .replace(/^[a-z]+:\/\//, '').replace(/[/?#].*$/, '').replace(/:\d+$/, '').replace(/^www\./, '')

// Big platforms a business sometimes types in as its "website". Adding a
// parameter to their links does nothing useful, so never treat them as ours.
const NOT_OURS = /(^|\.)(instagram\.com|facebook\.com|fb\.com|tiktok\.com|youtube\.com|youtu\.be|linktr\.ee|google\.com|x\.com|twitter\.com|wa\.me|m\.me)$/

const colvyHosts = (): string[] => {
  const hosts = ['colvy.com']
  try { const h = bareHost(new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com').hostname); if (h && !hosts.includes(h)) hosts.push(h) } catch {}
  return hosts
}

/**
 * Is `target` one of the business's own pages, where Colvy can pick up ?clv=?
 *   • its Colvy subdomain (<slug>.colvy.com — board, help centre, booking, forms)
 *   • on colvy.com itself: its booking page (/book/<slug>) and forms (/f/<id>)
 *   • its own help / board custom domains
 *   • the website(s) it runs the chat widget on (companies.website_domains,
 *     V145) and its website, including subdomains (shop.example.com.au)
 */
export function isOwnSurface(target: string, co: CompanySurfaces): boolean {
  let u: URL
  try { u = new URL(target) } catch { return false }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return false
  const host = bareHost(u.hostname)
  if (!host) return false
  const slug = String(co.slug || '').trim().toLowerCase()

  if (slug && host === `${slug}.colvy.com`) return true
  if (colvyHosts().includes(host)) {
    const p = u.pathname.toLowerCase()
    if (slug && (p === `/book/${slug}` || p.startsWith(`/book/${slug}/`))) return true
    return p.startsWith('/f/')
  }
  if (host.endsWith('.colvy.com') || NOT_OURS.test(host)) return false

  for (const d of [co.help_domain, co.board_domain]) if (d && host === bareHost(d)) return true
  const sites = [...(Array.isArray(co.website_domains) ? co.website_domains : []), co.website]
    .map(bareHost).filter(d => d && d.includes('.') && !NOT_OURS.test(d))
  return sites.some(d => host === d || host.endsWith(`.${d}`))
}

/** The target with ?clv=<click id> added (its own query string and #hash kept). */
export function withClickRef(target: string, clickId: string): string {
  try {
    const u = new URL(target)
    u.searchParams.set('clv', clickId)
    return u.toString()
  } catch { return target }
}

/** The company's own sites, for isOwnSurface(). Falls back to just the slug. */
export async function loadCompanySurfaces(db: Db, companyId: string): Promise<CompanySurfaces | null> {
  try {
    const full = await db.from('companies').select('slug, website, website_domains, help_domain, board_domain').eq('id', companyId).maybeSingle()
    if (!full.error) return full.data || null
    const base = await db.from('companies').select('slug').eq('id', companyId).maybeSingle()
    return base.data || null
  } catch { return null }
}

export type LinkCredit = {
  company_id: string
  link_id: string
  contact_id?: string | null
  order_id: string
  order_number?: string | null
  stage: string
  revenue?: number
  currency?: string | null
  clicked_at?: string | null
  converted_at?: string | null
}

/**
 * Record one step a link led to. Idempotent: link + order id + stage is
 * unique, and an existing row is left exactly as it was (first credit wins).
 */
export async function creditLink(db: Db, row: LinkCredit): Promise<void> {
  try {
    await db.from('link_conversions').upsert({
      ...row,
      contact_id: row.contact_id || null,
      order_number: row.order_number ?? null,
      revenue: Number(row.revenue) || 0,
      currency: String(row.currency || 'AUD').toUpperCase(),
      clicked_at: row.clicked_at || null,
      converted_at: row.converted_at || new Date().toISOString(),
    }, { onConflict: 'link_id,order_id,stage', ignoreDuplicates: true })
  } catch { /* analytics only */ }
}

/** Is a click recent enough (and not from the future) to be credited at `at`? */
export function withinWindow(clickedAt: string | null | undefined, at: number): boolean {
  const t = Date.parse(String(clickedAt || ''))
  return Number.isFinite(t) && at - t <= STITCH_WINDOW_DAYS * DAY && t - at <= 10 * MIN
}

/**
 * The click behind a ?clv= reference — only if it belongs to `companyId`
 * (both the click and its link) and is inside the window. Otherwise null.
 */
export async function findCompanyClick(db: Db, companyId: string, clickRef: unknown, at = Date.now()):
  Promise<{ id: string; link_id: string; contact_id: string | null; clicked_at: string } | null> {
  const clickId = cleanClickRef(clickRef)
  if (!clickId || !companyId) return null
  try {
    const { data: click } = await db.from('link_clicks')
      .select('id, link_id, company_id, contact_id, clicked_at')
      .eq('id', clickId).eq('company_id', companyId).maybeSingle()
    if (!click || click.company_id !== companyId || !click.link_id) return null
    if (!withinWindow(click.clicked_at, at)) return null
    const { data: link } = await db.from('short_links').select('id, company_id').eq('id', click.link_id).maybeSingle()
    if (!link || link.company_id !== companyId) return null
    return { id: String(click.id), link_id: String(click.link_id), contact_id: click.contact_id || null, clicked_at: click.clicked_at }
  } catch { return null }
}

/**
 * A visitor who came through a tracked click has just become known.
 *   • puts the contact on the click (only if the click has none yet), so
 *     orders they place in the next 7 days are credited to the link;
 *   • conversationId → a 'conversation' step (conv_<id>), when they started
 *     a chat or sent an enquiry;
 *   • contactIsNew → a 'lead' step (lead_<contactId>).
 * Returns the credited link, or null when the reference doesn't check out.
 */
export async function stitchLinkClick(db: Db, o: {
  companyId: string
  clickRef: unknown
  contactId?: string | null
  conversationId?: string | null
  contactIsNew?: boolean
  at?: number
}): Promise<{ linkId: string; clickId: string; clickedAt: string } | null> {
  const click = await findCompanyClick(db, o.companyId, o.clickRef, o.at ?? Date.now())
  if (!click) return null
  try {
    if (o.contactId && !click.contact_id) {
      await db.from('link_clicks').update({ contact_id: o.contactId })
        .eq('id', click.id).eq('company_id', o.companyId).is('contact_id', null)
    }
    const base = { company_id: o.companyId, link_id: click.link_id, contact_id: o.contactId || null, clicked_at: click.clicked_at }
    if (o.conversationId) await creditLink(db, { ...base, order_id: `conv_${o.conversationId}`, stage: 'conversation' })
    if (o.contactIsNew && o.contactId) await creditLink(db, { ...base, order_id: `lead_${o.contactId}`, stage: 'lead' })
  } catch { /* analytics only */ }
  return { linkId: click.link_id, clickId: click.id, clickedAt: click.clicked_at }
}
