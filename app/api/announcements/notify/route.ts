import { NextRequest, NextResponse } from 'next/server'
import { requireCompanyAccess } from '@/lib/company-access'
import { checkBurst } from '@/lib/rate-limit'
import { adminDb, loadOwned } from '@/lib/announcements-server'
import { isPublicNow } from '@/lib/announcements'
import { claimNotify, notifyAnnouncement, NOTIFY_PER_HOUR, recentNotifyCount } from '@/lib/announcement-notify'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// POST { announcementId, companyId, board?: boolean, email?: boolean }
// "Publish & notify": board bell notifications and opted-in customer emails for
// one LIVE post (lib/announcement-notify.ts).
//
// Staff of the post's workspace only. Once per post (notified_at is claimed
// atomically, so a double click or the scheduler can't send twice), at most
// NOTIFY_PER_HOUR posts per workspace an hour, and a short burst limit per
// person. Drafts, scheduled and expired posts are refused.
export async function POST(req: NextRequest) {
  try {
    const db = adminDb()
    const b = await req.json().catch(() => ({}))
    const companyId = String(b.companyId || '')
    const id = String(b.announcementId || '')
    if (!companyId || !id) return NextResponse.json({ error: 'Missing announcementId or companyId' }, { status: 400 })
    const access = await requireCompanyAccess(req, db, companyId)
    if (!access.ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })

    const a = await loadOwned(db, companyId, id)
    if (!a) return NextResponse.json({ error: 'Announcement not found' }, { status: 404 })
    if (!isPublicNow(a)) return NextResponse.json({ error: 'Only a published announcement can be sent. Publish it first.' }, { status: 409 })
    if (a.notified_at) return NextResponse.json({ error: 'People were already notified about this announcement.' }, { status: 409 })

    const board = b.board !== false
    const email = b.email !== false
    if (!board && !email) return NextResponse.json({ error: 'Pick at least one way to notify' }, { status: 400 })

    if (!checkBurst(`ann-notify:${access.userId}`, 5)) return NextResponse.json({ error: 'Too many requests. Please wait a minute.' }, { status: 429, headers: { 'Retry-After': '60' } })
    if (await recentNotifyCount(db, companyId) >= NOTIFY_PER_HOUR) {
      return NextResponse.json({ error: `You can notify about ${NOTIFY_PER_HOUR} announcements an hour. Try again a bit later.` }, { status: 429, headers: { 'Retry-After': '900' } })
    }
    if (!(await claimNotify(db, a.id))) return NextResponse.json({ error: 'People were already notified about this announcement.' }, { status: 409 })

    const siteBase = (process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com').replace(/\/$/, '')
    const r = await notifyAnnouncement(db, a, { board, email, siteBase })
    // Nothing went out and something failed: free the post to try again.
    if (r.board === 0 && r.email === 0 && r.errors.length) {
      await db.from('announcements').update({ notified_at: null }).eq('id', a.id)
    }
    return NextResponse.json({ ok: true, inAppCount: r.board, emailCount: r.email, emailSkipped: r.emailSkipped, emailMatched: r.emailMatched, errors: r.errors })
  } catch (err: any) {
    console.error('announcement notify error:', err?.message)
    return NextResponse.json({ error: 'Couldn’t send notifications' }, { status: 500 })
  }
}

// GET ?companyId&announcementId → how many would get it (for the confirm step).
export async function GET(req: NextRequest) {
  try {
    const db = adminDb()
    const companyId = req.nextUrl.searchParams.get('companyId') || ''
    const id = req.nextUrl.searchParams.get('announcementId') || ''
    const access = await requireCompanyAccess(req, db, companyId)
    if (!access.ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    const a = await loadOwned(db, companyId, id)
    if (!a) return NextResponse.json({ error: 'Announcement not found' }, { status: 404 })
    if (!checkBurst(`ann-notify-count:${access.userId}`, 20)) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    const { boardRecipients, emailRecipients } = await import('@/lib/announcement-notify')
    const [boardIds, em] = await Promise.all([boardRecipients(db, companyId, a.idea_id), emailRecipients(companyId, a)])
    return NextResponse.json({ board: boardIds.length, email: em.recipients.length, emailSkipped: em.skipped, emailReady: !!process.env.RESEND_API_KEY, notifiedAt: a.notified_at || null })
  } catch (e: any) {
    return NextResponse.json({ error: 'Couldn’t count' }, { status: 500 })
  }
}
