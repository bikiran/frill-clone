// Marketplace listings, server side: the listing's tracked link, putting a
// listing on a conversation, finding the listing a page or a text is about,
// counting views → enquiries → sales, and crediting a sale.
// See lib/listings.ts for the why. Everything here that runs inside another
// flow (a chat starting, a text arriving, a payment landing) swallows its own
// errors: a listing must never get in the way of the message or the payment.

import { creditLink } from '@/lib/link-stitch'
import { codeFromRef, enquiryLine, findCodeInText, listingFacts, listingRefFromUrl, listingUrl, type EnquiryVia, type Listing } from '@/lib/listings'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export const LISTING_COLS = 'id, company_id, code, title, price_cents, currency, description, condition, photos, pickup, source, external_url, product, short_link_id, status, sold_at, sold_price_cents, sold_contact_id, sold_conversation_id, created_at, updated_at'

const siteBase = () => process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com'

/** The listings table (V441) isn't there yet. */
export const listingsMissing = (e: unknown): boolean => {
  const m = String((e as { message?: string })?.message || e || '')
  return /listing/.test(m) && /does not exist|schema cache|relation|column/i.test(m)
}

export async function companySlug(db: Db, companyId: string): Promise<string | null> {
  try {
    const { data } = await db.from('companies').select('slug').eq('id', companyId).maybeSingle()
    return data?.slug ? String(data.slug) : null
  } catch { return null }
}

/** The page address for a listing of this business. */
export const pageUrlFor = (slug: string, code: string) => listingUrl(siteBase(), slug, code)

const ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789'
const randomCode = () => Array.from({ length: 8 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('')
const isUnique = (e: { code?: string; message?: string } | null | undefined) => e?.code === '23505' || /duplicate key|unique constraint/i.test(String(e?.message || ''))

/**
 * Make the listing's tracked link (short_links, channel 'marketplace'), or
 * point the existing one at the listing's current page. Its clicks are the
 * listing's views; Link Reports shows it like any other link.
 */
export async function ensureListingLink(db: Db, listing: Pick<Listing, 'id' | 'company_id' | 'code' | 'title' | 'short_link_id'>, slug: string): Promise<string | null> {
  const target = pageUrlFor(slug, listing.code)
  const label = `Listing: ${listing.title}`.slice(0, 200)
  try {
    if (listing.short_link_id) {
      await db.from('short_links').update({ target_url: target, label }).eq('id', listing.short_link_id).eq('company_id', listing.company_id)
      return listing.short_link_id
    }
    for (let i = 0; i < 5; i++) {
      const row = { code: randomCode(), company_id: listing.company_id, target_url: target, label, kind: 'listing', channel: 'marketplace', clicks: 0 }
      let { data, error } = await db.from('short_links').insert(row).select('id').maybeSingle()
      if (error && !isUnique(error)) {
        // An older database without short_links.channel: the link still works.
        const { channel: _c, ...plain } = row
        ;({ data, error } = await db.from('short_links').insert(plain).select('id').maybeSingle())
      }
      if (!error && data?.id) {
        await db.from('listings').update({ short_link_id: data.id }).eq('id', listing.id).eq('company_id', listing.company_id)
        return data.id
      }
      if (!isUnique(error)) return null
    }
  } catch { /* the listing works without its link; views just aren't counted */ }
  return null
}

/** This business's listing with that code (any status). */
export async function listingByCode(db: Db, companyId: string, code: string): Promise<Listing | null> {
  try {
    const { data } = await db.from('listings').select(LISTING_COLS).eq('company_id', companyId).eq('code', code).maybeSingle()
    return data || null
  } catch { return null }
}

/** The listing a page address is, when it's this business's and still up. */
export async function listingForPage(db: Db, companyId: string, url: unknown): Promise<Listing | null> {
  const ref = listingRefFromUrl(url)
  if (!ref) return null
  try {
    const slug = await companySlug(db, companyId)
    if (!slug || slug.toLowerCase() !== ref.slug) return null
    const l = await listingByCode(db, companyId, ref.code)
    return l && l.status !== 'hidden' ? l : null
  } catch { return null }
}

/** The listing whose code a customer's text mentions ("Is TANK4 still available?"). */
export async function listingForText(db: Db, companyId: string, text: unknown): Promise<Listing | null> {
  const t = String(text ?? '')
  if (!/[A-Za-z0-9]{3}/.test(t)) return null
  try {
    const { data, error } = await db.from('listings').select('code').eq('company_id', companyId).eq('status', 'active').limit(500)
    if (error || !data?.length) return null
    const code = findCodeInText(t, data.map((r: { code: string }) => r.code))
    return code ? await listingByCode(db, companyId, code) : null
  } catch { return null }
}

/**
 * Put a listing on a conversation, with a line in the thread saying what the
 * customer is asking about, and credit the listing's link with the enquiry.
 * Does nothing when the conversation is already about this listing.
 */
export async function attachListing(db: Db, o: { companyId: string; conversationId: string; listing: Listing; via: EnquiryVia; contactId?: string | null }): Promise<boolean> {
  try {
    const { data: conv } = await db.from('conversations').select('id, company_id, listing_id, contact_id').eq('id', o.conversationId).maybeSingle()
    if (!conv || conv.company_id !== o.companyId || o.listing.company_id !== o.companyId) return false
    if (conv.listing_id === o.listing.id) return false
    const { error } = await db.from('conversations').update({ listing_id: o.listing.id }).eq('id', conv.id).eq('company_id', o.companyId)
    if (error) return false
    await db.from('messages').insert({
      conversation_id: conv.id, company_id: o.companyId, sender_type: 'system',
      content: enquiryLine(o.listing, o.via),
      metadata: { kind: 'listing_enquiry', listing_id: o.listing.id, via: o.via },
    })
    if (o.listing.short_link_id) {
      await creditLink(db, {
        company_id: o.companyId, link_id: o.listing.short_link_id,
        contact_id: o.contactId || conv.contact_id || null,
        order_id: `conv_${conv.id}`, stage: 'conversation',
        converted_at: new Date().toISOString(),
      })
    }
    return true
  } catch { return false }
}

/** A chat from a listing page: attach the listing the page shows. */
export async function attachListingFromPage(db: Db, o: { companyId: string; conversationId: string; pageUrl: unknown; contactId?: string | null }): Promise<void> {
  const listing = await listingForPage(db, o.companyId, o.pageUrl)
  if (listing) await attachListing(db, { ...o, listing, via: 'page' })
}

/** A text (or a Messenger / Instagram message) that mentions a listing's code: attach that listing. */
export async function attachListingFromText(db: Db, o: { companyId: string; conversationId: string; text: unknown; contactId?: string | null; via?: EnquiryVia }): Promise<void> {
  const listing = await listingForText(db, o.companyId, o.text)
  if (listing) await attachListing(db, { ...o, listing, via: o.via || 'sms' })
}

/** A Messenger ref from a listing's m.me link (see messengerLink): attach that listing. */
export async function attachListingFromRef(db: Db, o: { companyId: string; conversationId: string; ref: unknown; contactId?: string | null }): Promise<boolean> {
  const code = codeFromRef(o.ref)
  if (!code) return false
  const listing = await listingByCode(db, o.companyId, code)
  if (!listing || listing.status === 'hidden') return false
  return attachListing(db, { ...o, listing, via: 'messenger' })
}

/**
 * The business's Facebook Page for a listing's Messenger button: the id of an
 * active Page connection (not an Instagram-only one), or null. m.me takes the
 * Page's id as well as its username.
 */
export async function messengerPageFor(db: Db, companyId: string): Promise<string | null> {
  try {
    const { data } = await db.from('meta_channels').select('page_id, created_at')
      .eq('company_id', companyId).eq('platform', 'facebook').eq('is_active', true)
      .order('created_at', { ascending: true }).limit(5)
    const row = (data || []).find((r: { page_id?: string }) => /^[0-9]+$/.test(String(r.page_id || '')))
    return row ? String(row.page_id) : null
  } catch { return null }
}

/**
 * What the AI agent and Colvy AI are told about the listing a conversation is
 * about, or null when it isn't about one (or listings aren't set up yet).
 */
export async function listingContext(db: Db, companyId: string, conversationId: string | null | undefined): Promise<{ text: string; listing: Listing } | null> {
  if (!conversationId) return null
  try {
    const { data: conv, error } = await db.from('conversations').select('listing_id').eq('company_id', companyId).eq('id', conversationId).maybeSingle()
    if (error || !conv?.listing_id) return null
    const { data: l } = await db.from('listings').select(LISTING_COLS).eq('company_id', companyId).eq('id', conv.listing_id).maybeSingle()
    if (!l) return null
    const slug = await companySlug(db, companyId)
    return { text: listingFacts(l, slug ? pageUrlFor(slug, l.code) : null), listing: l }
  } catch { return null }
}

/**
 * A payment landed in a conversation about a listing: count it as the
 * listing's sale. Keyed by the payment, so it's counted once.
 */
export async function creditListingPayment(db: Db, pay: { id: string; company_id: string; conversation_id?: string | null; amount_cents?: number | null; contact_id?: string | null }): Promise<void> {
  if (!pay.conversation_id) return
  try {
    const { data: conv } = await db.from('conversations').select('listing_id, contact_id, company_id').eq('id', pay.conversation_id).maybeSingle()
    if (!conv?.listing_id || conv.company_id !== pay.company_id) return
    const { data: l } = await db.from('listings').select('short_link_id, company_id').eq('id', conv.listing_id).maybeSingle()
    if (!l?.short_link_id || l.company_id !== pay.company_id) return
    await creditLink(db, {
      company_id: pay.company_id, link_id: l.short_link_id,
      contact_id: pay.contact_id || conv.contact_id || null,
      order_id: `pay_${pay.id}`, stage: 'paid',
      revenue: Math.max(0, Number(pay.amount_cents) || 0) / 100, currency: 'aud',
      converted_at: new Date().toISOString(),
    })
  } catch { /* analytics only */ }
}

export type ListingStats = { views: number; enquiries: number; sales: number; revenue: number }

/** Views, enquiries, sales and revenue for each listing. */
export async function listingStats(db: Db, companyId: string, listings: Pick<Listing, 'id' | 'short_link_id'>[]): Promise<Record<string, ListingStats>> {
  const out: Record<string, ListingStats> = {}
  for (const l of listings) out[l.id] = { views: 0, enquiries: 0, sales: 0, revenue: 0 }
  if (!listings.length) return out
  const ids = listings.map(l => l.id)
  const linkIds = listings.map(l => l.short_link_id).filter((x): x is string => !!x)
  const byLink = new Map(listings.filter(l => l.short_link_id).map(l => [l.short_link_id as string, l.id]))
  const safe = async (q: Promise<{ data: unknown[] | null; error: unknown }>) => { try { const { data, error } = await q; return error ? [] : (data || []) } catch { return [] } }
  const [links, convs, paid] = await Promise.all([
    linkIds.length ? safe(db.from('short_links').select('id, clicks').in('id', linkIds)) : Promise.resolve([]),
    safe(db.from('conversations').select('id, listing_id').eq('company_id', companyId).in('listing_id', ids).limit(5000)),
    linkIds.length ? safe(db.from('link_conversions').select('link_id, order_id, revenue').eq('company_id', companyId).eq('stage', 'paid').in('link_id', linkIds).limit(5000)) : Promise.resolve([]),
  ])
  for (const r of links as { id: string; clicks: number }[]) { const id = byLink.get(r.id); if (id) out[id].views = Number(r.clicks) || 0 }
  for (const r of convs as { listing_id: string }[]) if (out[r.listing_id]) out[r.listing_id].enquiries++
  const seen = new Set<string>()
  for (const r of paid as { link_id: string; order_id: string; revenue: number }[]) {
    const id = byLink.get(r.link_id)
    if (!id || seen.has(`${r.link_id}|${r.order_id}`) || String(r.order_id || '').startsWith('book_')) continue
    seen.add(`${r.link_id}|${r.order_id}`)
    out[id].sales++
    out[id].revenue += Number(r.revenue) || 0
  }
  return out
}

/** The business's own number buyers can text (first live Colvy number). */
export async function textNumber(db: Db, companyId: string): Promise<string | null> {
  try {
    const { data } = await db.from('phone_numbers').select('phone_number, status').eq('company_id', companyId).limit(20)
    const live = (data || []).find((r: { status?: string }) => String(r.status || 'active').toLowerCase() !== 'released')
    return live?.phone_number || null
  } catch { return null }
}
