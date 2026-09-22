import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { linkedContacts } from '@/lib/identity'

export const dynamic = 'force-dynamic'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Is the caller a member (owner or team member) of this company? Guards against
// reading another tenant's reviews.
async function callerInCompany(req: NextRequest, db: any, companyId: string): Promise<boolean> {
  try {
    const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
    if (!token) return false
    const { data } = await db.auth.getUser(token)
    const uid = data?.user?.id
    if (!uid) return false
    const { data: owned } = await db.from('companies').select('id').eq('id', companyId).eq('owner_id', uid).maybeSingle()
    if (owned) return true
    const { data: mem } = await db.from('team_members').select('id').eq('company_id', companyId).eq('user_id', uid).limit(1)
    return !!(mem && mem.length)
  } catch { return false }
}

const norm = (s: any) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

// GET ?contactId=&companyId= — Google reviews left by THIS customer, for the
// contact info panel. Returns reviews already linked to the contact (or anyone
// in their identity group), and opportunistically CONFIDENT-auto-links unlinked
// reviews whose reviewer name uniquely matches this contact's name (no other
// contact in the workspace shares that name). Ambiguous matches are left for the
// manual "Link" action on the reviews dashboard.
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams
    const contactId = sp.get('contactId') || ''
    const companyId = sp.get('companyId') || ''
    if (!contactId || !companyId) return NextResponse.json({ error: 'contactId and companyId required' }, { status: 400 })

    const db = admin()
    if (!(await callerInCompany(req, db, companyId))) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })

    // The contact + everyone in their identity group (so a review linked to any
    // merged duplicate still surfaces here).
    const group = await linkedContacts(db, contactId).catch(() => [] as any[])
    const groupIds = Array.from(new Set([contactId, ...group.map((c: any) => c.id)].filter(Boolean)))
    const names = Array.from(new Set(group.map((c: any) => norm(c.name)).filter(Boolean)))
    // The active contact's own name (linkedContacts may not include it).
    const { data: me } = await db.from('contacts').select('name').eq('id', contactId).maybeSingle()
    if (me?.name) names.push(norm(me.name))

    // Pull this company's reviews once; split into "already ours" and candidates.
    const { data: reviews } = await db.from('google_reviews')
      .select('id, review_id, reviewer_name, star_rating, comment, review_created_at, contact_id')
      .eq('company_id', companyId)
      .order('review_created_at', { ascending: false })
      .limit(2000)
    const all = reviews || []

    const linked = all.filter((r: any) => r.contact_id && groupIds.includes(r.contact_id))

    // Confident auto-link: an unlinked review whose reviewer name matches one of
    // our names, AND no OTHER contact in the workspace has that same name.
    const nameSet = new Set(names.filter(Boolean))
    for (const r of all) {
      if (r.contact_id) continue
      const rn = norm(r.reviewer_name)
      if (!rn || !nameSet.has(rn)) continue
      // Uniqueness check — count contacts in this company with this name.
      const { data: sameName } = await db.from('contacts')
        .select('id').eq('company_id', companyId).ilike('name', String(r.reviewer_name || '').trim()).limit(5)
      const others = (sameName || []).filter((c: any) => !groupIds.includes(c.id))
      if (others.length > 0) continue   // ambiguous — leave for manual confirm
      const { data: upd } = await db.from('google_reviews')
        .update({ contact_id: contactId, contact_name: me?.name || null, match_checked_at: new Date().toISOString() })
        .eq('id', r.id).is('contact_id', null)
        .select('id, review_id, reviewer_name, star_rating, comment, review_created_at, contact_id')
      if (Array.isArray(upd) && upd.length) linked.push(upd[0])
    }

    // De-dupe + shape.
    const seen = new Set<string>()
    const out = linked.filter((r: any) => (seen.has(r.id) ? false : (seen.add(r.id), true)))
      .map((r: any) => ({
        id: r.id, reviewId: r.review_id, reviewerName: r.reviewer_name,
        rating: r.star_rating, comment: r.comment, createdAt: r.review_created_at,
      }))
      .sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())

    const rated = out.filter((r: any) => r.rating > 0)
    const avg = rated.length ? Math.round((rated.reduce((s: number, r: any) => s + r.rating, 0) / rated.length) * 10) / 10 : null
    return NextResponse.json({ reviews: out, count: out.length, latest: out[0] || null, avg })
  } catch (e: any) {
    // Missing table/columns (migrations not run) → empty, never a hard failure.
    if (/does not exist|schema cache/i.test(e?.message || '')) return NextResponse.json({ reviews: [], count: 0, latest: null, avg: null })
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}
