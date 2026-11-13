import { POSTS, type BlogPost } from '@/lib/blog'
import { coverFor } from '@/lib/blog-covers'
import type { GuideCard } from '@/components/marketing/RelatedGuides'

// Which blog articles to show as "Guides" on a marketing page (server only:
// it reads every article). First any picked for the page below, then the
// newest articles that link to the page's address. Internal links both ways
// help readers and help search engines see which pages belong together.

// Pages no article links to by address, with the guides written for them.
export const PICKED_GUIDES: Record<string, string[]> = {
  'industries/healthcare': ['physio-chiro-massage-clinics', 'appointments-regulars-waitlist'],
  'industries/hospitality': ['restaurant-reservations-guide', 'cafes-restaurants-regulars'],
  'for/service-businesses': ['cleaning-business-guide', 'mechanics-car-detailing', 'trades-quotes-jobs-guide'],
  'for/restaurants': ['restaurant-reservations-guide', 'cafes-restaurants-regulars'],
  'for/real-estate': ['real-estate-enquiries'],
  'for/multi-location-retail': ['multi-location-retail-one-inbox', 'specialist-retail-receipts-accounts'],
  'for/ecommerce': ['online-store-wheres-my-order'],
  'solutions/marketing': ['local-business-marketing'],
  'solutions/bookings': ['gyms-fitness-studios', 'appointments-regulars-waitlist'],
  'product/booking': ['gyms-fitness-studios'],
  'product/jobs': ['cleaning-business-guide', 'trades-quotes-jobs-guide'],
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Everything an article says, whichever way it was written (Markdown body or
// the older intro + sections).
const textOf = (p: BlogPost) => p.content || JSON.stringify(p.sections || []) + (p.intro || '')

const card = (p: BlogPost): GuideCard => ({ slug: p.slug, title: p.title, cover: coverFor(p.slug, p.cover), category: p.category, readTime: p.readTime })

/** The newest industry guides, for the /industries hub. */
export function industryGuides(n = 6): GuideCard[] {
  return POSTS.filter(p => p.category === 'Industry guides').sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, n).map(card)
}

export function guidesFor(path: string, n = 3): GuideCard[] {
  const links = new RegExp(`\\]\\(/${escapeRe(path)}(?:[)#?])`)
  const bySlug = new Map(POSTS.map(p => [p.slug, p]))
  const picked = (PICKED_GUIDES[path] || []).map(s => bySlug.get(s)).filter((p): p is BlogPost => !!p)
  const linking = POSTS.filter(p => links.test(textOf(p))).sort((a, b) => (a.date < b.date ? 1 : -1))
  const seen = new Set<string>()
  const out: GuideCard[] = []
  for (const p of [...picked, ...linking]) {
    if (seen.has(p.slug)) continue
    seen.add(p.slug)
    out.push(card(p))
    if (out.length >= n) break
  }
  return out
}
