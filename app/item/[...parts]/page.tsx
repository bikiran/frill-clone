import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import { recordLinkClick } from '@/lib/link-click'
import { cleanClickRef } from '@/lib/link-channels'
import { cleanCode, conditionLabel, listingCopy, localNumber, messengerLink, priceText, sourceLabel, type Listing } from '@/lib/listings'
import { LISTING_COLS, messengerPageFor, pageUrlFor, textNumber } from '@/lib/listings-server'
import ListingView from './ListingView'

// A Marketplace listing's page: <slug>.colvy.com/item/<code> (or
// /item/<slug>/<code> off colvy.com). Photos, price and details, with Chat /
// Text / Call / Buy online, so buyers from Facebook Marketplace, Gumtree or
// eBay reach the business in Colvy (lib/listings.ts).
//
// Each visit is a click on the listing's tracked link. The first load records
// it and comes back with ?clv=<click>, which the chat widget on the page sends
// with the chat, so the enquiry (and a new contact) is credited to the listing.

export const dynamic = 'force-dynamic'
export const viewport = { width: 'device-width', initialScale: 1 }

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

type Props = { params: Promise<{ parts: string[] }>; searchParams: Promise<Record<string, string | string[] | undefined>> }

/** Which business and code the address names. */
async function refFor(parts: string[]): Promise<{ slug: string; code: string } | null> {
  if (parts.length === 2) {
    const slug = decodeURIComponent(parts[0] || '').toLowerCase()
    const code = cleanCode(parts[1])
    return /^[a-z0-9-]{1,63}$/.test(slug) && code ? { slug, code } : null
  }
  if (parts.length === 1) {
    const h = await headers()
    const host = String(h.get('host') || '').toLowerCase().replace(/:\d+$/, '')
    const slug = String(h.get('x-subdomain') || (host.match(/^([a-z0-9-]+)\.colvy\.com$/) || [])[1] || '').toLowerCase()
    const code = cleanCode(parts[0])
    return slug && code ? { slug, code } : null
  }
  return null
}

async function load(parts: string[]) {
  const ref = await refFor(parts)
  if (!ref) return null
  const db = admin()
  const { data: company } = await db.from('companies').select('id, name, slug, logo_url, accent_color, business_phone').eq('slug', ref.slug).maybeSingle()
  if (!company) return null
  const { data: listing } = await db.from('listings').select(LISTING_COLS).eq('company_id', company.id).eq('code', ref.code).maybeSingle()
  if (!listing || listing.status === 'hidden') return null
  return { db, company, listing: listing as Listing }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { parts } = await params
  const found = await load(parts).catch(() => null)
  if (!found) return { title: 'Listing not found', robots: { index: false } }
  const { listing: l, company } = found
  const price = priceText(l.price_cents, l.currency)
  const title = `${l.title}${price ? ` · ${price}` : ''} · ${company.name}`
  const description = (l.description || `${l.title}${price ? ` for ${price}` : ''}. Ask ${company.name} a question or buy it here.`).replace(/\s+/g, ' ').slice(0, 155)
  return {
    title, description,
    openGraph: { title, description, images: l.photos?.[0] ? [{ url: l.photos[0] }] : undefined, type: 'website' },
    robots: l.status === 'sold' ? { index: false } : undefined,
  }
}

export default async function ListingPage({ params, searchParams }: Props) {
  const { parts } = await params
  const sp = await searchParams
  const found = await load(parts)
  if (!found) notFound()
  const { db, company, listing: l } = found

  // First visit: count the view and come back with the click on the address,
  // so the chat widget can credit what follows to this listing. Crawlers and
  // link previews aren't counted (lib/link-click) and just get the page.
  const clv = cleanClickRef(Array.isArray(sp.clv) ? sp.clv[0] : sp.clv)
  if (!clv && l.short_link_id) {
    let clickId: string | null = null
    try {
      const { data: link } = await db.from('short_links').select('id, company_id, contact_id, clicks, code, created_at').eq('id', l.short_link_id).maybeSingle()
      if (link) clickId = await recordLinkClick(db, link, await headers())
    } catch { /* show the page anyway */ }
    if (clickId) redirect(`/item/${parts.map(p => encodeURIComponent(p)).join('/')}?clv=${encodeURIComponent(clickId)}`)
  }

  const [number, page] = await Promise.all([textNumber(db, company.id), messengerPageFor(db, company.id)])
  const callNumber = number || company.business_phone || null
  const url = pageUrlFor(company.slug, l.code)
  const copy = listingCopy(l, url, number ? localNumber(number) : null)

  return (
    <ListingView
      listing={{
        title: l.title, code: l.code, price: priceText(l.price_cents, l.currency),
        condition: conditionLabel(l.condition), pickup: l.pickup, description: l.description,
        photos: Array.isArray(l.photos) ? l.photos : [], source: sourceLabel(l.source),
        sold: l.status === 'sold', productUrl: l.product?.url || null,
      }}
      business={{ name: company.name, slug: company.slug, logo: company.logo_url || null, accent: company.accent_color || '#ff6a4d' }}
      textNumber={number}
      textNumberLabel={number ? localNumber(number) : null}
      callNumber={callNumber}
      smsBody={copy.smsBody}
      messengerUrl={page ? messengerLink(page, l) : null}
    />
  )
}
