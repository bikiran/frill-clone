// Has this customer already left the business a Google review? (server only)
//
// Used before any review request goes out, so a customer who has already
// reviewed isn't asked again. Matches the same way the inbox's Google-review
// badge does:
//   • a review linked to this contact, or to anyone who is the same person
//     (identity group, or another contact with the same email / mobile)
//   • an unlinked review whose reviewer name is this customer's full name
//     (two or more words, so "Sophie" alone never matches a stranger)

import { linkedContacts } from '@/lib/identity'

const norm = (s: any) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const digits = (v: any) => String(v || '').replace(/\D/g, '')

export type ExistingReview = { reviewed: boolean; rating?: number | null; at?: string | null; reviewId?: string }

export async function findCustomerGoogleReview(db: any, companyId: string, contactId: string | null | undefined): Promise<ExistingReview> {
  if (!companyId || !contactId) return { reviewed: false }
  try {
    const { data: me } = await db.from('contacts').select('id, name, email, phone').eq('id', contactId).eq('company_id', companyId).maybeSingle()
    if (!me) return { reviewed: false }

    const ids = new Set<string>([me.id])
    const names = new Set<string>()
    if (me.name) names.add(norm(me.name))
    try {
      for (const c of await linkedContacts(db, me.id)) { ids.add(c.id); if (c.name) names.add(norm(c.name)) }
    } catch {}
    const email = String(me.email || '').trim().toLowerCase()
    const tail = digits(me.phone).slice(-9)
    if (email || tail) {
      const ors: string[] = []
      if (email) ors.push(`email.ilike.${email.replace(/[,()]/g, ' ')}`)
      if (tail.length >= 8) ors.push(`phone.ilike.%${tail.slice(-3)}`)
      if (ors.length) {
        const { data: same } = await db.from('contacts').select('id, name, email, phone').eq('company_id', companyId).or(ors.join(',')).limit(200)
        for (const c of same || []) {
          const hit = (email && String(c.email || '').trim().toLowerCase() === email) || (tail.length >= 8 && digits(c.phone).slice(-9) === tail)
          if (hit) { ids.add(c.id); if (c.name) names.add(norm(c.name)) }
        }
      }
    }

    const shape = (r: any): ExistingReview => ({ reviewed: true, rating: r.star_rating ?? null, at: r.review_created_at ?? null, reviewId: r.id })

    const { data: linked } = await db.from('google_reviews').select('id, star_rating, review_created_at')
      .eq('company_id', companyId).in('contact_id', Array.from(ids))
      .order('review_created_at', { ascending: false }).limit(1)
    if (linked?.[0]) return shape(linked[0])

    const fullNames = Array.from(names).filter(n => n.split(' ').length >= 2)
    if (fullNames.length) {
      const { data: unlinked } = await db.from('google_reviews').select('id, reviewer_name, star_rating, review_created_at')
        .eq('company_id', companyId).is('contact_id', null)
        .order('review_created_at', { ascending: false }).limit(2000)
      const hit = (unlinked || []).find((r: any) => fullNames.includes(norm(r.reviewer_name)))
      if (hit) return shape(hit)
    }
  } catch { /* a failed check never blocks; the caller decides */ }
  return { reviewed: false }
}
