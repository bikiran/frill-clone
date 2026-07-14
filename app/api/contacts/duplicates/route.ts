import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// Last 8 digits — handles +61478…, 0478…, 478… all being the same phone.
const normPhone = (p: string) => (p || '').replace(/\D/g, '').slice(-8)
const normEmail = (e: string) => (e || '').trim().toLowerCase()

/**
 * Find contacts that are obviously the same person.
 *
 * Only matches on things that genuinely identify someone — email or phone.
 * Name alone is NOT enough: two different Bikirans would be wrongly merged, and
 * silently combining two real customers' histories is much worse than leaving a
 * duplicate in the list.
 */
export async function GET(req: NextRequest) {
  try {
    const companyId = req.nextUrl.searchParams.get('companyId')
    if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 })
    const db = admin()

    const { data: contacts } = await db.from('contacts')
      .select('id, name, email, phone, created_at')
      .eq('company_id', companyId).limit(2000)

    const byEmail: Record<string, any[]> = {}
    const byPhone: Record<string, any[]> = {}

    for (const c of contacts || []) {
      const e = normEmail(c.email)
      const p = normPhone(c.phone)
      if (e) (byEmail[e] ||= []).push(c)
      if (p) (byPhone[p] ||= []).push(c)
    }

    // Group anything sharing an email or a phone.
    const groups: any[][] = []
    const seen = new Set<string>()

    const collect = (bucket: Record<string, any[]>, kind: string) => {
      for (const [key, list] of Object.entries(bucket)) {
        if (list.length < 2) continue
        const fresh = list.filter(c => !seen.has(c.id))
        if (fresh.length < 2) continue
        for (const c of fresh) seen.add(c.id)
        groups.push(fresh.map(c => ({ ...c, matched_on: kind, matched_value: key })))
      }
    }
    collect(byEmail, 'email')
    collect(byPhone, 'phone')

    // Count conversations so the UI can show what would be merged.
    for (const g of groups) {
      for (const c of g) {
        const { count } = await db.from('conversations')
          .select('*', { count: 'exact', head: true }).eq('contact_id', c.id)
        c.conversation_count = count || 0
      }
    }

    return NextResponse.json({ groups, total: groups.length })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

/**
 * Merge duplicates into one contact.
 *
 * Everything is MOVED, never deleted: conversations, carts, calendar events and
 * saved cards all re-point at the surviving contact. The customer's history is
 * preserved intact — losing a conversation would be far worse than a duplicate.
 */
export async function POST(req: NextRequest) {
  try {
    const { companyId, keepId, mergeIds } = await req.json()
    if (!companyId || !keepId || !Array.isArray(mergeIds) || !mergeIds.length) {
      return NextResponse.json({ error: 'companyId, keepId and mergeIds are required' }, { status: 400 })
    }
    if (mergeIds.includes(keepId)) {
      return NextResponse.json({ error: 'The surviving contact cannot also be merged away' }, { status: 400 })
    }

    const db = admin()

    const { data: keep } = await db.from('contacts').select('*').eq('id', keepId).maybeSingle()
    if (!keep) return NextResponse.json({ error: 'Contact to keep not found' }, { status: 404 })

    const { data: others } = await db.from('contacts').select('*').in('id', mergeIds)

    // Fill any gaps on the surviving contact from the duplicates — never
    // overwrite a value that's already there.
    const patch: any = {}
    for (const o of others || []) {
      for (const f of ['name', 'email', 'phone', 'address', 'stripe_customer_id']) {
        if (!keep[f] && o[f] && !patch[f]) patch[f] = o[f]
      }
    }
    if (Object.keys(patch).length) {
      await db.from('contacts').update(patch).eq('id', keepId)
    }

    // Re-point everything that references the duplicates.
    const moves: Record<string, number> = {}
    const tables: Array<[string, string]> = [
      ['conversations', 'contact_id'],
      ['abandoned_carts', 'contact_id'],
      ['calendar_events', 'contact_id'],
      ['saved_cards', 'contact_id'],
      ['media_requests', 'contact_id'],
      ['support_tickets', 'contact_id'],
      ['ai_coupons', 'contact_id'],
    ]
    for (const [table, col] of tables) {
      try {
        const { data } = await db.from(table).update({ [col]: keepId }).in(col, mergeIds).select('id')
        moves[table] = data?.length || 0
      } catch { /* table may not exist in every deployment */ }
    }

    // Only now remove the empty duplicates.
    await db.from('contacts').delete().in('id', mergeIds)

    return NextResponse.json({ ok: true, moved: moves, merged: mergeIds.length })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
