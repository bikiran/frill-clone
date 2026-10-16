import { NextRequest, NextResponse } from 'next/server'
import { adminDb, bump, companyForBoard, publicRows } from '@/lib/announcements-server'
import { isPublicNow, REACTIONS, sortForPublic, toPublicAnnouncement, visibleAtLocation } from '@/lib/announcements'
import { callerKey, checkBurst } from '@/lib/rate-limit'
import { callerUser } from '@/lib/company-access'

export const dynamic = 'force-dynamic'

// The public updates page and anything else a stranger reads.
//
// GET ?slug= | ?host= | ?companyId=  [&location=]
//   → { company, announcements: PublicAnnouncement[], ideas: { id: title } }
//   Only posts that are live now (published, or scheduled and due, and not
//   past their end date); only the public fields (lib/announcements.ts
//   toPublicAnnouncement), with the body cleaned to safe HTML. A private board
//   shows nothing to someone who isn't signed in to it.
// POST { id, action: 'view' | 'react' | 'unreact', reaction? }
//   Honest, cheap counters: the browser sends one view per post per visitor
//   (it remembers what it counted) and one of each reaction; the server only
//   counts live posts and limits each address.

export async function GET(req: NextRequest) {
  try {
    const db = adminDb()
    const sp = req.nextUrl.searchParams
    const company = await companyForBoard(db, { slug: sp.get('slug'), host: sp.get('host'), companyId: sp.get('companyId') })
    if (!company) return NextResponse.json({ company: null, announcements: [], ideas: {} })
    const publicCompany = { name: company.name, slug: company.slug, logo_url: company.logo_url, accent_color: company.accent_color }

    if (company.is_private) {
      const user = await callerUser(req, db)
      let member = false
      if (user) {
        const [{ data: own }, { data: tm }] = await Promise.all([
          db.from('companies').select('id').eq('id', company.id).eq('owner_id', user.id).maybeSingle(),
          db.from('team_members').select('id, status').eq('company_id', company.id).eq('user_id', user.id).limit(1),
        ])
        member = !!own || (tm || []).some((r: any) => String(r.status || '').toLowerCase() !== 'removed')
      }
      if (!member) return NextResponse.json({ company: publicCompany, private: true, announcements: [], ideas: {} }, { headers: { 'Cache-Control': 'private, no-store' } })
    }

    const location = sp.get('location')
    const rows = await publicRows(db, company.id)
    const posts = sortForPublic(rows.map(toPublicAnnouncement)).filter(p => !location || visibleAtLocation(p, location))
    // Titles of the roadmap ideas posts are linked to (public ideas only).
    const ideaIds = [...new Set(posts.map(p => p.idea_id).filter(Boolean))] as string[]
    const ideas: Record<string, string> = {}
    if (ideaIds.length) {
      const { data } = await db.from('ideas').select('id, title, is_private, company_id').in('id', ideaIds.slice(0, 100))
      for (const i of data || []) if (!i.is_private && i.company_id === company.id) ideas[i.id] = i.title
    }
    for (const p of posts) if (p.idea_id && !ideas[p.idea_id]) p.idea_id = null
    return NextResponse.json({ company: publicCompany, announcements: posts, ideas }, {
      headers: { 'Cache-Control': company.is_private ? 'private, no-store' : 'public, s-maxage=20, stale-while-revalidate=60' },
    })
  } catch (e: any) {
    return NextResponse.json({ error: 'Couldn’t load updates' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const db = adminDb()
    const b = await req.json().catch(() => ({}))
    const id = String(b.id || '')
    const action = String(b.action || '')
    if (!/^[0-9a-f-]{36}$/i.test(id) || !['view', 'react', 'unreact'].includes(action)) return NextResponse.json({ error: 'Bad request' }, { status: 400 })
    const reaction = action === 'view' ? null : String(b.reaction || '')
    if (reaction !== null && !REACTIONS.some(r => r.key === reaction)) return NextResponse.json({ error: 'Bad reaction' }, { status: 400 })
    // Per address: a handful a minute for each post, a sane total overall.
    const key = callerKey(req, 'ann')
    if (!checkBurst(`${key}:${id}:${action}`, action === 'view' ? 3 : 8) || !checkBurst(`${key}:all`, 120)) {
      return NextResponse.json({ ok: false, error: 'Slow down' }, { status: 429 })
    }
    const { data: a } = await db.from('announcements').select('*').eq('id', id).maybeSingle()
    if (!a || !isPublicNow(a)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (action === 'view') {
      await bump(db, id, 'views', 1)
      return NextResponse.json({ ok: true })
    }
    await bump(db, id, 'reaction', action === 'react' ? 1 : -1, reaction!)
    const { data: fresh } = await db.from('announcements').select('reactions').eq('id', id).maybeSingle()
    return NextResponse.json({ ok: true, reactions: toPublicAnnouncement({ ...a, reactions: fresh?.reactions ?? a.reactions }).reactions })
  } catch (e: any) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
