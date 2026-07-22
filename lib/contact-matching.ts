import { supabase } from '@/lib/supabase'

/**
 * Find other contact records that look like the same person.
 *
 * The same human often lands in Colvy more than once — once from an order, once
 * from the widget, once from a promo capture — so classifying one of them
 * (say, as a supplier) leaves the duplicates still labelled as customers.
 *
 * Matching is deliberately conservative: email, or the last 9 digits of a phone
 * number (which makes 0455… and +61455… the same person). Name is only used as
 * a tie-breaker alongside one of those, never on its own — two different people
 * genuinely can share a name.
 */
export interface MatchableContact {
  id: string
  name?: string | null
  email?: string | null
  phone?: string | null
  source?: string | null
  relationship_type?: string | null
}

const digits = (v?: string | null) => (v || '').replace(/\D/g, '')

export async function findMatchingContacts(
  companyId: string,
  contact: MatchableContact
): Promise<MatchableContact[]> {
  const email = (contact.email || '').trim().toLowerCase()
  const tail = digits(contact.phone).slice(-9)
  if (!email && !tail) return []

  const found = new Map<string, MatchableContact>()
  const cols = 'id, name, email, phone, source, relationship_type'

  // Ask the database rather than scanning a page of contacts — a company can
  // easily have more rows than a single query returns.
  if (email) {
    try {
      const { data } = await (supabase as any).from('contacts')
        .select(cols).eq('company_id', companyId).ilike('email', email).limit(50)
      for (const c of (data || [])) if (c.id !== contact.id) found.set(c.id, c)
    } catch { /* ignore */ }
  }
  if (tail) {
    try {
      const { data } = await (supabase as any).from('contacts')
        .select(cols).eq('company_id', companyId).ilike('phone', `%${tail}%`).limit(50)
      for (const c of (data || [])) {
        if (c.id === contact.id) continue
        // Confirm the tail really matches rather than appearing mid-number.
        if (digits(c.phone).endsWith(tail)) found.set(c.id, c)
      }
    } catch { /* ignore */ }
  }

  return Array.from(found.values())
}

/**
 * Apply a relationship type to a set of contacts. Non-customers are excluded
 * from marketing, matching what happens when a contact is created.
 */
export async function applyRelationship(
  ids: string[],
  relationship: string
): Promise<{ updated: number; error?: string }> {
  if (ids.length === 0) return { updated: 0 }
  const isCustomer = relationship === 'customer'
  const patch: any = { relationship_type: relationship }
  if (!isCustomer) patch.subscribed_to_marketing = false
  try {
    const { error } = await (supabase as any).from('contacts').update(patch).in('id', ids)
    if (error) return { updated: 0, error: error.message }
    return { updated: ids.length }
  } catch (e: any) {
    return { updated: 0, error: e.message }
  }
}
