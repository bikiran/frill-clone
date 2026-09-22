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

    // Resolve the whole customer — every contact row that is the same person —
    // so a review/comment linked to ANY of their channel rows shows on ALL of
    // their threads (SMS, email, Messenger, Instagram, WhatsApp…). We union three
    // signals: the formal identity group, and — as a safety net for rows not yet
    // merged — contacts sharing this one's email or phone.
    const group = await linkedContacts(db, contactId).catch(() => [] as any[])
    const idSet = new Set<string>([contactId, ...group.map((c: any) => c.id)].filter(Boolean))
    const names = new Set<string>(group.map((c: any) => norm(c.name)).filter(Boolean))
    const metaSet = new Set<string>(group.map((c: any) => c.meta_user_id).filter(Boolean))
    const { data: me } = await db.from('contacts').select('name, email, phone, meta_user_id').eq('id', contactId).maybeSingle()
    if (me?.name) names.add(norm(me.name))
    if (me?.meta_user_id) metaSet.add(me.meta_user_id)
    // Safety-net: same email or same last-9 phone (formatting-agnostic on confirm).
    const digits = (v: any) => String(v || '').replace(/\D/g, '')
    const myEmail = String(me?.email || '').trim().toLowerCase()
    const myTail = digits(me?.phone).slice(-9)
    if (myEmail || myTail) {
      try {
        const ors: string[] = []
        if (myEmail) ors.push(`email.ilike.${myEmail.replace(/[,()]/g, ' ')}`)
        if (myTail) ors.push(`phone.ilike.%${myTail}%`)
        const { data: sameone } = await db.from('contacts')
          .select('id, name, phone, email, meta_user_id').eq('company_id', companyId).or(ors.join(',')).limit(50)
        for (const c of (sameone || [])) {
          const emailHit = myEmail && String(c.email || '').trim().toLowerCase() === myEmail
          const phoneHit = myTail && digits(c.phone).slice(-9) === myTail
          if (emailHit || phoneHit) { idSet.add(c.id); if (c.name) names.add(norm(c.name)); if (c.meta_user_id) metaSet.add(c.meta_user_id) }
        }
      } catch {}
    }
    const groupIds = Array.from(idSet)
    const metaIds = Array.from(metaSet)

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
    const nameSet = names
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

    // ── Social comments (Facebook/Instagram) left by this customer ────────────
    // Already-linked (contact_id in group) + confident auto-link by author_id ==
    // a group contact's meta_user_id (same id DMs are keyed on). Degrades to []
    // if the contact_id column doesn't exist yet (pre-V313).
    let socialComments: any[] = []
    try {
      const linkedComments: any[] = []
      const { data: cLinked } = await db.from('social_comments')
        .select('id, platform, author_name, message, external_post_id, external_comment_id, commented_at, post_id, contact_id')
        .eq('company_id', companyId).in('contact_id', groupIds.length ? groupIds : ['00000000-0000-0000-0000-000000000000'])
        .order('commented_at', { ascending: false }).limit(50)
      if (Array.isArray(cLinked)) linkedComments.push(...cLinked)

      if (metaIds.length) {
        const { data: byAuthor } = await db.from('social_comments')
          .select('id, platform, author_name, message, external_post_id, external_comment_id, commented_at, post_id, contact_id, author_id')
          .eq('company_id', companyId).in('author_id', metaIds).is('contact_id', null)
          .order('commented_at', { ascending: false }).limit(50)
        for (const c of (byAuthor || [])) {
          try {
            await db.from('social_comments').update({ contact_id: contactId }).eq('id', c.id).is('contact_id', null)
          } catch {}
          linkedComments.push({ ...c, contact_id: contactId })
        }
      }
      const seenC = new Set<string>()
      socialComments = linkedComments.filter((c: any) => (seenC.has(c.id) ? false : (seenC.add(c.id), true)))
        .map((c: any) => ({
          id: c.id, platform: c.platform, authorName: c.author_name, message: c.message,
          externalCommentId: c.external_comment_id, externalPostId: c.external_post_id, commentedAt: c.commented_at,
        }))
        .sort((a: any, b: any) => new Date(b.commentedAt || 0).getTime() - new Date(a.commentedAt || 0).getTime())
    } catch { socialComments = [] }

    const latestComment = socialComments[0] || null
    return NextResponse.json({ reviews: out, count: out.length, latest: out[0] || null, avg, socialComments, commentCount: socialComments.length, latestComment })
  } catch (e: any) {
    // Missing table/columns (migrations not run) → empty, never a hard failure.
    if (/does not exist|schema cache/i.test(e?.message || '')) return NextResponse.json({ reviews: [], count: 0, latest: null, avg: null })
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}
